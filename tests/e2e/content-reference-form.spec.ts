import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';

loadEnvConfig(process.cwd());

test('formulário limita pauta, reaproveita referência e preserva rascunho', async ({ page }) => {
  test.setTimeout(180_000);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } });
  const email = `reference-form-${randomUUID()}@example.test`;
  const password = randomBytes(30).toString('base64url');
  let userId: string | undefined;
  let workspaceId: string | undefined;
  let storagePath: string | undefined;
  try {
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { full_name: 'Teste Formulário', test_fixture: true } });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } });
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const onboard = await client.rpc('complete_onboarding', { company: 'QA Referência Formulário',
      agent_name: 'Agente de teste', config: { audience: 'Público de teste', channels: ['instagram'] },
      tz: 'America/Sao_Paulo' });
    expect(onboard.error).toBeNull();
    workspaceId = onboard.data;
    const agent = await db.from('agents').select('id,visual_settings').eq('workspace_id', workspaceId).single();
    expect(agent.error).toBeNull();
    const png = await sharp({ create: { width: 40, height: 50, channels: 3, background: '#315ac7' } }).png().toBuffer();
    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    const upload = await page.evaluate(async (encoded) => {
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      const form = new FormData();
      form.set('file', new File([bytes], 'referencia-existente.png', { type: 'image/png' }));
      form.set('category', 'reference');
      const response = await fetch('/api/assets', { method: 'POST', body: form });
      return { status: response.status, data: await response.json() };
    }, png.toString('base64'));
    expect(upload.status).toBe(200);
    const assetId = upload.data.id as string;
    const asset = await db.from('assets').select('storage_path').eq('id', assetId).single();
    expect(asset.error).toBeNull();
    storagePath = asset.data!.storage_path;
    expect((await db.from('assets').update({ processing_status: 'processed',
      summary_text: 'Estilo editorial em azul.', processed_at: new Date().toISOString() }).eq('id', assetId)).error).toBeNull();
    expect((await db.from('agents').update({ visual_settings: { ...agent.data!.visual_settings, reference_ids: [assetId] } })
      .eq('id', agent.data!.id)).error).toBeNull();
    await page.goto('/contents');
    await page.getByRole('button', { name: /Novo conteúdo/ }).first().click();
    await page.getByRole('button', { name: 'Diminuir imagens' }).click();
    const field = page.locator('textarea[name="instruction"]');
    await field.fill('A'.repeat(2000));
    await expect(page.locator('#content-instruction-counter')).toHaveText('2000 / 2000');
    await field.fill('B'.repeat(2001));
    await expect(field).toHaveValue('A'.repeat(2000));
    await expect(page.getByText('A pauta deve ter no máximo 2.000 caracteres.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gerar agora' })).toBeDisabled();
    await field.fill('Cena nova, independente do conteúdo anterior.');
    await expect(page.locator('#content-instruction-counter')).toHaveText('45 / 2000');

    await page.locator('#content-reference').selectOption(assetId);
    await expect(page.locator('.new-content-reference-preview img')).toBeVisible();
    await expect(page.locator('.total-consumption-badge strong')).toHaveText('2');
    await page.getByRole('button', { name: 'Remover referência' }).click();
    await expect(page.locator('.total-consumption-badge strong')).toHaveText('1');
    await page.locator('#content-reference').selectOption(assetId);
    await expect(page.locator('#content-reference-summary')).toHaveValue('Estilo editorial em azul.');

    const overLimit = await page.evaluate(async (agentId) => {
      const body = { agent_id: agentId, instruction: 'x'.repeat(2001), channels: ['instagram'], image_count: 1 };
      const [draft, magic] = await Promise.all([
        fetch('/api/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        fetch('/api/ai/magic-prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'instruction', text: 'x'.repeat(2001), agent_id: agentId }) }),
      ]);
      return { draft: draft.status, magic: magic.status };
    }, agent.data!.id);
    expect(overLimit).toEqual({ draft: 400, magic: 400 });
    await page.getByRole('button', { name: 'Salvar como rascunho' }).click();
    await expect.poll(async () => {
      const result = await db.from('content_items').select('strategy').eq('workspace_id', workspaceId!)
        .eq('status', 'DRAFT').eq('created_by', userId!).limit(1).maybeSingle();
      return result.data?.strategy?.reference_asset_id;
    }).toBe(assetId);
  } finally {
    if (storagePath) await db.storage.from('brand-assets').remove([storagePath]);
    if (workspaceId) await db.from('workspaces').delete().eq('id', workspaceId);
    if (userId) await db.auth.admin.deleteUser(userId);
  }
});
