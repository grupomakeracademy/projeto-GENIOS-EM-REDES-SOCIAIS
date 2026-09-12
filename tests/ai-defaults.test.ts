import { afterEach, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { openAIDefaults, effectiveConfigs } from '@/lib/ai/defaults';
afterEach(() => vi.unstubAllEnvs());
it('enables four server defaults only when a server key exists', () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('OPENAI_KEY', '');
  expect(openAIDefaults()).toEqual([]);
  vi.stubEnv('OPENAI_API_KEY', 'secret-test');
  expect(openAIDefaults().map((c) => c.purpose)).toEqual([
    'orchestrator',
    'text',
    'image',
    'embedding',
  ]);
  expect(JSON.stringify(openAIDefaults())).not.toContain('secret-test');
});
it('preserves explicitly configured models', () => {
  vi.stubEnv('OPENAI_API_KEY', 'secret-test');
  const saved = {
    purpose: 'text' as const,
    provider: 'anthropic' as const,
    model: 'configured-model',
  };
  expect(effectiveConfigs([saved]).find((c) => c.purpose === 'text')).toEqual(saved);
});
