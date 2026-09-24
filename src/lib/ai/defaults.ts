import 'server-only';
import type { AIConfig } from '@/lib/domain';
import { serverCredential } from './credentials';
import {
  ALLOWED_TEXT_MODELS,
  ALLOWED_IMAGE_MODELS,
  isAllowedTextModel,
  enforceModelPolicy,
} from './model-policy';

export function openAIDefaults(): AIConfig[] {
  if (!serverCredential('openai')) return [];
  const orchestratorEnv = process.env.OPENAI_ORCHESTRATOR_MODEL;
  const orchestratorModel =
    orchestratorEnv && isAllowedTextModel(orchestratorEnv) ? orchestratorEnv : 'gpt-4.1-mini';

  const textEnv = process.env.OPENAI_TEXT_MODEL;
  const textModel = textEnv && isAllowedTextModel(textEnv) ? textEnv : 'gpt-4.1-mini';

  return [
    {
      purpose: 'orchestrator',
      provider: 'openai',
      model: orchestratorModel,
    },
    { purpose: 'text', provider: 'openai', model: textModel },
    {
      purpose: 'image',
      provider: 'openai',
      model: 'gpt-image-2.5-flare',
    },
    {
      purpose: 'embedding',
      provider: 'openai',
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    },
  ];
}

export function openAIModels(): AIConfig[] {
  const defaults = openAIDefaults();
  if (!defaults.length) return [];
  const textConfigs: AIConfig[] = ALLOWED_TEXT_MODELS.map((model) => ({
    purpose: 'text',
    provider: 'openai',
    model,
  }));
  const imageConfigs: AIConfig[] = ALLOWED_IMAGE_MODELS.map((model) => ({
    purpose: 'image',
    provider: 'openai',
    model,
  }));

  const all = [...defaults, ...textConfigs, ...imageConfigs];
  const seen = new Set<string>();
  return all.filter((c) => {
    const key = `${c.purpose}:${c.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// A Política Global é soberana e sanitiza configurações anteriores ou salvas.
export function effectiveConfigs(saved: AIConfig[]) {
  const sanitizedSaved = saved.map((s) => enforceModelPolicy(s));
  return [
    ...sanitizedSaved,
    ...openAIDefaults().filter((d) => !sanitizedSaved.some((s) => s.purpose === d.purpose)),
  ];
}
