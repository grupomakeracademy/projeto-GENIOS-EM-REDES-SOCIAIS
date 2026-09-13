import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
loadEnvConfig(process.cwd());
test('agent channels UX and exclusive AI administration', async ({ page }) => {
  test.setTimeout(180000);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  let uid: string | undefined, wid: string | undefined;
  try {
    const email = `qa-ai-${randomUUID()}@example.test`,
      password = randomBytes(24).toString('base64url');
    const user = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_fixture: true },
    });
    expect(user.error).toBeNull();
    uid = user.data.user!.id;
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const workspace = await client.rpc('complete_onboarding', {
      company: 'QA IA',
      agent_name: 'QA Agente',
      config: { audience: 'Público QA', channels: ['instagram'] },
      tz: 'America/Sao_Paulo',
    });
    expect(workspace.error).toBeNull();
    wid = workspace.data;
    const agent = await db.from('agents').select('*').eq('workspace_id', wid).single();
    expect(agent.error).toBeNull();
    const id = agent.data!.id;
    const login = async () => {
      await page.goto('/login');
      await page.getByLabel('E-mail', { exact: true }).fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page).toHaveURL(/dashboard/, { timeout: 20000 });
    };
    await login();
    await page.goto('/agents');
    await page.getByRole('tab', { name: 'Canais', exact: true }).click();
    await expect(page.getByText('Adapte a comunicação para cada canal')).toBeVisible();
    await expect(page.getByLabel('Orientações do canal', { exact: true })).toHaveCount(6);
    await expect(page.locator('main .check svg')).toHaveCount(6);
    await page.screenshot({path:'test-results/agent-channels.png',fullPage:true});
    const saveBox = await page
      .getByRole('button', { name: 'Salvar alterações', exact: true })
      .boundingBox();
    const cardBox = await page.locator('main > .card').last().boundingBox();
    if (cardBox && saveBox)
      expect(saveBox.x + saveBox.width).toBeGreaterThan(cardBox.x + cardBox.width * 0.8);
    await page.getByRole('tab', { name: 'Texto', exact: true }).click();
    await expect(page.getByText('Prompt Mágico', { exact: true })).toHaveCount(0);
    const post = async (path: string, body: unknown) =>
      page.evaluate(
        async ({ path, body }) => {
          const r = await fetch(`/api/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          return { status: r.status, body: await r.json() };
        },
        { path, body },
      );
    expect((await post('agents', { action: 'magic', id })).status).toBe(400);
    expect(
      (
        await post('agents', {
          id,
          text_settings: { ai_configs: { text: { provider: 'openai', model: 'gpt-4.1' } } },
        })
      ).status,
    ).toBe(403);
    for (const body of [
      { action: 'save', configs: [] },
      { action: 'restore', confirm: true },
    ])
      expect((await post(`agents/${id}/ai`, body)).status).toBe(403);
    await page.getByRole('tab', { name: 'IA', exact: true }).click();
    await expect(
      page.getByRole('checkbox', { name: 'Personalizar para este agente' }).first(),
    ).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Acesso Restrito' })).toBeVisible({
      timeout: 12000,
    });
    await expect(page.getByRole('dialog').getByRole('link')).toHaveAttribute(
      'href',
      'https://wa.me/5519988788759',
    );
    await page.screenshot({path:'test-results/agent-access.png',fullPage:true});
    await page.getByRole('button', { name: 'Entendi', exact: true }).click();
    await expect(page.locator('.agent-ai-blurred')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar alterações', exact: true })).toHaveCount(
      0,
    );
    expect(
      (await db.auth.admin.updateUserById(uid, { app_metadata: { super_admin: true } })).error,
    ).toBeNull();
    await page.reload();
    await page.getByRole('tab', { name: 'IA', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Salvar alterações', exact: true }),
    ).toBeVisible();
    const textCard = page
      .locator('fieldset')
      .filter({ has: page.locator('legend', { hasText: 'Modelo de Texto' }) });
    await textCard.getByRole('checkbox', { name: 'Personalizar para este agente' }).check();
    await textCard.getByLabel('ID do modelo', { exact: true }).fill('definitely-invalid-model');
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expect(page.getByText('Modelo inválido ou indisponível para esta API Key.')).toBeVisible({
      timeout: 25000,
    });
    await textCard.getByLabel('ID do modelo', { exact: true }).fill('gpt-4.1-mini');
    // Server-only test credential is submitted once and never printed in assertions.
    if (process.env.OPENAI_API_KEY)
      await textCard.getByLabel('API Key', { exact: true }).fill(process.env.OPENAI_API_KEY);
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expect(page.getByText('Configurações validadas e salvas.')).toBeVisible({
      timeout: 25000,
    });
    await expect(textCard.getByLabel('API Key', { exact: true })).toHaveValue('');
    const saved = await db
      .from('agent_ai_configs')
      .select('enabled,credential_ciphertext,configured_by')
      .eq('agent_id', id)
      .single();
    expect(saved.error).toBeNull();
    expect(saved.data!.enabled).toBe(true);
    expect(saved.data!.configured_by === uid).toBe(true);
    if (process.env.OPENAI_API_KEY)
      expect(saved.data!.credential_ciphertext !== process.env.OPENAI_API_KEY).toBe(true);
    const publicConfig = await page.evaluate(
      async (id) => (await fetch(`/api/agents/${id}/ai`)).json(),
      id,
    );
    expect(publicConfig.configs[0].credential_ciphertext === undefined).toBe(true);
    expect(
      JSON.stringify(publicConfig).includes(process.env.OPENAI_API_KEY || 'unlikely-secret'),
    ).toBe(false);
    expect(
      (await db.auth.admin.updateUserById(uid, { app_metadata: { super_admin: false } })).error,
    ).toBeNull();
    await page.reload();
    await page.getByRole('tab', { name: 'IA', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Acesso Restrito' })).toBeVisible({
      timeout: 12000,
    });
    await expect(page.getByRole('dialog')).toContainText('gerenciada pelo Administrador');
    await expect(page.getByRole('dialog')).not.toContainText('contratar');
    await page.getByRole('button', { name: 'Entendi' }).click();
    expect(
      (await db.auth.admin.updateUserById(uid, { app_metadata: { super_admin: true } })).error,
    ).toBeNull();
    await page.reload();
    await page.getByRole('tab', { name: 'IA', exact: true }).click();
    await page.getByRole('button', { name: 'Restaurar padrão do sistema', exact: true }).click();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(
      (await db.from('agent_ai_configs').select('purpose').eq('agent_id', id)).data,
    ).toHaveLength(1);
    await page.getByRole('button', { name: 'Restaurar padrão do sistema', exact: true }).click();
    await page.getByRole('button', { name: 'Restaurar padrão', exact: true }).click();
    await expect(page.getByText('Padrão do sistema restaurado.')).toBeVisible();
    expect(
      (await db.from('agent_ai_configs').select('purpose').eq('agent_id', id)).data,
    ).toHaveLength(0);
    expect(
      (await db.from('agents').select('briefing').eq('id', id).single()).data!.briefing,
    ).toEqual(agent.data!.briefing);
  } finally {
    if (wid) expect((await db.from('workspaces').delete().eq('id', wid)).error).toBeNull();
    if (uid) expect((await db.auth.admin.deleteUser(uid)).error).toBeNull();
  }
});
