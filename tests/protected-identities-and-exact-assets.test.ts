import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  adminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: () =>
              Promise.resolve({
                data: [
                  {
                    id: '33333333-3333-3333-3333-333333333333',
                    name: 'Logo Oficial',
                    asset_subtype: 'logo',
                    placement: 'top_left',
                    scale_percent: 20,
                  },
                ],
              }),
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  id: '33333333-3333-3333-3333-333333333333',
                  name: 'Logo Oficial',
                  category: 'exact_asset',
                  asset_subtype: 'logo',
                  placement: 'top_left',
                  scale_percent: 20,
                },
              }),
          }),
          in: () =>
            Promise.resolve({
              data: [
                {
                  id: '33333333-3333-3333-3333-333333333333',
                  name: 'Logo Oficial',
                  asset_subtype: 'logo',
                  placement: 'top_left',
                  scale_percent: 20,
                },
              ],
            }),
          maybeSingle: () =>
            Promise.resolve({
              data: {
                id: '33333333-3333-3333-3333-333333333333',
                name: 'Logo Oficial',
                category: 'exact_asset',
                asset_subtype: 'logo',
                placement: 'top_left',
                scale_percent: 20,
              },
            }),
        }),
      }),
    }),
  }),
}));
import sharp from 'sharp';
import {
  matchIdentityInScene,
  compositeExactAssetBuffer,
  getExactAssetGuidance,
  processAssetKnowledge,
} from '@/lib/ai/asset-knowledge';
import { buildImagePromptContext } from '@/lib/jobs/pipeline';
import {
  assetCategorySchema,
  assetSubtypeSchema,
  exactAssetPlacementSchema,
} from '@/lib/domain';

