import 'server-only';
import type { AIConfig } from '@/lib/domain';
import { serverCredential } from './credentials';

export function openAIDefaults(): AIConfig[] {
  if (!serverCredential('openai')) return [];
  return [
    {
      purpose: 'orchestrator',
      provider: 'openai',
      model: process.env.OPENAI_ORCHESTRATOR_MODEL || 'gpt-4.1',
    },
    { purpose: 'text', provider: 'openai', model: process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini' },
    {
      purpose: 'image',
      provider: 'openai',
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare',
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
  return [
    ...defaults,
    ...['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2']
      .filter((model) => !defaults.some((d) => d.model === model))
      .map((model): AIConfig => ({ purpose: 'image', provider: 'openai', model })),
  ];
}

// Explicit saved configurations always take precedence, including disabled entries.
export function effectiveConfigs(saved: AIConfig[]) {
  return [...saved, ...openAIDefaults().filter((d) => !saved.some((s) => s.purpose === d.purpose))];
}
