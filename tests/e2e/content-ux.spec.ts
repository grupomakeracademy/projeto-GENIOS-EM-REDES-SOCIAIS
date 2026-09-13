import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
loadEnvConfig(process.cwd());

test('content views, combined filters, contextual navigation and execution deletion', async ({
  page,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const email = `content-qa-${randomUUID()}@example.test`,
    password = randomBytes(30).toString('base64url');
  let uid: string | undefined, wid: string | undefined, imagePath: string | undefined;
  try {
    const user = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Teste Conteúdos', test_fixture: true },
    });
    expect(user.error).toBeNull();
    uid = user.data.user!.id;
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const ws = await client.rpc('complete_onboarding', {
      company: 'QA Conteúdos',
      agent_name: 'Gênio de teste',
      config: { audience: 'Público de teste', channels: ['instagram'] },
      tz: 'America/Sao_Paulo',
    });
    expect(ws.error).toBeNull();
    wid = ws.data;
    const agent = await db.from('agents').select('id').eq('workspace_id', wid).single();
    expect(agent.error).toBeNull();
    const contentIds = [randomUUID(), randomUUID(), randomUUID()];
    const rows = ['AWAITING_REVIEW', 'APPROVED', 'PUBLISHED'].map((status, i) => ({
      id: contentIds[i],
      workspace_id: wid,
      agent_id: agent.data!.id,
      topic: ['Aprender com autonomia', 'Pequenas descobertas', 'Ideias para o futuro'][i],
      status,
      created_by: uid,
    }));
    expect((await db.from('content_items').insert(rows)).error).toBeNull();
    const variantId = randomUUID();
    expect(
      (
        await db.from('content_variants').insert(
          rows.map((r, i) => ({
            id: i === 0 ? variantId : randomUUID(),
            workspace_id: wid,
            content_id: r.id,
            channel: 'instagram',
            aspect_ratio: '4:5',
            title: r.topic,
            caption: 'Uma legenda para testar a análise.',
            image_prompts: ['Uma ilustração sobre aprendizagem.'],
          })),
        )
      ).error,
    ).toBeNull();
    imagePath = `workspace/${wid}/qa-preview.png`;
    const png = await sharp({
      create: { width: 320, height: 400, channels: 3, background: '#cbd6fb' },
    })
      .png()
      .toBuffer();
    expect(
      (await db.storage.from('brand-assets').upload(imagePath, png, { contentType: 'image/png' }))
        .error,
    ).toBeNull();
    expect(
      (
        await db.from('content_media').insert({
          workspace_id: wid,
          variant_id: variantId,
          storage_path: imagePath,
          position: 0,
          aspect_ratio: '4:5',
          prompt: 'QA',
          provider: 'fixture',
          model: 'fixture',
        })
      ).error,
    ).toBeNull();
    const jobId = randomUUID();
    expect(
      (
        await db.from('background_jobs').insert({
          id: jobId,
          workspace_id: wid,
          type: 'agent_run',
          status: 'FAILED',
          attempts: 3,
          payload: {
            agent_id: agent.data!.id,
            instruction: 'Execução de teste com erro',
            channels: ['instagram'],
            created_by: uid,
          },
          last_error: 'invalid_output',
          idempotency_key: jobId,
        })
      ).error,
    ).toBeNull();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto('/contents');
    await expect(page.locator('.execution-card')).toHaveCount(4);
    await expect(page.locator('.execution-person').first()).toHaveAttribute(
      'title',
      'Teste Conteúdos',
    );
    await page
      .locator('.content-status-filters button')
      .filter({ hasText: /^Em revisão$/ })
      .click();
    await expect(page.locator('.execution-card')).toHaveCount(1);
    await page
      .locator('.content-status-filters button')
      .filter({ hasText: /^Aprovado$/ })
      .click();
    await expect(page.locator('.execution-card')).toHaveCount(2);
    await expect(page.locator('.content-status-filters [aria-pressed="true"]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Kanban', exact: true }).click();
    await expect(page.locator('.kanban-column')).toHaveCount(2);
    await mkdir('test-results/content-ux', { recursive: true });
    await page.screenshot({ path: 'test-results/content-ux/kanban.png', fullPage: true });
    await page.getByRole('link', { name: 'Analisar por rede social →' }).first().click();
    await page.getByRole('button', { name: 'Abrir', exact: true }).click();
    await expect(page.locator('.content-lightbox')).toBeVisible();
    await expect
      .poll(() =>
        page.locator('.content-lightbox img').evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(320);
    await page.keyboard.press('Escape');
    await expect(page.locator('.content-lightbox')).toHaveCount(0);
    await page.getByRole('link', { name: '← Voltar aos conteúdos' }).click();
    await expect(page.getByRole('button', { name: 'Kanban', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.content-status-filters [aria-pressed="true"]')).toHaveCount(2);
    await page
      .locator('.content-status-filters button')
      .filter({ hasText: /^Todos$/ })
      .click();
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await expect(page.locator('.execution-list')).toHaveCount(3);
    await expect(page.locator('.content-workspace')).toHaveAttribute('aria-busy', 'false');
    await page.screenshot({ path: 'test-results/content-ux/list.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: 'test-results/content-ux/mobile.png', fullPage: true });
    await expect(page.getByRole('button', { name: 'Kanban', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Kanban', exact: true }).click();
    await expect(page.locator('.content-workspace')).toHaveAttribute('aria-busy', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await expect(page.locator('.content-workspace')).toHaveAttribute('aria-busy', 'false');
    await page.locator('.execution-run summary').click();
    await page.getByRole('button', { name: 'Excluir execução', exact: true }).click();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.locator('.execution-run')).toHaveCount(1);
    await page
      .locator('.execution-run')
      .getByRole('button', { name: 'Excluir execução', exact: true })
      .click();
    await page
      .locator('dialog')
      .getByRole('button', { name: 'Excluir execução', exact: true })
      .click();
    await expect(page.locator('.execution-run')).toHaveCount(0);
    expect(
      (await db.from('background_jobs').select('payload,lock_token').eq('id', jobId).single()).data
        ?.payload.deleted,
    ).toBe(true);
    const card = page.locator('.execution-list').filter({ hasText: 'Ideias para o futuro' });
    await card.locator('summary').click();
    await card.getByRole('button', { name: 'Excluir execução', exact: true }).click();
    await page
      .locator('dialog')
      .getByRole('button', { name: 'Excluir execução', exact: true })
      .click();
    await expect(card).toHaveCount(0);
    const absent = await page.evaluate(
      async () =>
        (
          await fetch('/api/executions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'content', id: '00000000-0000-4000-8000-000000000001' }),
          })
        ).status,
    );
    expect(absent).toBe(403);
    const runningId = randomUUID();
    expect(
      (
        await db
          .from('background_jobs')
          .insert({
            id: runningId,
            workspace_id: wid,
            type: 'agent_run',
            status: 'RUNNING',
            lease_until: new Date(Date.now() + 3600000).toISOString(),
            lock_token: randomUUID(),
            payload: { agent_id: agent.data!.id },
            idempotency_key: runningId,
          })
      ).error,
    ).toBeNull();
    expect(
      (
        await db
          .from('agent_runs')
          .insert({
            workspace_id: wid,
            agent_id: agent.data!.id,
            job_id: runningId,
            content_id: contentIds[0],
          })
      ).error,
    ).toBeNull();
    const deletedRunning = await page.evaluate(
      async (id) =>
        (
          await fetch('/api/executions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'content', id }),
          })
        ).status,
      contentIds[0],
    );
    expect(deletedRunning).toBe(200);
    const stopped = await db
      .from('background_jobs')
      .select('payload,lock_token,lease_until')
      .eq('id', runningId)
      .single();
    expect(stopped.data?.lock_token).toBeNull();
    expect(stopped.data?.lease_until).toBeNull();
    expect(stopped.data?.payload.deleted).toBe(true);
    expect((await db.from('content_items').select('id').eq('id', contentIds[0])).data).toEqual([]);
    expect(
      (
        await db
          .from('workspace_members')
          .update({ role: 'VIEWER' })
          .eq('workspace_id', wid)
          .eq('user_id', uid)
      ).error,
    ).toBeNull();
    const viewerDelete = await page.evaluate(
      async (id) =>
        (
          await fetch('/api/executions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'content', id }),
          })
        ).status,
      contentIds[1],
    );
    expect(viewerDelete).toBe(403);
    await db.storage.from('brand-assets').remove([imagePath]);
  } finally {
    if (imagePath) await db.storage.from('brand-assets').remove([imagePath]);
    if (wid) {
      await db.from('agent_runs').delete().eq('workspace_id', wid);
      await db.from('background_jobs').delete().eq('workspace_id', wid);
      expect((await db.from('workspaces').delete().eq('id', wid)).error).toBeNull();
    }
    if (uid) expect((await db.auth.admin.deleteUser(uid)).error).toBeNull();
  }
});
