import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { DateTime } from 'luxon';
import sharp from 'sharp';
import { liveReviewDestination, preserveLiveImagesForReview } from './helpers/review-test-images';

loadEnvConfig(process.cwd());

test('Geninhos: referência do dia só é processada na execução, reutilizada na rotina e imagem final é íntegra', async ({ page }) => {
  test.skip(process.env.LIVE_ROUTINE_REFERENCE_TEST !== '1', 'Geração real exige execução explícita.');
  test.setTimeout(900_000);
  const target = liveReviewDestination();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } });
  const email = `routine-reference-live-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('base64url');
  let userId = '', workspaceId = '';
  try {
    const source = await db.from('agents').select('*').eq('id', target.agentId).eq('workspace_id', target.workspaceId).single();
    expect(source.error).toBeNull();
    const linked = source.data!.visual_settings?.reference_ids as string[] || [];
    const visual = await db.from('assets').select('*').eq('workspace_id', target.workspaceId)
      .in('id', linked).eq('category', 'reference').eq('processing_status', 'processed').limit(1).single();
    expect(visual.error).toBeNull();
    const exact = await db.from('assets').select('*').in('id', linked)
      .eq('category', 'exact_asset').eq('asset_subtype', 'logo').single();
    expect(exact.error).toBeNull();
    const sourceImage = await db.storage.from('brand-assets').download(visual.data!.storage_path);
    expect(sourceImage.error).toBeNull();
    const referenceBytes = Buffer.from(await sourceImage.data!.arrayBuffer());
    const exactImage = await db.storage.from('brand-assets').download(exact.data!.storage_path);
    expect(exactImage.error).toBeNull();
    const exactBytes = Buffer.from(await exactImage.data!.arrayBuffer());

    const created = await db.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { test_fixture: true } });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } });
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const onboard = await client.rpc('complete_onboarding', { company: source.data!.name,
      agent_name: source.data!.name, config: { audience: source.data!.briefing?.audience || 'Pais e responsáveis',
        channels: ['instagram'] }, tz: 'America/Sao_Paulo' });
    expect(onboard.error).toBeNull();
    workspaceId = onboard.data;
    const agent = (await db.from('agents').select('id').eq('workspace_id', workspaceId).single()).data!;
    expect((await db.from('agents').update({
      briefing: source.data!.briefing,
      text_settings: Object.fromEntries(Object.entries(source.data!.text_settings || {}).filter(([key]) => key !== 'ai_configs')),
      visual_settings: { ...source.data!.visual_settings, reference_ids: [exact.data!.id] },
      content_language: source.data!.content_language,
      research_enabled: false,
      channels: ['instagram'],
      routine_settings: { image_style: 'Disney / Pixar', instruction: '', channels: ['instagram'], image_quality: 'low',
        image_count: 1, is_carousel: false, cta: 'Conheça o acompanhamento personalizado do Geninhos.',
        destination: 'feed', publication_type: 'feed', weekday_settings: {} },
    }).eq('id', agent.id)).error).toBeNull();

    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto('/agents');
    await page.getByRole('tab', { name: 'Rotina', exact: true }).click();
    await page.getByRole('button', { name: 'Todos (1 a 7)', exact: true }).click();
    const targetRatio = process.env.LIVE_FINAL_RATIO === '9:16' || process.env.LIVE_FINAL_RATIO === '16:9'
      ? process.env.LIVE_FINAL_RATIO : '4:5';
    if (targetRatio === '9:16') {
      await page.getByRole('group', { name: 'Tipo de publicação da rotina' }).getByRole('button', { name: 'Stories' }).click();
    } else if (targetRatio === '16:9') {
      await page.getByRole('checkbox', { name: 'X 16:9' }).click();
      await page.getByRole('checkbox', { name: 'Instagram 4:5' }).click();
    }
    const weekday = DateTime.now().setZone('America/Sao_Paulo').weekday;
    const day = page.locator('.routine-day-reference').nth(weekday - 1);
    const instruction = targetRatio === '9:16'
      ? 'Mostre mãe e filha do Ensino Fundamental estudando juntas em casa, enquanto um professor de IA ajuda a filha a entender uma dúvida de ciências na tela do tablet. Título editorial: ACOMPANHAR TAMBÉM É APRENDER. Visual 3D/cartoon acolhedor, azul-marinho, amarelo e branco, claro para pais e responsáveis.'
      : targetRatio === '16:9'
        ? 'Mostre uma professora em sala de aula ajudando estudantes do Ensino Fundamental a resolver uma atividade, com apoio de um professor de IA no quadro digital. Título editorial: CADA DÚVIDA MERECE ATENÇÃO. Visual 3D/cartoon acolhedor, azul-marinho, amarelo e branco, claro para pais e responsáveis.'
        : 'Mostre um estudante do Ensino Fundamental estudando em casa e tirando uma dúvida de matemática com apoio de um professor de IA do Geninhos. O mascote azul o acompanha. Título editorial: APRENDER NO SEU RITMO COM O GENINHOS. Visual 3D/cartoon, azul-marinho, amarelo e branco, acolhedor e claro para pais e responsáveis.';
    await page.getByPlaceholder('Descreva a orientação persistente para os conteúdos desta rotina...').fill(instruction);
    await day.locator('input[type=file]').setInputFiles({ name: visual.data!.name,
      mimeType: visual.data!.mime_type, buffer: referenceBytes });
    await expect(day.locator('.routine-day-reference-preview')).toContainText(visual.data!.name);
    const saved = page.waitForResponse(response => response.url().endsWith('/api/agents') &&
      response.request().postDataJSON()?.action === 'schedule');
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    expect((await saved).status()).toBe(200);
    const settings = (await db.from('agents').select('routine_settings').eq('id', agent.id).single()).data!.routine_settings;
    const referenceId = settings.weekday_settings[String(weekday)].reference_asset_id as string;
    const pending = (await db.from('assets').select('processing_status,summary_text,asset_subtype')
      .eq('id', referenceId).single()).data!;
    expect(pending).toMatchObject({ processing_status: 'pending', summary_text: null, asset_subtype: 'content_reference_staged' });

    const response = page.waitForResponse(result => result.url().endsWith('/api/runs') && result.request().method() === 'POST');
    await page.getByRole('button', { name: 'Executar agora', exact: true }).click();
    const runResponse = await response;
    expect(runResponse.status(), await runResponse.text()).toBe(202);
    const firstJobId = (await runResponse.json()).job.id as string;
    async function waitAndInspect(jobId: string, expectedRatio: string) {
      await expect.poll(async () => {
        const job = (await db.from('background_jobs').select('status,last_error').eq('id', jobId).single()).data!;
        if (job.status === 'FAILED') throw new Error(job.last_error);
        return job.status;
      }, { timeout: 600_000, intervals: [3000, 5000] }).toBe('COMPLETED');
      const run = (await db.from('agent_runs').select('content_id').eq('job_id', jobId).single()).data!;
      const content = (await db.from('content_items').select('status').eq('id', run.content_id).single()).data!;
      expect(['ROUTINE', 'AWAITING_REVIEW']).toContain(content.status);
      const debits = await db.from('quota_transactions').select('amount,balance_before,balance_after')
        .eq('job_id', jobId).eq('type', 'CONSUMPTION');
      expect(debits.error).toBeNull();
      expect(debits.data).toHaveLength(1);
      expect(debits.data![0].amount).toBe(-2);
      expect(debits.data![0].balance_before - debits.data![0].balance_after).toBe(2);
      const variant = (await db.from('content_variants').select('id,aspect_ratio').eq('content_id', run.content_id).single()).data!;
      expect(variant.aspect_ratio).toBe(expectedRatio);
      const media = (await db.from('content_media').select('storage_path,generation_prompt').eq('variant_id', variant.id).single()).data!;
      const requestedTitle = instruction.match(/Título editorial: ([^.]+)/)?.[1];
      expect(requestedTitle).toBeTruthy();
      expect(media.generation_prompt).toContain(requestedTitle);
      const downloaded = await db.storage.from('brand-assets').download(media.storage_path);
      expect(downloaded.error).toBeNull();
      const bytes = Buffer.from(await downloaded.data!.arrayBuffer());
      const dimensions = await sharp(bytes).metadata();
      const [width, height] = expectedRatio.split(':').map(Number);
      expect(dimensions.width! * height).toBe(dimensions.height! * width);
      const originalPath = `workspace/${workspaceId}/content/${jobId}/${variant.id}-0-original.png`;
      const original = await db.storage.from('brand-assets').download(originalPath);
      expect(original.error).toBeNull();
      const rawBytes = Buffer.from(await original.data!.arrayBuffer());
      const rawDimensions = await sharp(rawBytes).metadata();
      expect([rawDimensions.width, rawDimensions.height]).toEqual([dimensions.width, dimensions.height]);
      const overlay = await sharp(exactBytes).resize({ width: Math.round(dimensions.width! * exact.data!.scale_percent / 100) }).toBuffer();
      const overlayDimensions = await sharp(overlay).metadata();
      const left = Math.round(dimensions.width! * 0.05);
      const top = dimensions.height! - overlayDimensions.height! - Math.round(dimensions.height! * 0.05);
      const expected = await sharp(rawBytes).composite([{ input: overlay, left, top }]).png().toBuffer();
      expect(bytes).toEqual(expected);
      await mkdir('test-results/routine-reference-live', { recursive: true });
      await writeFile(`test-results/routine-reference-live/${jobId}.png`, bytes);
      return run.content_id as string;
    }
    await waitAndInspect(firstJobId, targetRatio);
    const processed = (await db.from('assets').select('processing_status,summary_text,asset_subtype,processed_at')
      .eq('id', referenceId).single()).data!;
    expect(processed.processing_status).toBe('processed');
    expect(processed.summary_text).toBeTruthy();
    expect(processed.asset_subtype).toBeNull();
    if (process.env.LIVE_SKIP_SCHEDULE === '1') return;

    await page.reload();
    await page.getByRole('tab', { name: 'Rotina', exact: true }).click();
    const due = DateTime.now().setZone('America/Sao_Paulo').plus({ minutes: 2 }).startOf('minute');
    await page.locator('.routine-activation-toggle').click();
    await page.locator('.agent-modern-time-picker select').nth(0).selectOption(due.toFormat('HH'));
    await page.locator('.agent-modern-time-picker select').nth(1).selectOption(due.toFormat('mm'));
    const scheduledDay = page.locator('.routine-day-reference').nth(due.weekday - 1);
    if (due.weekday !== weekday) {
      await scheduledDay.locator('details summary').click();
      await scheduledDay.getByRole('option', { name: visual.data!.name }).click();
    }
    const scheduleResponse = page.waitForResponse(result => result.url().endsWith('/api/agents') &&
      result.request().postDataJSON()?.action === 'schedule');
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    expect((await scheduleResponse).status()).toBe(200);
    const firstProcessedAt = processed.processed_at;
    let scheduledId = '';
    await expect.poll(async () => {
      const jobs = await db.from('background_jobs').select('id').eq('workspace_id', workspaceId)
        .eq('payload->>origin', 'routine').neq('id', firstJobId)
        .order('scheduled_at', { ascending: false }).limit(1);
      expect(jobs.error).toBeNull();
      scheduledId = jobs.data?.[0]?.id || '';
      return Boolean(scheduledId);
    }, { timeout: 210_000, intervals: [3000] }).toBe(true);
    expect(scheduledId).not.toBe(firstJobId);
    await waitAndInspect(scheduledId, targetRatio);
    const afterSchedule = (await db.from('assets').select('processed_at').eq('id', referenceId).single()).data!;
    expect(afterSchedule.processed_at).toBe(firstProcessedAt);
    await db.from('agent_schedules').update({ enabled: false }).eq('agent_id', agent.id);
  } finally {
    if (workspaceId) {
      await db.from('agent_schedules').update({ enabled: false }).eq('workspace_id', workspaceId);
      await preserveLiveImagesForReview(db, workspaceId);
      const assets = (await db.from('assets').select('storage_path').eq('workspace_id', workspaceId)).data || [];
      const media = (await db.from('content_media').select('storage_path').eq('workspace_id', workspaceId)).data || [];
      const paths = [...assets, ...media].map(item => item.storage_path).filter(Boolean);
      if (paths.length) await db.storage.from('brand-assets').remove(paths);
      await db.from('agent_runs').delete().eq('workspace_id', workspaceId);
      await db.from('background_jobs').delete().eq('workspace_id', workspaceId);
      await db.from('workspaces').delete().eq('id', workspaceId);
    }
    if (userId) await db.auth.admin.deleteUser(userId);
  }
});
