import { test, expect } from '@playwright/test';
test('private dashboard requires authentication', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
});
test('login remains usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('signup requires the complete profile and matching passwords', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();

  const fields = page.locator('.auth-form form input');
  await expect(fields).toHaveCount(4);
  await expect(fields.nth(0)).toHaveAttribute('name', 'fullName');
  await expect(fields.nth(1)).toHaveAttribute('name', 'email');
  await expect(fields.nth(2)).toHaveAttribute('name', 'password');
  await expect(fields.nth(3)).toHaveAttribute('name', 'confirmPassword');

  const submit = page.getByRole('button', { name: 'Criar conta', exact: true });
  await expect(submit).toBeDisabled();
  await page.getByLabel('Nome Completo').fill('Pessoa de Teste');
  await page.getByLabel('E-mail').fill('pessoa@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('uma-senha-segura');
  await page.getByLabel('Confirmar Senha').fill('outra-senha-segura');
  await expect(page.locator('.field-error')).toHaveText('As senhas não coincidem.');
  await expect(submit).toBeDisabled();

  await page.getByLabel('Mostrar senha').first().click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByLabel('Confirmar Senha').fill('uma-senha-segura');
  await expect(submit).toBeEnabled();
});
test('signup API rejects different passwords', async ({ request }, testInfo) => {
  const origin = String(testInfo.project.use.baseURL);
  const response = await request.post('/api/auth', {
    headers: { Origin: origin },
    data: {
      action: 'signup',
      fullName: 'Pessoa de Teste',
      email: 'pessoa@example.com',
      password: 'uma-senha-segura',
      confirmPassword: 'outra-senha-segura',
    },
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: 'password_mismatch' });
});
test('signup API rejects cross-origin requests', async ({ request }) => {
  const response = await request.post('/api/auth', {
    headers: { Origin: 'https://example.invalid' },
    data: {
      action: 'signup',
      fullName: 'Pessoa de Teste',
      email: 'pessoa@example.com',
      password: 'uma-senha-segura',
      confirmPassword: 'uma-senha-segura',
    },
  });
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: 'invalid_origin' });
});
test('protected API rejects anonymous calls', async ({ request }) => {
  const result = await request.get('/api/agents');
  expect(result.status()).toBe(401);
});
// Authenticated lifecycle and RLS run without browser fixtures via scripts/integration-smoke.ts.
// Full paid-AI E2E requires explicitly configured provider credentials; it is never replaced by fake generation.
