import { test, expect, vi, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  global: {} as Record<string, unknown>,
  probe: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  adminClient: () => ({
    from: (table: string) => {
      let purpose = '';
      const q = {
        select: () => q,
        eq: (key: string, value: string) => {
          if (key === 'purpose') purpose = value;
          return q;
        },
        maybeSingle: async () => ({
          data: (table === 'agent_ai_configs' ? state.rows : state.global)[purpose] || null,
          error: null,
        }),
      };
      return q;
    },
  }),
}));
vi.mock('@/lib/ai/validate-model', () => ({ validateAgentModel: state.probe }));
import { AIService } from '@/lib/ai/service';
import { AppError } from '@/lib/security/context';
afterEach(() => {
  state.rows = {};
  state.global = {};
  state.probe.mockReset();
  vi.unstubAllEnvs();
});
test('each purpose independently chooses validated override or official global', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'fixture');
  state.global.text = { purpose: 'text', provider: 'openai', model: 'gpt-4.1-mini', enabled: true };
  state.rows.image = {
    purpose: 'image',
    provider: 'openai',
    model: 'gpt-image-1',
    enabled: true,
    configured_by: 'super-admin',
    validated_at: '2026-09-13',
    credential_ciphertext: null,
  };
  const service = new AIService('workspace', undefined, 'agent');
  expect((await service.config('text')).model).toBe('gpt-4.1-mini');
  expect((await service.config('image')).model).toBe('gpt-image-1');
  expect(await service.key(await service.config('image'))).toBe('fixture');
  expect(state.probe).toHaveBeenCalledTimes(1);
});
test('revoked credential falls back; connection outage preserves existing error mechanism', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'fixture');
  state.global.text = { purpose: 'text', provider: 'openai', model: 'global-model', enabled: true };
  state.rows.text = {
    purpose: 'text',
    provider: 'openai',
    model: 'custom-model',
    enabled: true,
    configured_by: 'admin',
    validated_at: '2026-09-13',
    credential_ciphertext: null,
  };
  state.probe.mockRejectedValueOnce(new AppError('API Key inválida', 400));
  expect((await new AIService('w', undefined, 'a').config('text')).model).toBe('global-model');
  state.probe.mockRejectedValueOnce(new AppError('Falha de conexão', 503));
  await expect(new AIService('w', undefined, 'a').config('text')).rejects.toThrow(
    'provider_unavailable',
  );
});