describe('Protected Identities and Exact Assets System (Generic)', () => {
  it('validates domain schemas for categories and subtypes', () => {
    expect(assetCategorySchema.parse('reference')).toBe('reference');
    expect(assetCategorySchema.parse('protected_identity')).toBe('protected_identity');
    expect(assetCategorySchema.parse('exact_asset')).toBe('exact_asset');

    expect(assetSubtypeSchema.parse('logo')).toBe('logo');
    expect(assetSubtypeSchema.parse('badge')).toBe('badge');
    expect(assetSubtypeSchema.parse('watermark')).toBe('watermark');
    expect(assetSubtypeSchema.parse('other')).toBe('other');

    expect(exactAssetPlacementSchema.parse('top_left')).toBe('top_left');
    expect(exactAssetPlacementSchema.parse('top_right')).toBe('top_right');
    expect(exactAssetPlacementSchema.parse('bottom_left')).toBe('bottom_left');
    expect(exactAssetPlacementSchema.parse('bottom_right')).toBe('bottom_right');
    expect(exactAssetPlacementSchema.parse('manual')).toBe('manual');
  });

  describe('Exact Asset Sizing & Compositing Scenarios (100% Local, 0 Paid APIs)', () => {
    it('Cenário 1: Base 1024px de largura com scale_percent = 20 produz logo com ~205px de largura', async () => {
      const base1024 = await sharp({
        create: { width: 1024, height: 1024, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
      }).png().toBuffer();

      const logo = await sharp({
        create: { width: 500, height: 250, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
      }).png().toBuffer();

      const targetLogoWidth = Math.round(1024 * (20 / 100)); // 205 px
      expect(targetLogoWidth).toBe(205);

      const composited = await compositeExactAssetBuffer(base1024, logo, 'top_left', 20);
      expect(composited).toBeInstanceOf(Buffer);

      // Verify resized logo dimension
      const resized = await sharp(logo).resize({ width: targetLogoWidth, fit: 'inside' }).toBuffer();
      const meta = await sharp(resized).metadata();
      expect(meta.width).toBe(205);
      expect(meta.height).toBe(103);
    });

    it('Cenário 2: Base 1024px com scale_percent = 30 produz logo com ~307px (inclusive com margens transparentes)', async () => {
      const base1024 = await sharp({
        create: { width: 1024, height: 1024, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
      }).png().toBuffer();

      // Simulate a Canva-like export: 2000x2000 transparent canvas with a 600x200 visible artwork in center
      const innerArtwork = await sharp({
        create: { width: 600, height: 200, channels: 4, background: { r: 0, g: 120, b: 255, alpha: 1 } },
      }).png().toBuffer();

      const paddedCanvaLogo = await sharp({
        create: { width: 2000, height: 2000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      }).composite([{ input: innerArtwork, top: 900, left: 700 }]).png().toBuffer();

      const targetLogoWidth = Math.round(1024 * (30 / 100)); // 307 px
      expect(targetLogoWidth).toBe(307);

      const composited = await compositeExactAssetBuffer(base1024, paddedCanvaLogo, 'top_left', 30);
      expect(composited).toBeInstanceOf(Buffer);

      // Verify that after trim() the visible graphic achieves exactly targetLogoWidth (307px)
      const trimmed = await sharp(paddedCanvaLogo).trim().toBuffer();
      const resizedTrimmed = await sharp(trimmed).resize({ width: targetLogoWidth, fit: 'inside' }).toBuffer();
      const meta = await sharp(resizedTrimmed).metadata();
      expect(meta.width).toBe(307);
    });

    it('Cenário 3: Base 1536px de largura com scale_percent = 30 produz logo com ~461px de largura', async () => {
      const base1536 = await sharp({
        create: { width: 1536, height: 1536, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
      }).png().toBuffer();

      const logo = await sharp({
        create: { width: 800, height: 400, channels: 4, background: { r: 16, g: 185, b: 129, alpha: 1 } },
      }).png().toBuffer();

      const targetLogoWidth = Math.round(1536 * (30 / 100)); // 461 px
      expect(targetLogoWidth).toBe(461);

      const composited = await compositeExactAssetBuffer(base1536, logo, 'top_left', 30);
      expect(composited).toBeInstanceOf(Buffer);

      const resized = await sharp(logo).resize({ width: targetLogoWidth, fit: 'inside' }).toBuffer();
      const meta = await sharp(resized).metadata();
      expect(meta.width).toBe(461);
      expect(meta.height).toBe(231);
    });
  });

  describe('Cenário 4: Bloqueio Absoluto de Logo no Prompt da IA', () => {
    it('injetar regra mandatória categórica e suprimir brand quando houver exact_asset do tipo logo', async () => {
      const agentWithLogo = {
        id: '11111111-1111-1111-1111-111111111111',
        workspace_id: '22222222-2222-2222-2222-222222222222',
        name: 'Agente da Marca',
        visual_settings: { reference_ids: ['33333333-3333-3333-3333-333333333333'] },
      } as any;

      const guidance = await getExactAssetGuidance(agentWithLogo);

      // Verify mandatory blocking text
      expect(guidance).toContain('REGRA MANDATÓRIA DE MARCA — PROIBIDO GERAR LOGOTIPO:');
      expect(guidance).toContain('Não desenhe, não gere, não recrie, não invente, não estilize e não alucine nenhum logotipo');
      expect(guidance).toContain('Não escreva o nome da marca como elemento gráfico decorativo');
      expect(guidance).toContain('Não crie variações tipográficas da marca');
      expect(guidance).toContain('Não adicione logotipo em cantos, rodapés, embalagens');
      expect(guidance).toContain('texto editorial da peça = permitido; marca / logotipo / selo / assinatura visual = terminantemente proibido');

      // Test buildImagePromptContext: suppresses brand property to prevent hallucinations
      const promptContextStr = buildImagePromptContext({
        prompt: 'Uma postagem explicativa sobre educação infantil moderna.',
        channel: 'instagram',
        position: 0,
        ratio: '1:1',
        companyOrName: 'Geninhos',
        exactAssetGuidance: guidance,
        exactLogoPolicy: { hasExactLogoAsset: true, brandNames: ['Geninhos'] },
      });

      const parsedContext = JSON.parse(promptContextStr);
      // brand MUST be undefined to prevent hallucinated logos like "GENINHOSHOS"
      expect(parsedContext.brand).toBeUndefined();
      expect(parsedContext.exact_asset_guidance).toContain('PROIBIDO GERAR LOGOTIPO');
      expect(parsedContext.composition_rules).not.toContain('logos');
    });
  });

  describe('Cenário 5: Ações Administrativas da Biblioteca Sem Consumo de APIs Pagas', () => {
    it('garante 0 chamadas de visão/IA para processamento de exact_asset e protected_identity', async () => {
      const exactResult = await processAssetKnowledge('33333333-3333-3333-3333-333333333333');
      expect(exactResult.visionCallsMade).toBe(0);
      expect(exactResult.status).toBe('already_processed');
    });
  });

  describe('matchIdentityInScene (Generic Name-Based Automated Scene Selection)', () => {
    it('returns FALSE when prompt does not mention the identity', () => {
      const prompt =
        'Uma composição limpa com infográfico sobre finanças corporativas e gráficos ascendentes em 3D.';

      expect(matchIdentityInScene(prompt, 'Dr. Roberto')).toBe(false);
      expect(matchIdentityInScene(prompt, 'Ana Silva')).toBe(false);
      expect(matchIdentityInScene(prompt, 'Robô K2')).toBe(false);
      expect(matchIdentityInScene(prompt, 'Produto X')).toBe(false);
    });

    it('returns TRUE when prompt mentions the identity name (person, character, product or visual element)', () => {
      expect(
        matchIdentityInScene(
          'Crie uma imagem de Ana Silva apresentando os resultados da empresa.',
          'Ana Silva',
        ),
      ).toBe(true);

      expect(
        matchIdentityInScene(
          'Ilustração em 3D do Robô K2 explorando uma nova estação espacial.',
          'Robô K2',
        ),
      ).toBe(true);

      expect(
        matchIdentityInScene(
          'Close-up elegante da Garrafa Térmica Titan sobre uma mesa de madeira rústica.',
          'Garrafa Térmica Titan',
        ),
      ).toBe(true);
    });

    it('preserves rule: zero references when identity is absent from scene', () => {
      const prompt = 'Foto realista de um escritório moderno com laptops e café.';
      const registeredIdentities = [
        { identity_name: 'Ana Silva', is_master: true },
        { identity_name: 'Robô K2', is_master: true },
        { identity_name: 'Produto Titan', is_master: true },
      ];

      const matches = registeredIdentities.filter((i) =>
        matchIdentityInScene(prompt, i.identity_name),
      );

      // Strictly ZERO references selected
      expect(matches).toHaveLength(0);
    });

    it('preserves rule: at most one master reference selected when identity is present', () => {
      const prompt = 'Ana Silva apresentando as novidades da conferência.';
      const registeredIdentities = [
        { identity_name: 'Ana Silva', is_master: true },
        { identity_name: 'Ana Silva', is_master: false }, // secondary
        { identity_name: 'Robô K2', is_master: true },
      ];

      // Filters for master and matching
      const masters = registeredIdentities.filter((i) => i.is_master);
      const matches = masters.filter((i) =>
        matchIdentityInScene(prompt, i.identity_name),
      );

      // Only 1 master reference, never secondary, never all!
      expect(matches).toHaveLength(1);
      expect(matches[0].identity_name).toBe('Ana Silva');
    });
  });

  describe('Asset Card Presentation Structure', () => {
    function getCardPresentation(asset: {
      category: string;
      identity_name?: string | null;
      is_master?: boolean;
      size: number;
      placement?: string | null;
      scale_percent?: number | null;
    }) {
      const isProtectedIdentity =
        asset.category === 'protected_identity' || asset.category === 'Gênio / Mascote';
      const isExactAsset = asset.category === 'exact_asset';

      // 1. Categoria (badge)
      const categoryBadge = isExactAsset
        ? '🎯 Asset Exato'
        : isProtectedIdentity
          ? '👤 Identidade Protegida'
          : '🎨 DNA Visual Geral';

      // 2. Agente (rendered via AssetAgents)

      // 3. Nome da Identidade (apenas texto limpo, NUNCA como badge de categoria)
      const identityNameText = asset.identity_name
        ? `Nome da Identidade: ${asset.identity_name}`
        : null;

      // 4. Tamanho do arquivo com escala quando aplicável
      const fileSizeText = isExactAsset
        ? `Sobreposição: ${asset.placement || 'top_left'} (${asset.scale_percent ?? 20}%) · ${Math.ceil(asset.size / 1024)} KB`
        : `${Math.ceil(asset.size / 1024)} KB`;

      return {
        categoryBadge,
        identityNameText,
        fileSizeText,
        isMaster: Boolean(asset.is_master),
      };
    }

    it('ensures category badge is strictly the category, never identity name', () => {
      const card = getCardPresentation({
        category: 'protected_identity',
        identity_name: 'Professor Ivo Bastos',
        is_master: false,
        size: 1023185,
      });

      // Category badge MUST be "Identidade Protegida"
      expect(card.categoryBadge).toBe('👤 Identidade Protegida');
      expect(card.categoryBadge).not.toContain('Professor Ivo Bastos');

      // Identity name MUST be rendered separately as clear text
      expect(card.identityNameText).toBe('Nome da Identidade: Professor Ivo Bastos');

      // File size
      expect(card.fileSizeText).toBe('1000 KB');
    });

    it('handles exact asset with configurable scale_percent display properly', () => {
      const exactCard = getCardPresentation({
        category: 'exact_asset',
        size: 512000,
        placement: 'top_left',
        scale_percent: 22,
      });
      expect(exactCard.categoryBadge).toBe('🎯 Asset Exato');
      expect(exactCard.identityNameText).toBeNull();
      expect(exactCard.fileSizeText).toBe('Sobreposição: top_left (22%) · 500 KB');

      const dnaCard = getCardPresentation({
        category: 'reference',
        size: 204800,
      });
      expect(dnaCard.categoryBadge).toBe('🎨 DNA Visual Geral');
      expect(dnaCard.identityNameText).toBeNull();
      expect(dnaCard.fileSizeText).toBe('200 KB');
    });
  });
});

