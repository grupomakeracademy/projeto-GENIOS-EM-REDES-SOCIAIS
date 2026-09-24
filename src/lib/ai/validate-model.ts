import 'server-only';
import type { AIConfig } from '@/lib/domain';
import { AppError } from '@/lib/security/context';
import { auditAICall } from './audit';
import {
  isAllowedTextModel,
  isAllowedImageModel,
  isAllowedEmbeddingModel,
  ALLOWED_TEXT_MODELS,
  ALLOWED_IMAGE_MODELS,
  ALLOWED_EMBEDDING_MODELS,
} from './model-policy';

// Read-only provider probe: no prompts, generated assets or secret-bearing logs.
export async function validateAgentModel(config: AIConfig, key: string) {
  // Verificação estrita da Política Global antes de qualquer chamada ou probe
  if (config.provider === 'openai') {
    if (config.purpose === 'image') {
      if (!isAllowedImageModel(config.model)) {
        throw new AppError(
          `Modelo de imagem não autorizado pela Política Global. O único modelo autorizado é: ${ALLOWED_IMAGE_MODELS.join(', ')}.`,
          400,
        );
      }
    } else if (config.purpose === 'embedding') {
      if (!isAllowedEmbeddingModel(config.model)) {
        throw new AppError(
          `Modelo de embedding não autorizado pela Política Global. Modelos autorizados: ${ALLOWED_EMBEDDING_MODELS.join(', ')}.`,
          400,
        );
      }
    } else {
      if (!isAllowedTextModel(config.model)) {
        throw new AppError(
          `Modelo de texto não autorizado pela Política Global de Modelos e Custos. Modelos autorizados na whitelist: ${ALLOWED_TEXT_MODELS.join(', ')}.`,
          400,
        );
      }
    }
  }

  const model = encodeURIComponent(config.model.replace(/^models\//, ''));
  const base =
    config.provider === 'openai'
      ? 'https://api.openai.com/v1/models/'
      : config.provider === 'anthropic'
        ? 'https://api.anthropic.com/v1/models/'
        : 'https://generativelanguage.googleapis.com/v1beta/models/';
  let response: Response;
  const finishAudit = await auditAICall(config.provider,base+model,config.model,'model_validation',{source:'src/lib/ai/validate-model.ts:validateAgentModel',reason:'model_configuration_validation'});
  try {
  try {
    response = await fetch(base + model, {
      headers:
        config.provider === 'openai'
          ? { Authorization: `Bearer ${key}` }
          : config.provider === 'anthropic'
            ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
            : { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    throw new AppError('Falha de conexão com o provedor. Tente novamente.', 503);
  }
  if (!response.ok)
    throw new AppError(
      response.status === 401 || response.status === 403
        ? 'API Key inválida ou sem permissão para este modelo.'
        : response.status === 404
          ? 'Modelo inválido ou indisponível para esta API Key.'
          : response.status === 429
            ? 'Limite de validações do provedor atingido. Tente novamente.'
            : 'Falha de conexão com o provedor.',
      response.status === 429 ? 429 : response.status >= 500 ? 503 : 400,
    );
  const metadata = await response.json();
  const image = /^(gpt-image|dall-e)/.test(config.model);
  const vector = /^text-embedding/.test(config.model);
  if (
    config.provider === 'openai' &&
    (config.purpose === 'image'
      ? !image
      : config.purpose === 'embedding'
        ? !vector
        : !/^(gpt-|chatgpt-|o[134](?:-|$))/.test(config.model) || image || vector)
  )
    throw new AppError('Modelo incompatível com a função selecionada.');
  if (config.provider === 'google') {
    const method = config.purpose === 'embedding' ? 'embedContent' : 'generateContent';
    if (
      !metadata.supportedGenerationMethods?.includes(method) ||
      (config.purpose === 'image' && !/image/.test(config.model))
    )
      throw new AppError('Modelo incompatível com a função selecionada.');
  }
  if (config.provider === 'anthropic' && !metadata.id) throw new AppError('Modelo inválido.');
  finishAudit?.('completed');
  } catch (error) {
    finishAudit?.('failed');
    throw error;
  }
}
