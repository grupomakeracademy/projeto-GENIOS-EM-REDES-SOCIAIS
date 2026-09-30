import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';

loadEnvConfig(process.cwd());

test('referência independente por dia permanece pendente até execução e cota semanal muda', async ({ page }) => {
  test.setTimeout(120_000);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } });
  const email = `routine-reference-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('base64url');
  let userId = '', workspaceId = '';
  try {
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { test_fixture: true } });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } });
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const onboard = await client.rpc('complete_onboarding', { company: 'Geninhos QA', agent_name: 'Geninhos QA',
      config: { audience: 'Pais e estudantes', channels: ['instagram'] }, tz: 'America/Sao_Paulo' });
    expect(onboard.error).toBeNull();
    workspaceId = onboard.data;
    const agent = (await db.from('agents').select('id').eq('workspace_id', workspaceId).single()).data!;

    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto('/agents');
    await page.getByRole('tab', { name: 'Rotina', exact: true }).click();
    await expect(page.locator('.total-consumption-badge')).toContainText('5');

    const image = await sharp({ create: { width: 540, height: 960, channels: 3, background: '#2458a2' } }).png().toBuffer();
    const monday = page.locator('.routine-day-reference').first();
    await monday.locator('input[type=file]').setInputFiles({ name: 'geninhos-referencia.png', mimeType: 'image/png', buffer: image });
    await expect(monday.locator('.routine-day-reference-preview')).toContainText('geninhos-referencia.png');
    await expect(page.locator('.total-consumption-badge')).toContainText('6');
    const saved = page.waitForResponse(response => response.url().endsWith('/api/agents') &&
      response.request().postDataJSON()?.action === 'schedule');
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    expect((await saved).status()).toBe(200);
    const row = (await db.from('agents').select('routine_settings').eq('id', agent.id).single()).data!;
    const referenceId = row.routine_settings.weekday_settings['1'].reference_asset_id as string;
    expect(referenceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.routine_settings.weekday_settings['2']?.reference_asset_id).toBeUndefined();
    const asset = (await db.from('assets').select('processing_status,asset_subtype,summary_text')
      .eq('id', referenceId).single()).data!;
    expect(asset).toMatchObject({ processing_status: 'pending', asset_subtype: 'content_reference_staged' });
    expect(asset.summary_text).toBeNull();
    await page.reload();
    await page.getByRole('tab', { name: 'Rotina', exact: true }).click();
    await expect(page.locator('.routine-day-reference').first()).toContainText('geninhos-referencia.png');
    await expect(page.locator('.total-consumption-badge')).toContainText('6');
    const library = await page.evaluate(async agentId => {
      const response = await fetch(`/api/assets?agent_id=${agentId}`);
      return response.json();
    }, agent.id);
    expect(library.items.some((item: { id: string }) => item.id === referenceId)).toBe(false);
    expect((await db.from('assets').update({ processing_status: 'processed', asset_subtype: null,
      summary_text: 'Referência visual de teste' }).eq('id', referenceId)).error).toBeNull();
    await page.reload();
    await page.getByRole('tab', { name: 'Rotina', exact: true }).click();
    const tuesday = page.locator('.routine-day-reference').nth(1);
    await tuesday.locator('details summary').click();
    const option = tuesday.getByRole('option', { name: 'geninhos-referencia.png' });
    await expect(option.locator('img')).toBeVisible();
    await option.click();
    await expect(tuesday.locator('.routine-day-reference-preview')).toContainText('geninhos-referencia.png');
    await expect(page.locator('.total-consumption-badge')).toContainText('7');
  } finally {
    if (workspaceId) {
      const paths = (await db.from('assets').select('storage_path').eq('workspace_id', workspaceId)).data || [];
      if (paths.length) await db.storage.from('brand-assets').remove(paths.map(row => row.storage_path));
      await db.from('workspaces').delete().eq('id', workspaceId);
    }
    if (userId) await db.auth.admin.deleteUser(userId);
  }
});
