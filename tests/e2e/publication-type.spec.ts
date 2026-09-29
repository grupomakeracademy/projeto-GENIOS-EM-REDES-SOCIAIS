import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { preserveLiveImagesForReview } from './helpers/review-test-images';

loadEnvConfig(process.cwd());

test('Feed e Stories usam a mesma regra no conteúdo e na rotina', async ({ page }) => {
  const liveImages = ['1', 'feed', 'schedule'].includes(process.env.LIVE_STORIES_TEST || '');
  test.skip(liveImages && (!process.env.LIVE_TEST_REVIEW_WORKSPACE_ID || !process.env.LIVE_TEST_REVIEW_AGENT_ID ||
    !process.env.LIVE_TEST_REVIEW_USER_ID), 'Configure o destino de Revisão antes de gerar imagens reais.');
  test.setTimeout(['1', 'feed', 'schedule'].includes(process.env.LIVE_STORIES_TEST || '') ? 1_200_000 : 180_000);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } });
  const email = `publication-qa-${randomUUID()}@example.test`;
  const password = randomBytes(30).toString('base64url');
  let userId: string | undefined, workspaceId: string | undefined;
  try {
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { full_name: 'Teste Publicação', test_fixture: true } });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } });
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const onboard = await client.rpc('complete_onboarding', { company: 'QA Publicação', agent_name: 'Agente QA',
      config: { audience: 'Público de teste', channels: ['instagram'] }, tz: 'America/Sao_Paulo' });
    expect(onboard.error).toBeNull();
    workspaceId = onboard.data;
    const agent = (await db.from('agents').select('id').eq('workspace_id', workspaceId).single()).data!;
    expect((await db.from('agents').update({ research_enabled: false,
      briefing: { company: 'QA Publicação', audience: 'Público de teste', segment: 'Educação' } })
      .eq('id', agent.id)).error).toBeNull();

    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto('/contents');
    await page.getByRole('button', { name: /Novo conteúdo/ }).first().click();
    const form = page.locator('.new-content-form');
    const type = form.getByRole('group', { name: 'Tipo de publicação' });
    await expect(type.getByRole('button', { name: 'Feed' })).toHaveClass(/active/);
    await expect(form.getByRole('checkbox')).toHaveCount(6);
    await form.getByRole('checkbox', { name: /LinkedIn/ }).click();
    await type.getByRole('button', { name: 'Stories' }).click();
    await expect(form.getByRole('checkbox')).toHaveCount(4);
    await expect(form.getByRole('checkbox', { name: /LinkedIn|X 16:9/ })).toHaveCount(0);
    await expect(form.getByRole('checkbox', { name: /Instagram 9:16/ })).toBeVisible();
    await expect(form.getByRole('checkbox', { name: /WhatsApp Status.*9:16/ })).toBeVisible();
    await type.getByRole('button', { name: 'Feed' }).click();
    await expect(form.getByRole('checkbox')).toHaveCount(6);
    await expect(form.getByRole('checkbox', { name: /LinkedIn/ })).not.toBeChecked();
    await type.getByRole('button', { name: 'Stories' }).click();
    await form.getByRole('button', { name: 'Diminuir imagens' }).click();
    await form.locator('textarea[name="instruction"]').fill('Uma professora segura um livro azul em uma biblioteca clara.');
    await form.getByRole('button', { name: 'Salvar como rascunho' }).click();
    await expect.poll(async () => (await db.from('content_items').select('id').eq('workspace_id', workspaceId!)
      .eq('status', 'DRAFT')).data?.length || 0).toBe(1);
    const draft = (await db.from('content_items').select('id,strategy,content_variants(channel,aspect_ratio)')
      .eq('workspace_id', workspaceId).eq('status', 'DRAFT').single()).data!;
    expect(draft.strategy.publication_type).toBe('stories');
    expect(draft.content_variants).toMatchObject([{ channel: 'instagram', aspect_ratio: '9:16' }]);
    await page.goto(`/contents/${draft.id}`);
    await page.getByRole('button', { name: 'Revisar Conteúdo' }).first().click();
    await expect(page.getByRole('group', { name: 'Tipo de publicação' }).getByRole('button', { name: 'Stories' })).toHaveClass(/active/);

    const rejected = await page.evaluate(async (agentId) => {
      const send = async (path: string, body: Record<string, unknown>) =>
        (await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status;
      return {
        x: await send('/api/runs', { agent_id: agentId, publication_type: 'stories', channels: ['x'], image_count: 1,
          idempotency_key: crypto.randomUUID() }),
        linkedin: await send('/api/content', { agent_id: agentId, publication_type: 'stories', channels: ['linkedin'], image_count: 1 }),
      };
    }, agent.id);
    expect(rejected).toEqual({ x: 400, linkedin: 400 });

    await page.goto('/agents');
    await page.getByRole('tab', { name: 'Rotina', exact: true }).click();
    const routineType = page.getByRole('group', { name: 'Tipo de publicação da rotina' });
    await routineType.getByRole('button', { name: 'Stories' }).click();
    await expect(page.getByRole('checkbox', { name: /Instagram 9:16/ })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /LinkedIn|X 16:9/ })).toHaveCount(0);
    const saved = page.waitForResponse(r => r.url().endsWith('/api/agents') && r.request().method() === 'POST'
      && r.request().postDataJSON()?.routine_settings?.publication_type === 'stories');
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    expect((await saved).status()).toBe(200);
    const settings = (await db.from('agents').select('routine_settings').eq('id', agent.id).single()).data!.routine_settings;
    expect(settings).toMatchObject({ publication_type: 'stories', channels: ['instagram'], destination: 'stories' });
    const currentAgent = (await db.from('agents').select('*').eq('id', agent.id).single()).data!;
    const invalidRoutine = await page.evaluate(async (data) => {
      const response = await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, routine_settings: { ...data.routine_settings, publication_type: 'stories',
          channels: ['linkedin'], destination: 'stories' } }) });
      return response.status;
    }, currentAgent);
    expect(invalidRoutine).toBe(400);
    await page.reload();
    await page.getByRole('tab', { name: 'Rotina', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Tipo de publicação da rotina' }).getByRole('button', { name: 'Stories' })).toHaveClass(/active/);

    if (['1', 'feed', 'schedule'].includes(process.env.LIVE_STORIES_TEST || '')) {
      const waitImage = async (jobId: string, expectedType: 'feed' | 'stories') => {
        await expect.poll(async () => {
          const job = (await db.from('background_jobs').select('status,last_error').eq('id', jobId).single()).data!;
          if (job.status === 'FAILED') throw new Error(`Job ${jobId}: ${job.last_error}`);
          return job.status;
        }, { timeout: 420_000, intervals: [2000, 5000] }).toBe('COMPLETED');
        const content = (await db.from('content_items').select('strategy').eq('id', jobId).single()).data!;
        expect(content.strategy.publication_type).toBe(expectedType);
        const variant = (await db.from('content_variants').select('id,channel,aspect_ratio').eq('content_id', jobId).single()).data!;
        expect(variant.channel).toBe('instagram');
        expect(variant.aspect_ratio).toBe(expectedType === 'stories' ? '9:16' : '4:5');
        const media = (await db.from('content_media').select('storage_path,aspect_ratio,generation_prompt')
          .eq('variant_id', variant.id).single()).data!;
        expect(media.aspect_ratio).toBe(variant.aspect_ratio);
        expect(media.generation_prompt).toContain(variant.aspect_ratio);
        const image = await db.storage.from('brand-assets').download(media.storage_path);
        expect(image.error).toBeNull();
        const dimensions = await sharp(Buffer.from(await image.data!.arrayBuffer())).metadata();
        expect(dimensions.width && dimensions.height).toBeTruthy();
        const [widthRatio, heightRatio] = variant.aspect_ratio.split(':').map(Number);
        expect(dimensions.width! * heightRatio).toBe(dimensions.height! * widthRatio);
        console.log('PUBLICATION_IMAGE', expectedType, variant.aspect_ratio, `${dimensions.width}x${dimensions.height}`);
      };
      if (process.env.LIVE_STORIES_TEST === '1') {
        const runRoutine = page.waitForResponse(r => r.url().endsWith('/api/runs') && r.request().method() === 'POST');
        await page.getByRole('button', { name: 'Executar agora', exact: true }).click();
        const routineResponse = await runRoutine;
        expect(routineResponse.status()).toBe(202);
        await waitImage((await routineResponse.json()).job.id, 'stories');
      }

      if (process.env.LIVE_STORIES_TEST === 'schedule') {
        const { DateTime } = await import('luxon');
        const due = DateTime.now().setZone('America/Sao_Paulo').plus({ minutes: 1 }).startOf('minute');
        await page.locator('.routine-activation-toggle').click();
        await page.getByRole('button', { name: 'Limpar', exact: true }).click();
        await page.locator('.agent-weekday-chip').nth(due.weekday - 1).click();
        await page.locator('.agent-modern-time-picker select').nth(0).selectOption(due.toFormat('HH'));
        await page.locator('.agent-modern-time-picker select').nth(1).selectOption(due.toFormat('mm'));
        const scheduleSaved = page.waitForResponse(r => r.url().endsWith('/api/agents')
          && r.request().postDataJSON()?.action === 'schedule');
        await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
        expect((await scheduleSaved).status()).toBe(200);
        const schedule = (await db.from('agent_schedules').select('id,enabled,timezone,next_run_at')
          .eq('agent_id', agent.id).single()).data!;
        expect(schedule.enabled).toBe(true);
        expect(schedule.timezone).toBe('America/Sao_Paulo');
        const scheduledSettings = (await db.from('agents').select('routine_settings').eq('id', agent.id).single()).data!.routine_settings;
        expect(scheduledSettings.publication_type).toBe('stories');
        let scheduledId = '';
        await expect.poll(async () => {
          const jobs = await db.from('background_jobs').select('id').eq('workspace_id', workspaceId!)
            .eq('payload->>origin', 'routine');
          scheduledId = jobs.data?.[0]?.id || '';
          return Boolean(scheduledId);
        }, { timeout: 210_000, intervals: [3000] }).toBe(true);
        const scheduledJob = (await db.from('background_jobs').select('payload').eq('id', scheduledId).single()).data!;
        expect(scheduledJob.payload.publication_type).toBe('stories');
        await waitImage(scheduledId, 'stories');
        await db.from('agent_schedules').update({ enabled: false }).eq('id', schedule.id);
      }

      if (process.env.LIVE_STORIES_TEST !== 'schedule') {
      await page.goto('/contents');
      await page.getByRole('button', { name: /Novo conteúdo/ }).first().click();
      const newForm = page.locator('.new-content-form');
      await newForm.getByRole('group', { name: 'Tipo de publicação' }).getByRole('button', { name: 'Feed' }).click();
      await newForm.getByRole('button', { name: 'Diminuir imagens' }).click();
      const runFeed = page.waitForResponse(r => r.url().endsWith('/api/runs') && r.request().method() === 'POST');
      await newForm.getByRole('button', { name: 'Gerar agora' }).click();
      const feedResponse = await runFeed;
      expect(feedResponse.status()).toBe(202);
      await waitImage((await feedResponse.json()).job.id, 'feed');
      }
    }
  } finally {
    if (workspaceId) {
      await db.from('agent_schedules').update({ enabled: false }).eq('workspace_id', workspaceId);
      if (liveImages) await preserveLiveImagesForReview(db, workspaceId);
      const variants = await db.from('content_variants').select('id').eq('workspace_id', workspaceId);
      const ids = (variants.data || []).map(variant => variant.id);
      if (ids.length) {
        const media = await db.from('content_media').select('variant_id,position,storage_path').in('variant_id', ids);
        const paths = [...new Set((media.data || []).flatMap(item => [item.storage_path,
          item.storage_path.replace(/\/[^/]+$/, `/${item.variant_id}-${item.position}-original.png`)]))];
        if (paths.length) await db.storage.from('brand-assets').remove(paths);
      }
      await db.from('workspaces').delete().eq('id', workspaceId);
    }
    if (userId) await db.auth.admin.deleteUser(userId);
  }
});
