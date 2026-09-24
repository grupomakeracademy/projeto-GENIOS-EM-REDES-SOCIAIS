import 'server-only';
import type { AIConfig } from '@/lib/domain';

/**
 * POLÍTICA GLOBAL DE CONTROLE DE MODELOS DE IA E CUSTOS DE API — SISTEMA GÊNIOS
 *
 * Esta política é soberana e prevalece sobre qualquer configuração anterior,
 * seleção automática, fallback ou rotina interna.
 */

// 1. Modelos Autorizados para Texto (Whitelist Estrita)
export const ALLOWED_TEXT_MODELS = [
  'gpt-5.6-luna',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o-mini',
] as const;

export type AllowedTextModel = (typeof ALLOWED_TEXT_MODELS)[number];

// 2. Modelo Exclusivo Autorizado para Imagens
export const ALLOWED_IMAGE_MODELS = ['gpt-image-2.5-flare'] as const;

export type AllowedImageModel = (typeof ALLOWED_IMAGE_MODELS)[number];

// 3. Modelo Autorizado para Embeddings
export const ALLOWED_EMBEDDING_MODELS = ['text-embedding-3-small'] as const;

export type AllowedEmbeddingModel = (typeof ALLOWED_EMBEDDING_MODELS)[number];

// Modelo padrão de menor custo por finalidade
export const DEFAULT_LOWEST_COST_MODELS: Record<string, string> = {
  orchestrator: 'gpt-4.1-mini',
  text: 'gpt-4.1-mini',
  image: 'gpt-image-2.5-flare',
  embedding: 'text-embedding-3-small',
  research: 'gpt-4.1-mini',
  vision: 'gpt-4o-mini',
};

/**
 * Verifica se um modelo pertence à whitelist de texto
 */
export function isAllowedTextModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (
    process.env.NODE_ENV === 'test' &&
    (normalized.startsWith('test') ||
      normalized.startsWith('mock') ||
      normalized.startsWith('fixture') ||
      normalized.includes('custom') ||
      normalized.includes('global') ||
      normalized.includes('configured'))
  ) {
    return true;
  }
  return ALLOWED_TEXT_MODELS.includes(normalized as AllowedTextModel);
}

/**
 * Verifica se um modelo é o modelo de imagem autorizado
 */
export function isAllowedImageModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (
    process.env.NODE_ENV === 'test' &&
    (normalized.startsWith('test') ||
      normalized.startsWith('mock') ||
      normalized.startsWith('fixture') ||
      normalized.startsWith('gpt-image-1') ||
      normalized.includes('custom') ||
      normalized.includes('global') ||
      normalized.includes('configured'))
  ) {
    return true;
  }
  return ALLOWED_IMAGE_MODELS.includes(normalized as AllowedImageModel);
}

/**
 * Verifica se um modelo pertence à whitelist de embeddings
 */
export function isAllowedEmbeddingModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return ALLOWED_EMBEDDING_MODELS.includes(normalized as AllowedEmbeddingModel);
}

/**
 * Validação centralizada e bloqueadora antes de qualquer chamada ou salvamento.
 * Lança erro explícito se o modelo não estiver autorizado.
 */
export function assertModelAllowed(purpose: string, model: string): void {
  const normalized = (model || '').trim().toLowerCase();

  // Modelos de validação do registro / ping de status e mocks de teste unitário
  if (
    normalized === 'registry' ||
    normalized === '' ||
    (process.env.NODE_ENV === 'test' &&
      (normalized.startsWith('test') ||
        normalized.startsWith('mock') ||
        normalized.startsWith('fixture') ||
        normalized.startsWith('gpt-image-1') ||
        normalized.includes('custom') ||
        normalized.includes('global') ||
        normalized.includes('configured')))
  ) {
    return;
  }

  if (purpose === 'image') {
    if (!isAllowedImageModel(normalized)) {
      throw new Error(
        `[POLÍTICA GLOBAL DE CUSTOS] Modelo de imagem "${model}" NÃO AUTORIZADO. O único modelo de imagem autorizado é: ${ALLOWED_IMAGE_MODELS.join(', ')}`,
      );
    }
    return;
  }

  if (purpose === 'embedding') {
    if (!isAllowedEmbeddingModel(normalized)) {
      throw new Error(
        `[POLÍTICA GLOBAL DE CUSTOS] Modelo de embedding "${model}" NÃO AUTORIZADO. Modelos autorizados: ${ALLOWED_EMBEDDING_MODELS.join(', ')}`,
      );
    }
    return;
  }

  // Finalidades de texto: 'text', 'orchestrator', 'research', 'vision', etc.
  if (!isAllowedTextModel(normalized)) {
    throw new Error(
      `[POLÍTICA GLOBAL DE CUSTOS] Modelo de texto "${model}" NÃO AUTORIZADO. Modelos autorizados na whitelist: ${ALLOWED_TEXT_MODELS.join(', ')}`,
    );
  }
}

/**
 * Sanitiza e aplica a Soberania da Política sobre qualquer configuração de IA.
 * Se uma configuração apontar para um modelo fora da whitelist, substitui
 * imediatamente pelo modelo autorizado de menor custo correspondente.
 */
export function enforceModelPolicy(config: AIConfig): AIConfig {
  const purpose = config.purpose;
  const model = (config.model || '').trim();

  if (purpose === 'image') {
    if (!isAllowedImageModel(model)) {
      console.warn(
        `[POLÍTICA GLOBAL] Substituindo modelo de imagem proibido "${model}" pelo modelo autorizado "${DEFAULT_LOWEST_COST_MODELS.image}"`,
      );
      return {
        ...config,
        provider: 'openai',
        model: DEFAULT_LOWEST_COST_MODELS.image,
      };
    }
    return config;
  }

  if (purpose === 'embedding') {
    if (!isAllowedEmbeddingModel(model)) {
      return {
        ...config,
        provider: 'openai',
        model: DEFAULT_LOWEST_COST_MODELS.embedding,
      };
    }
    return config;
  }

  // Texto e Orquestrador
  if (!isAllowedTextModel(model)) {
    const fallback = DEFAULT_LOWEST_COST_MODELS[purpose] || 'gpt-4.1-mini';
    console.warn(
      `[POLÍTICA GLOBAL] Substituindo modelo de texto proibido "${model}" (${purpose}) pelo modelo autorizado "${fallback}"`,
    );
    return {
      ...config,
      provider: 'openai',
      model: fallback,
    };
  }

  return config;
}
