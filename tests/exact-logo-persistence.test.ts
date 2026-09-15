import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
vi.mock('server-only', () => ({}));
const s = vi.hoisted(() => ({ assets: [] as any[], files: new Map<string, Buffer>(), overlay: Buffer.alloc(0), raw: Buffer.alloc(0), agent: {} as any, media: [] as any[], fail: false }));
vi.mock('@/lib/ai/service', () => ({ AIService: class { async image() { return { bytes: s.raw, mime: 'image/png', provider: 'mock', model: 'mock' }; } } }));
vi.mock('@/lib/supabase/server', () => ({ adminClient: () => ({
  from: (table: string) => { let rows = table === 'assets' ? s.assets : []; const q: any = {
    select: () => q, eq: (k: string, v: unknown) => { rows = rows.filter(a => a[k] === v); return q; },
    in: (k: string, values: unknown[]) => { rows = rows.filter(a => values.includes(a[k])); return q; },
    gt: () => q, order: () => q, update: () => q,
    upsert: (value: unknown) => { if (table === 'content_media') s.media.push(value); return q; },
    insert: (value: unknown) => { if (table === 'content_media') s.media.push(value); return q; },
    single: async () => ({ error: null, data: table === 'agents' ? s.agent : table === 'content_items' ? { status: 'GENERATING', version: 1, strategy: { image_quality: 'low' } } : { id: '55555555-5555-4555-8555-555555555555', channel: 'instagram', image_prompts: ['Criança lendo.'] } }),
    maybeSingle: async () => ({ error: null, data: table === 'background_jobs' ? { id: 'lease' } : null }),
    then: (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve),
  }; return q; },
  storage: { from: () => ({
    download: async () => ({ error: s.fail, data: s.fail ? null : { arrayBuffer: async () => s.overlay } }),
    upload: async (path: string, bytes: Uint8Array) => { s.files.set(path, Buffer.from(bytes)); return { error: null, data: { path } }; },
  }) },
}) }));
import { resolveExactAssets, getExactAssetPolicy } from '@/lib/ai/asset-knowledge';
import { saveCompositedImage } from '@/lib/jobs/save-composited-image';
import { mediaDisplaySource } from '@/lib/media-display-source';
import type { Agent } from '@/lib/domain';
import { saveImage, regenerate, type Job } from '@/lib/jobs/pipeline';
const id = '33333333-3333-3333-3333-333333333333';
const agent = { id: 'test-agent', workspace_id: 'agent-workspace', name: 'Gênio', briefing: {}, visual_settings: { reference_ids: [id] } } as unknown as Agent;
beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('NO NETWORK ALLOWED'); }));
  s.files.clear(); s.fail = false; s.media = []; s.agent = agent;
  s.assets = [{ id, name: 'GENINHOS - LOGO 02.png (fixture)', workspace_id: 'owner-workspace', category: 'exact_asset', asset_subtype: 'logo', placement: 'bottom_left', scale_percent: 35, storage_path: 'fixture/official.png', mime_type: 'image/png' },
    { id: 'unrelated', workspace_id: 'agent-workspace', category: 'exact_asset', asset_subtype: 'logo', placement: 'top_right', scale_percent: 20 }];
  s.overlay = await sharp({ create: { width: 200, height: 100, channels: 3, background: 'red' } }).png().toBuffer();
  s.raw = await sharp({ create: { width: 1000, height: 1500, channels: 3, background: 'white' } }).png().toBuffer();
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
it('resolves only the explicitly linked logo even when shared from another workspace', async () => {
  expect((await resolveExactAssets(agent)).map(a => a.id)).toEqual([id]);
  expect(await resolveExactAssets({ ...agent, visual_settings: {} })).toEqual([]);
  expect((await getExactAssetPolicy(agent)).hasExactLogoAsset).toBe(true);
});
it.each(['manual','routine','regeneration'])('composes and persists the shared %s image stage at bottom_left / 35%%', async flow => {
  const raw = await sharp({ create: { width: 1000, height: 1500, channels: 3, background: 'white' } }).png().toBuffer();
  const path = await saveCompositedImage({ agent, bytes: raw, mime: 'image/png', channel: 'instagram', ratio: '4:5', expectedLogo: true,
    originalPath: `${flow}-original.png`, finalPath: `${flow}-final.png` });
  expect(s.files.get(`${flow}-original.png`)).toEqual(raw);
  const final = s.files.get(mediaDisplaySource(path))!;
  expect(final.equals(raw)).toBe(false);
  const { data, info } = await sharp(final).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
  // 35% of 1000 = 350; original 2:1 ratio => 175; margin=5%, left=50, top=1250.
  expect(pixel(50,1250)).toEqual([255,0,0]); expect(pixel(399,1424)).toEqual([255,0,0]);
  expect(pixel(400,1425)).toEqual([255,255,255]); expect(pixel(50,100)).toEqual([255,255,255]);
});
it.each(['missing','download','manual','duplicate'])('fails before saving when expected logo is %s', async failure => {
  if (failure === 'missing') s.assets = [];
  if (failure === 'download') s.fail = true;
  if (failure === 'manual') s.assets[0].placement = 'manual';
  if (failure === 'duplicate') { s.assets.push({ ...s.assets[0] }); }
  await expect(saveCompositedImage({ agent, bytes: Buffer.from('raw'), mime: 'image/png', channel: 'instagram', ratio: '4:5', expectedLogo: true, originalPath: 'test-original.png', finalPath: 'test-final.png' })).rejects.toThrow();
  expect(s.files.size).toBe(0);
});
it('refuses to expose a provider raw source in cards or previews', () => {
  expect(() => mediaDisplaySource('test-original.png')).toThrow();
});
it.each(['manual', 'routine', 'regeneration'])('executes actual %s image path and records final content_media source', async origin => {
  const job = { id: '44444444-4444-4444-8444-444444444444', workspace_id: agent.workspace_id, lock_token: '66666666-6666-4666-8666-666666666666', type: origin === 'regeneration' ? 'regenerate_image' : 'agent_run', payload: { origin,
    content_id: '77777777-7777-4777-8777-777777777777', agent_id: '88888888-8888-4888-8888-888888888888', variant_id: '55555555-5555-4555-8555-555555555555' } } as unknown as Job;
  if (origin === 'regeneration') await regenerate(job);
  else await saveImage(job, agent, { id: '55555555-5555-4555-8555-555555555555', channel: 'instagram', image_prompts: ['Criança lendo.'] }, 0, false, { quality: 'low' });
  expect(s.media).toHaveLength(1);
  const displayPath = mediaDisplaySource(s.media[0].storage_path);
  expect(displayPath).toMatch(/-final\.png$/);
  expect(s.files.get(displayPath)?.equals(s.raw)).toBe(false);
  expect([...s.files.keys()].filter(p => p.endsWith('-original.png'))).toHaveLength(1);
});
