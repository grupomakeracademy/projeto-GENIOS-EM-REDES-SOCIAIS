import { test, expect } from '@playwright/test';
test('product narrative follows scrolling in both directions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  for (const kind of ['creation', 'planning']) {
    const section = page.locator(`.product-${kind}`);
    const seek = async (progress: number) => {
      await section.evaluate((el, p) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + (el.getBoundingClientRect().height - innerHeight) * p, behavior: 'instant' }), progress);
    };
    await seek(.7);
    await expect(section.locator('.product-toolbar button[aria-pressed=true]')).toHaveText(kind === 'creation' ? 'Operação em Kanban' : 'Calendário de conteúdos');
    await seek(.4);
    await expect(section.locator('.product-toolbar button[aria-pressed=true]')).toHaveText(kind === 'creation' ? 'Conteúdos em Lista' : 'Rotina do agente');
  }
});
test('premium font, demonstration pause and real product controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(
    /manrope/i,
  );
  await page.getByRole('button', { name: 'Pausar demonstração' }).click();
  const pausedStage = await page.locator('.hero-demo').getAttribute('class');
  await page.waitForTimeout(2400);
  expect(await page.locator('.hero-demo').getAttribute('class')).toBe(pausedStage);
  await page.getByRole('button', { name: 'Retomar demonstração' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Pausar demonstração' })).toBeDisabled();
  const creation = page.locator('.product-creation');
  await creation.getByRole('button', { name: 'Operação em Kanban' }).click();
  await expect(creation.locator('.product-screen img.active')).toHaveAttribute(
    'src',
    '/product/kanban.webp',
  );
  await creation.getByRole('button', { name: 'Ampliar tela real' }).click();
  await expect(creation.locator('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(creation.locator('dialog')).not.toBeVisible();
  await creation.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/commercial-product.png' });
  expect(
    await creation
      .locator('.product-screen img.active')
      .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
  ).toBe(true);
  await expect(page.locator('.testimonial-section')).toHaveCount(0);
});
async function fill(page: import('@playwright/test').Page) {
  await page.getByLabel('Nome da empresa').fill('Empresa de teste & criação');
  await page.getByLabel('E-mail', { exact: true }).fill('teste@example.com');
  await page.getByLabel('WhatsApp', { exact: true }).fill('19999998888');
  await page.getByLabel('Ramo de atuação').fill('Educação');
  await page.getByLabel('Quantidade de funcionários').selectOption('2 a 5');
  await page.getByLabel('Investe ou já investiu').selectOption('Sim');
  await page.getByLabel('Possui Social Media').selectOption('Não');
  await page.getByLabel('Qual é sua principal').selectOption('Falta de tempo');
  await page.getByRole('checkbox').check();
}
test('desktop narrative, CTAs, interaction, reduced motion and login', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Dê inteligência');
  await page.screenshot({ path: 'test-results/commercial-hero.png' });
  await expect(page.getByRole('link', { name: 'Já sou assinante' }).first()).toHaveAttribute(
    'href',
    'http://127.0.0.1:3001/login',
  );
  await page.screenshot({ path: 'test-results/commercial-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Mais autonomia', exact: true }).click();
  await expect(page.locator('.flow-step')).toHaveCount(3);
  await page.getByRole('button', { name: 'Com aprovação humana' }).click();
  await expect(page.locator('.flow-step')).toHaveCount(4);
  await page.locator('summary').filter({ hasText: 'Quanto custa?' }).click();
  await expect(page.locator('details[open]')).toContainText('proposta');
  await page.getByRole('link', { name: 'Quero começar', exact: true }).first().click();
  await expect(page).toHaveURL(/#conversa$/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe(
    'auto',
  );
  await page.getByRole('link', { name: 'Já sou assinante' }).last().click();
  await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
});
test('mobile menu, layout and form error preserve data', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/commercial-hero-mobile.png' });
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('link', { name: 'Quero começar', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible();
  await fill(page);
  await page.route('**/api/leads', (route) =>
    route.fulfill({ status: 503, json: { error: 'Falha temporária. Tente novamente.' } }),
  );
  await page.getByRole('button', { name: 'Conversar sobre a minha empresa' }).click();
  await expect(page.locator('.form-error')).toHaveText('Falha temporária. Tente novamente.');
  await expect(page.getByLabel('Nome da empresa')).toHaveValue('Empresa de teste & criação');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/commercial-mobile.png', fullPage: true });
});
test('form confirms persistence before WhatsApp and disables duplicate clicks', async ({
  page,
}) => {
  await page.goto('/');
  await fill(page);
  let calls = 0;
  await page.route('**/api/leads', async (route) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({
      json: { saved: true, whatsappUrl: 'https://wa.me/5519988788759?text=Teste%20com%20contexto' },
    });
  });
  await page.route('https://wa.me/**', (route) => route.abort());
  await page.getByRole('button', { name: 'Conversar sobre a minha empresa' }).click();
  await expect(page.getByRole('button', { name: 'Registrando seus dados…' })).toBeDisabled();
  await expect(page.getByText('Seu contexto já está registrado.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continuar no WhatsApp' })).toHaveAttribute(
    'href',
    /text=Teste%20com%20contexto/,
  );
  expect(calls).toBe(1);
});
test('public API rejects origin, invalid data and large bodies', async ({ request }) => {
  expect(
    (
      await request.post('/api/leads', { data: {}, headers: { origin: 'https://invalid.example' } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/leads', { data: {}, headers: { origin: 'http://127.0.0.1:3000' } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post('/api/leads', {
        data: { text: 'x'.repeat(9000) },
        headers: { origin: 'http://127.0.0.1:3000' },
      })
    ).status(),
  ).toBe(413);
  expect((await request.get('/api/leads')).status()).toBe(405);
});
test('responsive widths and removed section leaves no container', async ({ page }) => {
  for (const width of [360, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await expect(page.locator('.publishing-networks, .whatsapp-distribution')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Da criação à publicação/ })).toHaveCount(0);
});
