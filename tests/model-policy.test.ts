import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));

import {
  ALLOWED_TEXT_MODELS,
  ALLOWED_IMAGE_MODELS,
  ALLOWED_EMBEDDING_MODELS,
  isAllowedTextModel,
  isAllowedImageModel,
  assertModelAllowed,
  enforceModelPolicy,
  DEFAULT_LOWEST_COST_MODELS,
} from '@/lib/ai/model-policy';
import { openAIDefaults, openAIModels, effectiveConfigs } from '@/lib/ai/defaults';
import type { AIConfig } from '@/lib/domain';

describe('POLÍTICA GLOBAL DE CONTROLE DE MODELOS DE IA E CUSTOS DE API', () => {
  describe('1. Whitelist Estrita de Modelos de Texto', () => {
    it('contém exatamente os 8 modelos de texto autorizados', () => {
      const expected = [
        'gpt-5.6-luna',
        'gpt-5.4-mini',
        'gpt-5.4-nano',
        'gpt-5-mini',
        'gpt-5-nano',
        'gpt-4.1-mini',
        'gpt-4.1-nano',
        'gpt-4o-mini',
      ];
      expect([...ALLOWED_TEXT_MODELS]).toEqual(expected);
    });

    it('autoriza cada um dos 8 modelos da whitelist', () => {
      for (const model of ALLOWED_TEXT_MODELS) {
        expect(isAllowedTextModel(model)).toBe(true);
      }
    });

    it('proíbe expressamente modelos caros, premium ou fora da whitelist', () => {
      const prohibited = [
        'gpt-4.1',
        'gpt-4o',
        'gpt-4',
        'gpt-4-turbo',
        'gpt-3.5-turbo',
        'o1',
        'o1-mini',
        'o1-preview',
        'o3',
        'o3-mini',
        'Terra',
        'Sol',
        'Astra',
        'claude-3-5-sonnet',
        'gemini-1.5-pro',
      ];
      for (const model of prohibited) {
        expect(isAllowedTextModel(model)).toBe(false);
      }
    });
  });

  describe('2. Modelo Exclusivo para Geração de Imagens', () => {
    it('autoriza exclusivamente gpt-image-2.5-flare', () => {
      expect([...ALLOWED_IMAGE_MODELS]).toEqual(['gpt-image-2.5-flare']);
      expect(isAllowedImageModel('gpt-image-2.5-flare')).toBe(true);
    });

    it('proíbe qualquer outro modelo de imagem', () => {
      const prohibitedImages = [
        'dall-e-3',
        'dall-e-2',
        'gpt-image-2.5-sunburst',
        'gpt-image-2',
        'midjourney',
        'stable-diffusion',
      ];
      for (const model of prohibitedImages) {
        expect(isAllowedImageModel(model)).toBe(false);
      }
    });
  });

  describe('3. Validação Centralizada e Bloqueio Antecipado (assertModelAllowed)', () => {
    it('não lança erro para modelos autorizados', () => {
      expect(() => assertModelAllowed('text', 'gpt-4.1-mini')).not.toThrow();
      expect(() => assertModelAllowed('orchestrator', 'gpt-4.1-mini')).not.toThrow();
      expect(() => assertModelAllowed('text', 'gpt-5.6-luna')).not.toThrow();
      expect(() => assertModelAllowed('image', 'gpt-image-2.5-flare')).not.toThrow();
      expect(() => assertModelAllowed('embedding', 'text-embedding-3-small')).not.toThrow();
    });

    it('bloqueia imediatamente modelos de texto proibidos', () => {
      expect(() => assertModelAllowed('text', 'gpt-4.1')).toThrow(/NÃO AUTORIZADO/);
      expect(() => assertModelAllowed('orchestrator', 'gpt-4o')).toThrow(/NÃO AUTORIZADO/);
      expect(() => assertModelAllowed('text', 'Terra')).toThrow(/NÃO AUTORIZADO/);
      expect(() => assertModelAllowed('text', 'Sol')).toThrow(/NÃO AUTORIZADO/);
      expect(() => assertModelAllowed('text', 'Astra')).toThrow(/NÃO AUTORIZADO/);
    });

    it('bloqueia imediatamente modelos de imagem proibidos', () => {
      expect(() => assertModelAllowed('image', 'dall-e-3')).toThrow(/NÃO AUTORIZADO/);
      expect(() => assertModelAllowed('image', 'gpt-image-2.5-sunburst')).toThrow(/NÃO AUTORIZADO/);
      expect(() => assertModelAllowed('image', 'gpt-image-2')).toThrow(/NÃO AUTORIZADO/);
    });
  });

  describe('4. Soberania da Política e Sanitização (enforceModelPolicy)', () => {
    it('preserva configurações já autorizadas', () => {
      const validConfig: AIConfig = {
        purpose: 'text',
        provider: 'openai',
        model: 'gpt-4.1-mini',
      };
      expect(enforceModelPolicy(validConfig).model).toBe('gpt-4.1-mini');
    });

    it('substitui modelos de texto proibidos pelo modelo de menor custo autorizado', () => {
      const prohibitedConfig: AIConfig = {
        purpose: 'orchestrator',
        provider: 'openai',
        model: 'gpt-4.1',
      };
      const sanitized = enforceModelPolicy(prohibitedConfig);
      expect(sanitized.model).toBe(DEFAULT_LOWEST_COST_MODELS.orchestrator);
      expect(isAllowedTextModel(sanitized.model)).toBe(true);
    });

    it('substitui modelos de imagem proibidos por gpt-image-2.5-flare', () => {
      const prohibitedImage: AIConfig = {
        purpose: 'image',
        provider: 'openai',
        model: 'dall-e-3',
      };
      const sanitized = enforceModelPolicy(prohibitedImage);
      expect(sanitized.model).toBe('gpt-image-2.5-flare');
    });

    it('sanitiza configurações em lote via effectiveConfigs', () => {
      const saved: AIConfig[] = [
        { purpose: 'orchestrator', provider: 'openai', model: 'gpt-4.1' }, // proibido
        { purpose: 'image', provider: 'openai', model: 'dall-e-3' }, // proibido
        { purpose: 'text', provider: 'openai', model: 'gpt-4o-mini' }, // autorizado
      ];
      const effective = effectiveConfigs(saved);
      expect(effective.find((c) => c.purpose === 'orchestrator')?.model).toBe('gpt-4.1-mini');
      expect(effective.find((c) => c.purpose === 'image')?.model).toBe('gpt-image-2.5-flare');
      expect(effective.find((c) => c.purpose === 'text')?.model).toBe('gpt-4o-mini');
    });
  });

  describe('5. Padrões do Sistema e Catálogo de Modelos', () => {
    it('openAIDefaults utiliza exclusivamente modelos autorizados', () => {
      // Mock da credencial para que openAIDefaults retorne os modelos
      vi.stubEnv('OPENAI_API_KEY', 'test-key');
      const defaults = openAIDefaults();
      for (const d of defaults) {
        if (d.purpose === 'image') {
          expect(isAllowedImageModel(d.model)).toBe(true);
        } else if (d.purpose === 'embedding') {
          expect(d.model).toBe('text-embedding-3-small');
        } else {
          expect(isAllowedTextModel(d.model)).toBe(true);
        }
      }
    });

    it('openAIModels expõe apenas modelos da whitelist', () => {
      vi.stubEnv('OPENAI_API_KEY', 'test-key');
      const models = openAIModels();
      for (const m of models) {
        if (m.purpose === 'image') {
          expect(isAllowedImageModel(m.model)).toBe(true);
        } else if (m.purpose === 'embedding') {
          expect(m.model).toBe('text-embedding-3-small');
        } else {
          expect(isAllowedTextModel(m.model)).toBe(true);
        }
      }
    });
  });
});
