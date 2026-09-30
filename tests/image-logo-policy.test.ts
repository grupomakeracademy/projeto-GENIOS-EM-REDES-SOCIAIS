import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ assets: [] as Record<string, unknown>[], error: null as unknown, overlay: Buffer.alloc(0), downloadError: false }));
vi.mock('@/lib/supabase/server', () => ({ adminClient: () => ({
  from: () => { const query: Record<string, unknown> = {}; for (const key of ['select','eq','in']) query[key] = () => query; query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: state.assets, error: state.error }).then(resolve); return query; },
  storage: { from: () => ({ download: async () => ({ error: state.downloadError, data: state.downloadError ? null : { arrayBuffer: async () => state.overlay } }) }) },
}) }));
import { buildImagePromptContext } from '@/lib/jobs/pipeline';
import { NO_LOGO_INSTRUCTION } from '@/lib/ai/image-logo-policy';
import { getExactAssetPolicy, applyExactAssets } from '@/lib/ai/asset-knowledge';
import { generateImage } from '@/lib/ai/providers';
import type { Agent, AIConfig } from '@/lib/domain';

const agent = { id: 'agent', workspace_id: 'workspace', name: 'Assistente', briefing: { company: 'Gênios Educação' }, visual_settings: { reference_ids: ['33333333-3333-3333-3333-333333333333'] } } as unknown as Agent;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  state.assets = [{ id: 'logo', category: 'exact_asset', asset_subtype: 'logo', placement: 'top_left', scale_percent: 20, storage_path: 'official.png' }];
  state.error = null; state.downloadError = false; state.overlay = Buffer.alloc(0);
  fetchMock = vi.fn(() => { throw new Error('External networking forbidden in this test'); });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function payload(scene = 'Título editorial: Aprender juntos. Caneca GÊNIOS EDUCAÇÃO na mesa. Desenhar logotipo no notebook. Criança estudando.') {
  const policy = await getExactAssetPolicy(agent);
  return buildImagePromptContext({ prompt: scene, style: 'Azul e amarelo. Wordmark no uniforme.', channel: 'instagram', position: 0, ratio: '4:5', companyOrName: 'Gênios Educação', visualKnowledge: '3D acolhedor. Símbolos/Logos: desenhe uma estrela. CTA: Conheça Genios-Educacao. Papel branco.', exactAssetGuidance: policy.guidance, exactLogoPolicy: policy });
}

