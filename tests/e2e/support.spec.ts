import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
loadEnvConfig(process.cwd());
test('support and AI settings work on desktop and mobile with real persistence', async ({
  page,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(15000);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const email = `genios-ui-${randomUUID()}@example.test`,
    password = randomBytes(30).toString('base64url');
  let uid: string | undefined, wid: string | undefined;
  try {
    const user = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_fixture: true, full_name: 'Pessoa de teste visual' },
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
      company: 'QA · Central de Suporte',
      agent_name: 'QA Gênio',
      config: { audience: 'Público de teste', channels: ['instagram'] },
      tz: 'America/Sao_Paulo',
    });
    expect(workspace.error).toBeNull();
    wid = workspace.data;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto('/settings');
    await expect(
      page.locator('.credential-indicator.present').filter({ hasText: 'OpenAI' }),
    ).toContainText('Configurada no servidor');
    await expect(page.locator('.model-card select').nth(1)).toHaveValue('gpt-4.1');
    await expect(page.locator('.model-card select').nth(3)).toHaveValue('gpt-4.1-mini');
    await expect(page.locator('.model-card select').nth(5)).toHaveValue('gpt-image-2.5-flare');
    await expect(page.locator('.model-card select').nth(7)).toHaveValue('text-embedding-3-small');
    await page.goto('/support');
    await expect(page.getByText('Você ainda não abriu nenhum chamado.')).toBeVisible();
    await page.getByRole('button', { name: 'Novo chamado', exact: true }).click();
    await page.getByRole('combobox', { name: 'Categoria', exact: true }).selectOption('erro_tecnico');
    await page.getByLabel('Assunto', { exact: true }).fill('Validação visual do atendimento');
    await page
      .getByLabel('Mensagem', { exact: true })
      .fill('Conferindo o fluxo de atendimento da plataforma.');
    await page.getByRole('button', { name: 'Criar chamado', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Validação visual do atendimento' }),
    ).toBeVisible();
    await expect(page.getByText('Chamado criado com sucesso.')).toBeVisible();
    await page
      .getByLabel('Sua mensagem', { exact: true })
      .fill('Conversa de teste com persistência.');
    await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
    await expect(
      page.locator('.support-message').filter({ hasText: 'Conversa de teste com persistência.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Assumir chamado', exact: true }).click();
    await expect(page.getByText('Atendido por: Pessoa de teste visual')).toBeVisible();
    await mkdir('../../outputs/qa', { recursive: true });
    await page.screenshot({ path: '../../outputs/qa/suporte-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.locator('.support-list')).not.toBeVisible();
    await expect(page.locator('.support-conversation')).toBeVisible();
    await page.screenshot({ path: '../../outputs/qa/suporte-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Voltar aos chamados' }).click();
    await expect(page.locator('.support-list')).toBeVisible();
  } finally {
    if (wid) expect((await db.from('workspaces').delete().eq('id', wid)).error).toBeNull();
    if (uid) expect((await db.auth.admin.deleteUser(uid)).error).toBeNull();
  }
});
