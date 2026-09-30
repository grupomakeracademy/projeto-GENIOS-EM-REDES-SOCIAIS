import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { liveReviewDestination, preserveLiveImagesForReview } from './helpers/review-test-images';

loadEnvConfig(process.cwd());

test('CTA contextual e composição rica do Geninhos em uma única geração', async ({ page }) => {
  test.skip(process.env.LIVE_CTA_CONTEXTUAL_TEST !== '1', 'Executar somente uma geração real autorizada.');
  test.setTimeout(900_000);
  const target = liveReviewDestination();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } });
  const email = `cta-contextual-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('base64url');
  let userId = '', workspaceId = '';
  try {
    const source = await db.from('agents').select('*').eq('id', target.agentId)
      .eq('workspace_id', target.workspaceId).single();
    expect(source.error).toBeNull();
    const linked = source.data!.visual_settings?.reference_ids as string[] || [];
    const exact = await db.from('assets').select('*').in('id', linked)
      .eq('category', 'exact_asset').eq('asset_subtype', 'logo').single();
    expect(exact.error).toBeNull();
    expect(exact.data!.placement).toBe('bottom_left');

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
      approval_required: true,
      channels: ['instagram'],
    }).eq('id', agent.id)).error).toBeNull();

    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);

    const cta = 'Conheça o acompanhamento personalizado do Geninhos';
    const instruction = 'Peça educativa do Geninhos para pais e responsáveis: compare matrícula passiva com acompanhamento personalizado. Mostre uma criança do Ensino Fundamental aprendendo em casa com apoio de um professor de IA na tela e um responsável acompanhando. Organize quatro benefícios em cards com ícones: entender a dúvida, explicação individual, exercício no próprio ritmo e evolução acompanhada. Use a identidade visual, o briefing e os textos do agente. Título editorial: CADA DÚVIDA MERECE ATENÇÃO. Inclua o CTA editorial "Conheça o acompanhamento personalizado do Geninhos" no rodapé direito, com o Asset Exato oficial no rodapé esquerdo. Composição rica, hierarquia clara, sem logotipo ou mascote gerado pela IA.';
    const response = await page.evaluate(async ({ agentId, instruction, cta }) => {
      const result = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, instruction, cta, channels: ['instagram'],
          publication_type: 'feed', image_count: 1, image_quality: 'low', idempotency_key: crypto.randomUUID() }) });
      return { status: result.status, data: await result.json() };
    }, { agentId: agent.id, instruction, cta });
    expect(response.status, JSON.stringify(response.data)).toBe(202);
    const jobId = response.data.job.id as string;
    await expect.poll(async () => {
      const job = (await db.from('background_jobs').select('status,last_error').eq('id', jobId).single()).data!;
      if (job.status === 'FAILED') throw new Error(job.last_error);
      return job.status;
    }, { timeout: 600_000, intervals: [3000, 5000] }).toBe('COMPLETED');

    const run = (await db.from('agent_runs').select('content_id').eq('job_id', jobId).single()).data!;
    const variant = (await db.from('content_variants').select('id,aspect_ratio,cta')
      .eq('content_id', run.content_id).single()).data!;
    expect(variant.aspect_ratio).toBe('4:5');
    expect(variant.cta).toBeTruthy();
    const media = (await db.from('content_media').select('id,storage_path,generation_prompt')
      .eq('variant_id', variant.id).single()).data!;
    expect(media.generation_prompt).toContain('footer, put it only on the RIGHT');
    expect(media.generation_prompt).toContain('organized cards, icons, secondary details or interfaces');
    expect(media.generation_prompt).toContain(cta);
    const downloaded = await db.storage.from('brand-assets').download(media.storage_path);
    expect(downloaded.error).toBeNull();
    const finalBytes = Buffer.from(await downloaded.data!.arrayBuffer());
    const dimensions = await sharp(finalBytes).metadata();
    expect(dimensions.width! * 5).toBe(dimensions.height! * 4);
    const original = await db.storage.from('brand-assets').download(
      `workspace/${workspaceId}/content/${jobId}/${variant.id}-0-original.png`);
    expect(original.error).toBeNull();
    expect(finalBytes.equals(Buffer.from(await original.data!.arrayBuffer()))).toBe(false);
    await mkdir('test-results/cta-contextual-live', { recursive: true });
    await writeFile(`test-results/cta-contextual-live/${jobId}.png`, finalBytes);
    expect(await preserveLiveImagesForReview(db, workspaceId)).toBe(1);
    const review = await db.from('content_items').select('status').eq('workspace_id', target.workspaceId)
      .eq('strategy->>qa_source_media_id', media.id).single();
    expect(review.data?.status).toBe('AWAITING_REVIEW');
    console.log('[CTA contextual live]', { jobId, reviewStatus: review.data?.status,
      image: `test-results/cta-contextual-live/${jobId}.png` });
  } finally {
    if (workspaceId) {
      await preserveLiveImagesForReview(db, workspaceId);
      const media = (await db.from('content_media').select('storage_path').eq('workspace_id', workspaceId)).data || [];
      const paths = media.map(row => row.storage_path).filter(Boolean);
      if (paths.length) await db.storage.from('brand-assets').remove(paths);
      await db.from('agent_runs').delete().eq('workspace_id', workspaceId);
      await db.from('background_jobs').delete().eq('workspace_id', workspaceId);
      await db.from('workspaces').delete().eq('id', workspaceId);
    }
    if (userId) await db.auth.admin.deleteUser(userId);
  }
});
