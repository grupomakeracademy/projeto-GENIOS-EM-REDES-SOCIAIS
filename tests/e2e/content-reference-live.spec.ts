import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

loadEnvConfig(process.cwd());

test('pauta e imagem de referência: análise única, geração real e cota dobrada', async ({ page }) => {
  test.skip(process.env.LIVE_CONTENT_REFERENCE_TEST !== '1', 'Execute explicitamente com LIVE_CONTENT_REFERENCE_TEST=1.');
  test.setTimeout(600_000);
  page.setDefaultTimeout(30_000);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } });
  const email = `reference-qa-${randomUUID()}@example.test`;
  const password = randomBytes(30).toString('base64url');
  let userId: string | undefined;
  let workspaceId: string | undefined;
  try {
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { full_name: 'Teste Referência', test_fixture: true } });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } });
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const onboard = await client.rpc('complete_onboarding', { company: 'QA Referência',
      agent_name: 'Agente de referência', config: { audience: 'Teste controlado', channels: ['instagram'] },
      tz: 'America/Sao_Paulo' });
    expect(onboard.error).toBeNull();
    workspaceId = onboard.data;
    const agentResult = await db.from('agents').select('id').eq('workspace_id', workspaceId).single();
    expect(agentResult.error).toBeNull();
    const agentId = agentResult.data!.id;
    const initialBalance = await db.from('profiles').select('content_quota_balance').eq('id', userId).single();
    expect(initialBalance.error).toBeNull();
    expect(initialBalance.data!.content_quota_balance).toBeGreaterThanOrEqual(2);

    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto('/contents');
    await page.getByRole('button', { name: /Novo conteúdo/ }).first().click();
    await expect(page.getByText('Imagem de referência', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Diminuir imagens' }).click();
    const instruction = 'Uma pessoa lendo um livro azul em uma biblioteca iluminada, com um gato deitado no colo. Manter o estilo visual da referência, mas representar esta cena específica.';
    await page.locator('textarea[name="instruction"]').fill(instruction);
    await expect(page.locator('#content-instruction-counter')).toContainText(`${instruction.length} / 2000`);
    const png = await sharp({ create: { width: 80, height: 100, channels: 3, background: '#2860bf' } }).png().toBuffer();
    await page.locator('.new-content-reference-upload input[type="file"]').setInputFiles({
      name: 'qa-reference.png', mimeType: 'image/png', buffer: png,
    });
    await expect(page.locator('#content-reference option', { hasText: 'qa-reference.png' })).toHaveCount(1, { timeout: 180_000 });
    await expect(page.locator('.new-content-reference-preview img')).toBeVisible();
    const assetId = await page.locator('#content-reference').inputValue();
    const assetBefore = await db.from('assets').select('id,processing_status,summary_text,processed_at,storage_path')
      .eq('id', assetId).single();
    expect(assetBefore.error).toBeNull();
    expect(assetBefore.data!.processing_status).toBe('processed');
    expect(assetBefore.data!.summary_text).toBeTruthy();
    const agent = await db.from('agents').select('visual_settings').eq('id', agentId).single();
    expect(agent.data!.visual_settings.reference_ids).toContain(assetId);
    const editedSummary = `${assetBefore.data!.summary_text}\nDireção revisada: tons azuis e composição editorial limpa.`;
    await page.locator('#content-reference-summary').fill(editedSummary);
    await page.getByRole('button', { name: 'Salvar descrição' }).click();
    await expect(page.locator('#content-reference-summary')).toHaveValue(editedSummary);

    await page.getByRole('button', { name: 'Remover referência' }).click();
    await expect(page.locator('#content-reference')).toHaveValue('');
    await expect(page.locator('.total-consumption-badge strong')).toHaveText('1');
    await page.locator('#content-reference').selectOption(assetId);
    await expect(page.locator('#content-reference-summary')).toHaveValue(editedSummary);
    await expect(page.locator('.total-consumption-badge strong')).toHaveText('2');

    const draft = await page.evaluate(async ({ agentId, assetId, instruction }) => {
      const response = await fetch('/api/content', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, reference_asset_id: assetId, instruction,
          channels: ['instagram'], image_count: 1, image_quality: 'low' }) });
      return { status: response.status, data: await response.json() };
    }, { agentId, assetId, instruction });
    expect(draft.status).toBe(200);
    const savedDraft = await db.from('content_items').select('strategy').eq('id', draft.data.id).single();
    expect(savedDraft.data!.strategy.reference_asset_id).toBe(assetId);
    expect(savedDraft.data!.strategy.instruction).toBe(instruction);

    const overLimit = await page.evaluate(async ({ agentId }) => {
      const response = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, instruction: 'x'.repeat(2001), channels: ['instagram'],
          image_count: 1, image_quality: 'low', idempotency_key: crypto.randomUUID() }) });
      return response.status;
    }, { agentId });
    expect(overLimit).toBe(400);

    const [runResponse] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/api/runs') && r.request().method() === 'POST' && r.status() === 202),
      page.getByRole('button', { name: 'Gerar agora' }).click(),
    ]);
    const jobId = (await runResponse.json()).job.id as string;
    await expect.poll(async () => {
      const job = await db.from('background_jobs').select('status,last_error').eq('id', jobId).single();
      if (job.data?.status === 'FAILED') throw new Error(`Geração falhou: ${job.data.last_error}`);
      return job.data?.status;
    }, { timeout: 360_000, intervals: [1000, 3000, 5000] }).toBe('COMPLETED');

    const job = await db.from('background_jobs').select('payload').eq('id', jobId).single();
    expect(job.error).toBeNull();
    expect(job.data!.payload.reference_asset_id).toBe(assetId);
    expect(job.data!.payload.reference_summary).toBe(editedSummary);
    const run = await db.from('agent_runs').select('content_id').eq('job_id', jobId).single();
    expect(run.error).toBeNull();
    const variant = await db.from('content_variants').select('id,channel').eq('content_id', run.data!.content_id).single();
    expect(variant.error).toBeNull();
    expect(variant.data!.channel).toBe('instagram');
    const media = await db.from('content_media').select('storage_path,generation_prompt').eq('variant_id', variant.data!.id).single();
    expect(media.error).toBeNull();
    expect(media.data!.generation_prompt).toContain(instruction);
    expect(media.data!.generation_prompt).toContain('Direção revisada: tons azuis');
    const image = await db.storage.from('brand-assets').download(media.data!.storage_path);
    expect(image.error).toBeNull();
    await mkdir('test-results/content-reference', { recursive: true });
    await writeFile('test-results/content-reference/generated.png', Buffer.from(await image.data!.arrayBuffer()));
    const assetAfter = await db.from('assets').select('processed_at,summary_text').eq('id', assetId).single();
    expect(assetAfter.data!.processed_at).toBe(assetBefore.data!.processed_at);
    expect(assetAfter.data!.summary_text).toBe(editedSummary);
    const finalBalance = await db.from('profiles').select('content_quota_balance').eq('id', userId).single();
    expect(initialBalance.data!.content_quota_balance - finalBalance.data!.content_quota_balance).toBe(2);
  } finally {
    if (workspaceId) {
      const assets = await db.from('assets').select('storage_path').eq('workspace_id', workspaceId);
      const media = await db.from('content_media').select('storage_path').eq('workspace_id', workspaceId);
      const paths = [...(assets.data || []), ...(media.data || [])].map(row => row.storage_path).filter(Boolean);
      if (paths.length) await db.storage.from('brand-assets').remove(paths);
      await db.from('agent_runs').delete().eq('workspace_id', workspaceId);
      await db.from('background_jobs').delete().eq('workspace_id', workspaceId);
      await db.from('workspaces').delete().eq('id', workspaceId);
    }
    if (userId) await db.auth.admin.deleteUser(userId);
  }
});
