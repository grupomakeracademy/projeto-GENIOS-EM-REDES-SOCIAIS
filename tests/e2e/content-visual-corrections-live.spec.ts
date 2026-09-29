import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

loadEnvConfig(process.cwd());

test('texto editorial de marca e recomposição real entre proporções', async ({ page }) => {
  test.skip(process.env.LIVE_VISUAL_CORRECTIONS_TEST !== '1', 'Geração real exige execução explícita.');
  test.setTimeout(600_000);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } });
  const email = `visual-corrections-${randomUUID()}@example.test`;
  const password = randomBytes(30).toString('base64url');
  let userId: string | undefined;
  let workspaceId: string | undefined;
  try {
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { full_name: 'Teste Visual', test_fixture: true } });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } });
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const onboard = await client.rpc('complete_onboarding', { company: 'Geninhos', agent_name: 'Geninhos',
      config: { audience: 'Famílias e escolas', channels: ['instagram'] }, tz: 'America/Sao_Paulo' });
    expect(onboard.error).toBeNull();
    workspaceId = onboard.data;
    const agent = await db.from('agents').select('id').eq('workspace_id', workspaceId).single();
    expect(agent.error).toBeNull();
    const agentId = agent.data!.id;

    await page.goto('/login');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 });

    const referenceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
      <rect width="540" height="960" fill="#173969"/><text x="45" y="115" font-size="44" fill="white">PROMOÇÃO 30%</text>
      <circle cx="170" cy="410" r="88" fill="#f6b38e"/><circle cx="370" cy="410" r="88" fill="#d29a72"/>
      <rect x="90" y="520" width="160" height="190" rx="70" fill="#f05758"/><rect x="290" y="520" width="160" height="190" rx="70" fill="#f3c84c"/>
      <circle cx="265" cy="720" r="65" fill="#48b5f2"/><rect x="0" y="790" width="540" height="170" fill="#f3c84c"/>
    </svg>`;
    const referencePng = await sharp(Buffer.from(referenceSvg)).png().toBuffer();
    const logoPng = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" rx="18" fill="#fff"/><text x="15" y="53" font-size="35" fill="#183d77">GENINHOS</text></svg>')).png().toBuffer();
    async function upload(name: string, category: string, bytes: Buffer, subtype?: string) {
      const result = await page.evaluate(async ({ name, category, encoded, subtype }) => {
        const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
        const form = new FormData();
        form.set('file', new File([bytes], name, { type: 'image/png' }));
        form.set('category', category);
        if (subtype) form.set('asset_subtype', subtype);
        const response = await fetch('/api/assets', { method: 'POST', body: form });
        return { status: response.status, data: await response.json() };
      }, { name, category, encoded: bytes.toString('base64'), subtype });
      expect(result.status, JSON.stringify(result.data)).toBe(200);
      return result.data.id as string;
    }
    const referenceId = await upload('referencia-vertical.png', 'reference', referencePng);
    const processed = await page.evaluate(async id => {
      const response = await fetch('/api/assets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process', id }) });
      return { status: response.status, data: await response.json() };
    }, referenceId);
    expect(processed.status, JSON.stringify(processed.data)).toBe(200);
    const logoId = await upload('logo-exato.png', 'exact_asset', logoPng, 'logo');
    for (const id of [referenceId, logoId]) {
      const associated = await page.evaluate(async ({ id, agentId }) => {
        const response = await fetch('/api/assets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'associate', id, agent_ids: [agentId] }) });
        return response.status;
      }, { id, agentId });
      expect(associated).toBe(200);
    }

    const instruction = 'Título editorial obrigatório: CONHEÇA O ACOMPANHAMENTO PERSONALIZADO DO GENINHOS! Use os mesmos dois personagens e o mascote azul da referência, recompondo-os para 4:5. Remova toda promoção e desconto. Não corte o título, rostos ou mascote.';
    const requested = await page.evaluate(async ({ agentId, referenceId, instruction }) => {
      const response = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, reference_asset_id: referenceId, instruction,
          channels: ['instagram'], publication_type: 'feed', image_count: 1, image_quality: 'low',
          idempotency_key: crypto.randomUUID() }) });
      return { status: response.status, data: await response.json() };
    }, { agentId, referenceId, instruction });
    expect(requested.status, JSON.stringify(requested.data)).toBe(202);
    const jobId = requested.data.job.id as string;
    await expect.poll(async () => {
      const job = await db.from('background_jobs').select('status,last_error').eq('id', jobId).single();
      if (job.data?.status === 'FAILED') throw new Error(`Geração falhou: ${job.data.last_error}`);
      return job.data?.status;
    }, { timeout: 420_000, intervals: [1000, 3000, 5000] }).toBe('COMPLETED');

    const run = await db.from('agent_runs').select('content_id').eq('job_id', jobId).single();
    expect(run.error).toBeNull();
    const variant = await db.from('content_variants').select('id,aspect_ratio').eq('content_id', run.data!.content_id).single();
    expect(variant.error).toBeNull();
    expect(variant.data!.aspect_ratio).toBe('4:5');
    const media = await db.from('content_media').select('storage_path,generation_prompt')
      .eq('variant_id', variant.data!.id).single();
    expect(media.error).toBeNull();
    expect(media.data!.generation_prompt).toContain('CONHEÇA O ACOMPANHAMENTO PERSONALIZADO DO GENINHOS!');
    expect(media.data!.generation_prompt).toContain('NO GRAPHIC BRANDING');
    expect(media.data!.generation_prompt).toContain('OFFICIAL LOGO OVERLAY EXCLUSION');
    expect(media.data!.generation_prompt).toContain('540x960');
    expect(media.data!.generation_prompt).toContain('outer 16% at the TOP and BOTTOM');
    const image = await db.storage.from('brand-assets').download(media.data!.storage_path);
    expect(image.error).toBeNull();
    const bytes = Buffer.from(await image.data!.arrayBuffer());
    const dimensions = await sharp(bytes).metadata();
    expect(dimensions.width! * 5).toBe(dimensions.height! * 4);
    await mkdir('test-results/content-visual-corrections', { recursive: true });
    await writeFile('test-results/content-visual-corrections/generated-4x5.png', bytes);

    for (const scenario of [
      { name: '4x5-to-9x16', width: 800, height: 1000, channel: 'instagram', type: 'stories', ratio: '9:16' },
      { name: '16x9-to-4x5', width: 1600, height: 900, channel: 'instagram', type: 'feed', ratio: '4:5' },
      { name: '9x16-to-16x9', width: 540, height: 960, channel: 'x', type: 'feed', ratio: '16:9' },
    ].filter(scenario => !process.env.LIVE_VISUAL_CASE || scenario.name === process.env.LIVE_VISUAL_CASE)) {
      const scenarioImage = await sharp({ create: { width: scenario.width, height: scenario.height,
        channels: 3, background: '#2461a4' } }).png().toBuffer();
      const scenarioAssetId = await upload(`${scenario.name}.png`, 'reference', scenarioImage);
      const processed = await page.evaluate(async id => {
        const response = await fetch('/api/assets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'process', id }) });
        return response.status;
      }, scenarioAssetId);
      expect(processed).toBe(200);
      const associated = await page.evaluate(async ({ id, agentId }) => {
        const response = await fetch('/api/assets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'associate', id, agent_ids: [agentId] }) });
        return response.status;
      }, { id: scenarioAssetId, agentId });
      expect(associated).toBe(200);
      const generated = await page.evaluate(async ({ agentId, referenceId, channel, type, instruction }) => {
        const response = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agentId, reference_asset_id: referenceId, instruction,
            channels: [channel], publication_type: type, image_count: 1, image_quality: 'low',
            idempotency_key: crypto.randomUUID() }) });
        return { status: response.status, data: await response.json() };
      }, { agentId, referenceId: scenarioAssetId, channel: scenario.channel, type: scenario.type, instruction });
      expect(generated.status, JSON.stringify(generated.data)).toBe(202);
      const scenarioJobId = generated.data.job.id as string;
      await expect.poll(async () => {
        const job = await db.from('background_jobs').select('status,last_error').eq('id', scenarioJobId).single();
        if (job.data?.status === 'FAILED') throw new Error(`${scenario.name}: ${job.data.last_error}`);
        return job.data?.status;
      }, { timeout: 420_000, intervals: [1000, 3000, 5000] }).toBe('COMPLETED');
      const scenarioRun = await db.from('agent_runs').select('content_id').eq('job_id', scenarioJobId).single();
      const scenarioVariant = await db.from('content_variants').select('id,aspect_ratio')
        .eq('content_id', scenarioRun.data!.content_id).single();
      expect(scenarioVariant.data!.aspect_ratio).toBe(scenario.ratio);
      const scenarioMedia = await db.from('content_media').select('storage_path,generation_prompt')
        .eq('variant_id', scenarioVariant.data!.id).single();
      expect(scenarioMedia.data!.generation_prompt).toContain('GENINHOS!');
      expect(scenarioMedia.data!.generation_prompt).toContain('OFFICIAL LOGO OVERLAY EXCLUSION');
      expect(scenarioMedia.data!.generation_prompt).toContain(`${scenario.width}x${scenario.height}`);
      const scenarioResult = await db.storage.from('brand-assets').download(scenarioMedia.data!.storage_path);
      expect(scenarioResult.error).toBeNull();
      const scenarioBytes = Buffer.from(await scenarioResult.data!.arrayBuffer());
      const metadata = await sharp(scenarioBytes).metadata();
      const [w, h] = scenario.ratio.split(':').map(Number);
      expect(metadata.width! * h).toBe(metadata.height! * w);
      await writeFile(`test-results/content-visual-corrections/${scenario.name}.png`, scenarioBytes);
    }
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
