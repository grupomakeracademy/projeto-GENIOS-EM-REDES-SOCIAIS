import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ adminClient: () => ({ from: () => ({}) }) }));

import { buildImagePromptContext } from '@/lib/jobs/pipeline';
import { generateImage } from '@/lib/ai/providers';
import { contentGenerationQuota, MAX_CONTENT_INSTRUCTION_LENGTH, type AIConfig } from '@/lib/domain';

afterEach(() => vi.unstubAllGlobals());

describe('pauta, referência e cotas de Novo conteúdo', () => {
  it('calcula o dobro somente quando há referência selecionada', () => {
    expect(contentGenerationQuota(1, 1, 'low', false)).toBe(1);
    expect(contentGenerationQuota(1, 1, 'low', true)).toBe(2);
    expect(contentGenerationQuota(1, 1, 'medium', false)).toBe(3);
    expect(contentGenerationQuota(1, 1, 'medium', true)).toBe(6);
    expect(contentGenerationQuota(2, 2, 'medium', true)).toBe(24);
  });

  it('mantém integralmente a pauta de 2.000 caracteres e a descrição da referência no prompt real enviado', async () => {
    const instruction = 'A'.repeat(MAX_CONTENT_INSTRUCTION_LENGTH - 52) + ' pessoa lendo em uma biblioteca azul, com um gato no colo';
    const prompt = buildImagePromptContext({
      prompt: 'Cena editorial adaptada para Instagram.',
      instruction,
      selectedReferenceSummary: 'Ilustração com luz âmbar, linhas suaves e fundo azul.',
      visualKnowledge: 'DNA visual permanente do agente.',
      companyOrName: 'Empresa do agente',
      channel: 'instagram', position: 0, ratio: '4:5',
    });
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'blue' } }).png().toBuffer();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await generateImage(
      { provider: 'openai', model: 'gpt-image-2.5-flare' } as AIConfig,
      'mock-key', prompt, '4:5', [{ mimeType: 'image/png', data: png.toString('base64') }],
    );
    const body = fetchMock.mock.calls[0][1].body as FormData;
    const sent = String(body.get('prompt'));
    expect(sent).toContain(instruction);
    expect(sent).toContain('DNA visual permanente do agente.');
    expect(sent).toContain('Ilustração com luz âmbar');
    expect(body.getAll('image[]')).toHaveLength(1);
    expect(result.generationPrompt).toBe(sent);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não herda pauta ou referência da geração anterior', () => {
    const shared = { prompt: 'Cena nova.', channel: 'instagram', position: 0, ratio: '4:5' };
    const first = buildImagePromptContext({ ...shared, instruction: 'Pessoa na praia.', selectedReferenceSummary: 'Pintura aquarela.' });
    const second = buildImagePromptContext({ ...shared, instruction: 'Gato na biblioteca.', selectedReferenceSummary: 'Fotografia realista.' });
    expect(first).toContain('Pessoa na praia.');
    expect(second).toContain('Gato na biblioteca.');
    expect(second).not.toContain('Pessoa na praia.');
    expect(second).not.toContain('Pintura aquarela.');
  });

  it('sem pauta preserva o contexto do agente sem inventar uma instrução específica', () => {
    const context = JSON.parse(buildImagePromptContext({ prompt: 'Cena do agente.',
      visualKnowledge: 'Identidade visual da marca.', companyOrName: 'Empresa',
      channel: 'instagram', position: 0, ratio: '4:5' }));
    expect(context.specific_instruction).toBeUndefined();
    expect(context.brand_visual_dna).toBe('Identidade visual da marca.');
    expect(context.scene).toBe('Cena do agente.');
  });

  it('mantém pessoas, ação, ambiente e objetos da pauta específica acima da cena adaptada', () => {
    const instruction = 'Uma professora com vestido verde explica frações a duas crianças em uma sala de aula ensolarada; há um globo azul sobre a mesa.';
    const context = JSON.parse(buildImagePromptContext({ prompt: 'Arte institucional genérica.', instruction,
      selectedReferenceSummary: 'Cores suaves e textura de aquarela.', visualKnowledge: 'Briefing visual da marca.',
      channel: 'instagram', position: 0, ratio: '4:5' }));
    expect(context.specific_instruction).toBe(instruction);
    expect(context.instruction_hierarchy).toContain('specific instruction defines the scene');
    expect(context.selected_reference_visual_guidance).toContain('aquarela');
    expect(context.brand_visual_dna).toContain('Briefing');
  });

  it.each([
    [{ width: 1080, height: 1920 }, '4:5'],
    [{ width: 1080, height: 1350 }, '9:16'],
    [{ width: 1920, height: 1080 }, '4:5'],
    [{ width: 1080, height: 1920 }, '16:9'],
  ])('requires recomposition from reference %o into %s without losing essential content', (referenceDimensions, ratio) => {
    const context = JSON.parse(buildImagePromptContext({
      prompt: 'Cena genérica de crianças.',
      instruction: 'Use os mesmos personagens da referência. Título: CONHEÇA O ACOMPANHAMENTO PERSONALIZADO DO GENINHOS!',
      selectedReferenceSummary: 'Personagens específicos, mascote azul e tipografia editorial.',
      referenceDimensions,
      channel: 'instagram', position: 0, ratio,
      exactLogoPolicy: { hasExactLogoAsset: true, brandNames: ['Geninhos'] },
    }));
    expect(context.specific_instruction).toContain('GENINHOS!');
    expect(context.reference_recomposition).toContain('Rebuild the entire composition');
    expect(context.reference_recomposition).toContain('Preserve specific characters');
    expect(context.composition_rules).toContain(`FINAL ${ratio} frame`);
    expect(context.composition_rules).toContain('at least 8%');
  });
});