describe('Image logo protection (network always mocked)', () => {
  it('sanitizes all visual fields while preserving ordinary editorial text', async () => {
    const parsed = JSON.parse(await payload());
    expect(parsed.brand).toBeUndefined();
    expect(parsed.image_generation_policy.instruction).toBe(NO_LOGO_INSTRUCTION);
    expect(parsed.overlay_exclusion_zone).toContain('left edge from 5% to 25%');
    expect(parsed.overlay_exclusion_zone).toContain('top edge from 5% to 30%');
    for (const field of ['scene', 'style', 'brand_visual_dna']) {
      expect(parsed[field]).not.toMatch(/g[eê]nios|educa|logo|wordmark/iu);
    }
    expect(parsed.scene).toContain('Aprender juntos');
    expect(parsed.scene).toContain('Criança estudando');
    expect(parsed.style).toContain('Azul e amarelo');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses asset metadata, not words in guidance, and preserves agents without exact logos', async () => {
    state.assets = [{ asset_subtype: 'badge', placement: 'top_left' }];
    const p = JSON.parse(await payload());
    expect(p.brand).toBe('Gênios Educação');
    expect(p.image_generation_policy).toBeUndefined();
    state.error = { message: 'db unavailable' };
    await expect(getExactAssetPolicy(agent)).rejects.toThrow('internal_error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['openai', 'google'] as const)('retains the complete mandatory rule in final %s payload, including truncation', async provider => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(provider === 'openai' ? { data: [{ b64_json: png.toString('base64') }] } : { candidates: [{ content: { parts: [{ inlineData: { data: png.toString('base64'), mimeType: 'image/png' } }] } }] }), { status: 200 }));
    await generateImage({ provider, model: provider === 'openai' ? 'dall-e-3' : 'local-test' } as AIConfig, 'mock-key', await payload('Cena educativa. '.repeat(1000)), '4:5');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const finalPrompt = provider === 'openai' ? body.prompt : body.contents[0].parts[0].text;
    expect(finalPrompt.startsWith(NO_LOGO_INSTRUCTION)).toBe(true);
    expect(finalPrompt).not.toContain('Create a brand image');
    expect(finalPrompt).toContain(provider === 'openai'
      ? 'No subsequent crop, letterbox, blurred border or frame expansion'
      : 'FINAL 4:5 frame');
    if (provider === 'google') expect(body.generationConfig.imageConfig.aspectRatio).toBe('4:5');
    if (provider === 'openai') {
      expect(finalPrompt.length).toBeLessThanOrEqual(3800);
      expect(body.size).toBe('1024x1280');
    }
    expect(fetchMock).toHaveBeenCalledTimes(1); // local stub only, never a real request
  });

  it('post-composites the official file only and fails if that file cannot be applied', async () => {
    const base = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'white' } }).png().toBuffer();
    state.overlay = await sharp({ create: { width: 20, height: 10, channels: 3, background: 'red' } }).png().toBuffer();
    const final = await applyExactAssets({ imageBuffer: base, agent, ratio: '1:1' });
    const { data, info } = await sharp(final).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([...data.subarray((6 * info.width + 6) * 3, (6 * info.width + 6) * 3 + 3)]).toEqual([255, 0, 0]);
    expect([...data.subarray((80 * info.width + 80) * 3, (80 * info.width + 80) * 3 + 3)]).toEqual([255, 255, 255]);
    state.downloadError = true;
    await expect(applyExactAssets({ imageBuffer: base, agent, ratio: '1:1' })).rejects.toThrow('internal_error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the rule on the image-edit path with protected identity bytes', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'blue' } }).png().toBuffer();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), { status: 200 }));
    await generateImage({ provider: 'openai', model: 'local-test' } as AIConfig, 'mock-key', await payload(), '4:5', [{ mimeType: 'image/png', data: png.toString('base64') }]);
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(String(body.get('prompt')).startsWith(NO_LOGO_INSTRUCTION)).toBe(true);
    expect(String(body.get('prompt'))).not.toMatch(/Gênios Educação|Genios-Educacao/i);
    expect(body.getAll('image[]')).toHaveLength(1);
  });

  it('cleans names before style truncation and blocks a scene containing only branding', () => {
    const params = { prompt: 'Criança lendo.', channel: 'instagram', position: 0, ratio: '4:5', exactLogoPolicy: { hasExactLogoAsset: true, brandNames: ['Geninhos'] } };
    const context = JSON.parse(buildImagePromptContext({ ...params, style: 'Azul '.repeat(59) + 'Geninhos' }));
    expect(context.style).not.toContain('Genin');
    expect(() => buildImagePromptContext({ ...params, prompt: 'Desenhe o logotipo Geninhos.' })).toThrow('invalid_output');
  });

  it('preserves full visual scene when prompt contains comma-separated logos mention at the end', () => {
    const params = {
      channel: 'instagram',
      position: 0,
      ratio: '4:5',
      exactLogoPolicy: { hasExactLogoAsset: true, brandNames: ['Geninhos'] },
      prompt: 'Criança de 12 anos sentada numa mesa moderna de estudos com visual 3D/cartoon estilo Disney/Pixar, olhando para um holograma com um personagem professor de IA amigável flutuante ao lado, em um quarto educativo colorido com paredes azul-marinho e detalhes amarelos, elementos de tecnologia como telas e mapas mentais ao fundo, mascote azul feliz próximo, o ambiente transmite inovação, acolhimento e personalização, layout 4:5, composição equilibrada com espaço para texto e logos dentro da área segura',
    };
    const context = JSON.parse(buildImagePromptContext(params));
    expect(context.scene).toContain('Criança de 12 anos sentada numa mesa moderna de estudos');
    expect(context.scene).not.toContain('mascote azul feliz próximo');
    expect(context.scene).not.toMatch(/logos|geninhos/i);
  });

  it('reserves the actual bottom-left overlay footprint and keeps a requested editorial CTA', async () => {
    state.assets = [{ id: 'logo', category: 'exact_asset', asset_subtype: 'logo', placement: 'bottom_left', scale_percent: 35, storage_path: 'official.png' }];
    state.overlay = await sharp({ create: { width: 200, height: 100, channels: 4, background: 'blue' } }).png().toBuffer();
    const policy = await getExactAssetPolicy(agent, '4:5');
    const parsed = JSON.parse(buildImagePromptContext({
      prompt: 'Crianças aprendem com cards educativos.', channel: 'instagram', position: 0, ratio: '4:5',
      cta: 'Conheça o Geninhos', exactAssetGuidance: policy.guidance, exactLogoPolicy: policy,
    }));
    expect(parsed.overlay_exclusion_zone).toContain('left edge from 5% to 40%');
    expect(parsed.overlay_exclusion_zone).toContain('bottom edge from 5% to 19%');
    expect(parsed.overlay_exclusion_zone).toContain('through 43% from the left and 22% from the bottom');
    expect(parsed.overlay_exclusion_zone).toContain('footer, it must be on the RIGHT only');
    expect(parsed.overlay_exclusion_zone).toContain('above the footer it may appear wherever');
    expect(parsed.requested_cta).toBe('Conheça o Geninhos');
    expect(parsed.composition_rules).toContain('organized cards, icons, secondary details or interfaces');
    expect(parsed.composition_rules).toContain('Full-bleed edge-to-edge background');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves an explicitly requested brand name as editorial text but still forbids a generated logo', async () => {
    const scene = 'Título editorial: CONHEÇA O ACOMPANHAMENTO PERSONALIZADO DO GENINHOS! Desenhe o logotipo Geninhos. Crianças estudando.';
    const prompt = buildImagePromptContext({ prompt: scene,
      instruction: 'CONHEÇA O ACOMPANHAMENTO PERSONALIZADO DO GENINHOS!',
      channel: 'instagram', position: 0, ratio: '4:5',
      exactLogoPolicy: { hasExactLogoAsset: true, brandNames: ['Geninhos'] },
    });
    const context = JSON.parse(prompt);
    expect(context.scene).toContain('GENINHOS!');
    expect(context.scene).not.toContain('Desenhe o logotipo');
    expect(context.image_generation_policy.instruction).toContain('do not turn it into a logo');
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), { status: 200 }));
    await generateImage({ provider: 'openai', model: 'local-test' } as AIConfig, 'mock-key', prompt, '4:5');
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body).prompt as string;
    expect(sent).toContain('GENINHOS!');
    expect(sent).toContain('NO GRAPHIC BRANDING');
    expect(sent).toContain('Generate directly at 1024x1280 (4:5)');
  });

  it('keeps Geninhos in an editorial sentence without sending mascot or logo cues from persisted DNA', () => {
    const prompt = buildImagePromptContext({
      prompt: 'Uma criança resolve uma dúvida com um professor. O mascote azul Geninhos aponta para a tela. Título editorial: Aprenda com o Geninhos.',
      instruction: 'Mostre uma criança estudando. O mascote azul a acompanha. Título editorial: Aprenda com o Geninhos.',
      selectedReferenceSummary: 'Estilo 3D educativo. Logotipo Geninhos no rodapé. Mascote azul sorridente. Paleta azul e amarelo.',
      visualKnowledge: 'Criança estudando. Gênio azul ao lado. Símbolos/Logos: GENINHOS.',
      channel: 'instagram', position: 0, ratio: '4:5', companyOrName: 'Geninhos',
      exactLogoPolicy: { hasExactLogoAsset: true, brandNames: ['Geninhos'] },
    });
    const parsed = JSON.parse(prompt);
    expect(parsed.specific_instruction).toContain('Aprenda com o Geninhos');
    for (const field of ['scene', 'specific_instruction', 'selected_reference_visual_guidance', 'brand_visual_dna']) {
      expect(parsed[field] || '').not.toMatch(/mascote|g[eê]nio azul|logotipo/i);
    }
  });
});
