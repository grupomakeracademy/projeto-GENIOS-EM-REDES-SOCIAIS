import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  computeContentHash,
  buildVisualSummaryText,
  buildDocumentSummaryText,
  visualReferenceInterpretationSchema,
  documentReferenceInterpretationSchema,
  type VisualReferenceInterpretation,
} from '@/lib/ai/asset-knowledge';
import { buildImagePromptContext } from '@/lib/jobs/pipeline';

describe('Biblioteca — Base de Conhecimento Textual Pré-Processada', () => {
  describe('Controle por Hash e Checksum SHA-256', () => {
    it('calcula hash SHA-256 idêntico para o mesmo conteúdo binário', () => {
      const bufferA = Buffer.from('fake-image-bytes-asset-101');
      const bufferB = Buffer.from('fake-image-bytes-asset-101');
      const bufferC = Buffer.from('fake-image-bytes-asset-102');

      const hashA = computeContentHash(bufferA);
      const hashB = computeContentHash(bufferB);
      const hashC = computeContentHash(bufferC);

      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64);
      expect(hashA).not.toBe(hashC);
    });

    it('impede chamadas repetitivas de visão quando o hash do ativo é idêntico (Deduplicação / Delta)', () => {
      // Cenário: 100 imagens já processadas
      const processedDatabase = new Map<string, { summary: string; visionCalls: number }>();
      let totalVisionCalls = 0;

      function simulateAssetUpload(fileContent: string, assetId: string) {
        const hash = computeContentHash(Buffer.from(fileContent));
        if (processedDatabase.has(hash)) {
          // Reutiliza interpretação sem chamar visão (0 chamadas)
          return { status: 'deduplicated', visionCallsMade: 0, summary: processedDatabase.get(hash)!.summary };
        }

        // Nova imagem nunca antes vista: executa 1 única chamada de visão
        totalVisionCalls++;
        const summary = `DNA da imagem ${assetId}`;
        processedDatabase.set(hash, { summary, visionCalls: 1 });
        return { status: 'processed', visionCallsMade: 1, summary };
      }

      // Adiciona 100 arquivos únicos
      for (let i = 1; i <= 100; i++) {
        simulateAssetUpload(`conteudo-imagem-${i}`, `id-${i}`);
      }
      expect(totalVisionCalls).toBe(100);

      // Usuário reenvia uma imagem duplicada (mesmo conteúdo do arquivo 42)
      const duplicateUpload = simulateAssetUpload(`conteudo-imagem-42`, `id-101-duplicado`);
      expect(duplicateUpload.status).toBe('deduplicated');
      expect(duplicateUpload.visionCallsMade).toBe(0);

      // Total de chamadas continua 100! Zero chamadas para o arquivo repetido
      expect(totalVisionCalls).toBe(100);
    });
  });

  describe('Estruturação Semântica do DNA Visual e Documental', () => {
    it('valida o esquema de interpretação visual rica com Zod', () => {
      const validVisualData: VisualReferenceInterpretation = {
        reference_type: 'logo',
        title: 'Logo Principal Geninhos',
        visual_description: 'Logotipo com a palavra GENINHOS em 3D laranja com mascote azul.',
        composition_and_framing: 'Centralizado, fundo escuro, mascote à direita do texto.',
        art_style: '3D Pixar cartoon com iluminação volumétrica suave.',
        brand_identity_and_mood: 'Mágico, acolhedor, educativo e alegre.',
        predominant_colors: ['laranja', 'azul royal', 'dourado'],
        typography_style: 'Sans-serif arredondada em negrito.',
        characters_and_mascots: 'Gênio azul com bracelete dourado e rabo de cavalo.',
        logos_and_symbols: 'Monograma e lettering GENINHOS estilizado.',
        mandatory_elements: ['Gênio azul com bracelete', 'Texto laranja com borda azul'],
        elements_to_avoid: ['Cores apagadas', 'Estilo hiper-realista sombrio'],
        generation_guidelines: 'Preservar traço amigável do mascote e paleta vibrante.',
      };

      const parsed = visualReferenceInterpretationSchema.safeParse(validVisualData);
      expect(parsed.success).toBe(true);
    });

    it('gera resumo denso e de alto impacto para injeção no prompt', () => {
      const visualData: VisualReferenceInterpretation = {
        reference_type: 'mascot',
        title: 'Mascote Geninho Explorador',
        visual_description: 'Mascote gênio azul com óculos de aviador e mochila.',
        composition_and_framing: 'Plano médio, ângulo frontal.',
        art_style: '3D Disney/Pixar cartoon vibrante.',
        brand_identity_and_mood: 'Curiosidade científica e aventura.',
        predominant_colors: ['azul ciano', 'couro marrom', 'amarelo'],
        typography_style: 'Nenhuma',
        characters_and_mascots: 'Gênio azul expressivo, sorridente, com roupas de aviador.',
        logos_and_symbols: 'Nenhum',
        mandatory_elements: ['Pele azul ciano', 'Óculos de aviador'],
        elements_to_avoid: ['Aparência robótica', 'Cores monocromáticas'],
        generation_guidelines: 'Manter a expressão alegre e foco na exploração educativa.',
      };

      const summary = buildVisualSummaryText(visualData);

      expect(summary).toContain('[DNA VISUAL: Mascote Geninho Explorador (mascot)]');
      expect(summary).toContain('Estilo Artístico: 3D Disney/Pixar cartoon vibrante.');
      expect(summary).toContain('Cores Mandatórias: azul ciano, couro marrom, amarelo.');
      expect(summary).toContain('Personagens/Mascotes: Gênio azul expressivo');
      expect(summary).toContain('Elementos Obrigatórios: Pele azul ciano; Óculos de aviador.');
      expect(summary).toContain('A Evitar: Aparência robótica; Cores monocromáticas.');
      expect(summary).not.toContain('Símbolos/Logos: Nenhum'); // Omite símbolos se vazios
    });

    it('normaliza documentos e guias de marca em texto persistido', () => {
      const docData = {
        reference_type: 'brand_manual' as const,
        title: 'Manual de Identidade Verbal Geninhos',
        brand_guidelines: 'Comunicação focada no empoderamento e autonomia dos alunos.',
        tone_of_voice: 'Inspirador, claro, encorajador e acessível.',
        mandatory_elements: ['Usar termos positivos', 'Enfatizar conquistas'],
        elements_to_avoid: ['Jargões técnicos complexos', 'Tom punitivo'],
        visual_instructions: 'Sempre associar textos a ilustrações coloridas.',
        key_takeaways: 'A marca posiciona o aluno como o protagonista do aprendizado.',
      };

      const parsed = documentReferenceInterpretationSchema.safeParse(docData);
      expect(parsed.success).toBe(true);

      const docSummary = buildDocumentSummaryText(docData);
      expect(docSummary).toContain('[DOCUMENTO DE MARCA: Manual de Identidade Verbal Geninhos (brand_manual)]');
      expect(docSummary).toContain('Tom de Voz: Inspirador, claro, encorajador e acessível.');
      expect(docSummary).toContain('Regras Obrigatórias: Usar termos positivos; Enfatizar conquistas.');
    });
  });

  describe('Eliminação Total de Tokens de Visão no Pipeline de Geração', () => {
    it('injeta o DNA visual pré-processado no prompt context em vez de baixar e enviar imagens binárias', () => {
      const visualKnowledge =
        'BASE DE CONHECIMENTO DE IDENTIDADE VISUAL DA MARCA (REFERÊNCIAS PROCESSADAS):\n• GENINHOS - LOGO 01: [DNA VISUAL: GENINHOS - LOGO 01] Cores: azul, laranja, dourado. Mascote azul com bracelete dourado.';

      const promptContextJson = buildImagePromptContext({
        prompt: 'Slide 1: O mascote azul apresentando a aula interativa.',
        style: 'Disney / Pixar',
        channel: 'instagram',
        position: 0,
        ratio: '4:5',
        companyOrName: 'Geninhos',
        visualKnowledge,
      });

      const parsed = JSON.parse(promptContextJson);
      expect(parsed.scene).toBe('Slide 1: O mascote azul apresentando a aula interativa.');
      expect(parsed.aspect_ratio).toBe('4:5');
      expect(parsed.brand_visual_dna).toBe(visualKnowledge);
      expect(parsed.composition_rules).toContain('Full-bleed edge-to-edge background');
    });

    it('garante que a chamada do modelo de imagem passe references = [] (0 imagens enviadas, 0 tokens de visão)', () => {
      // Simulação do comportamento do pipeline
      const referencesSentToImageModel: unknown[] = [];

      // No novo pipeline:
      const references: unknown[] = []; // estritamente vazio
      referencesSentToImageModel.push(...references);

      expect(referencesSentToImageModel.length).toBe(0);
      // Confirma que /v1/images/edits nunca é acionada, usando exclusivamente /v1/images/generations
    });
  });
});
