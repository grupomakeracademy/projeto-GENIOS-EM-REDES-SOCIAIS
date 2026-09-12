import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { credentialStatus, serverCredential } from '@/lib/ai/credentials';
afterEach(() => vi.unstubAllEnvs());
const names = [
  'OPENAI_API_KEY',
  'OPENAI_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
];
function clear() {
  names.forEach((name) => vi.stubEnv(name, ''));
}
it('returns only booleans and does not serialize secrets', () => {
  clear();
  vi.stubEnv('OPENAI_API_KEY', 'secret-test-value');
  expect(credentialStatus()).toEqual({
    openaiConfigured: true,
    geminiConfigured: false,
    anthropicConfigured: false,
  });
  expect(JSON.stringify(credentialStatus())).not.toContain('secret-test-value');
});
it('uses server aliases after empty or whitespace-only canonical values', () => {
  clear();
  vi.stubEnv('OPENAI_API_KEY', '  ');
  vi.stubEnv('OPENAI_KEY', ' fallback ');
  vi.stubEnv('GEMINI_API_KEY', 'gemini-test');
  expect(serverCredential('openai')).toBe('fallback');
  expect(credentialStatus().geminiConfigured).toBe(true);
  vi.stubEnv('OPENAI_API_KEY', 'primary');
  expect(serverCredential('openai')).toBe('primary');
});
it('ignores public environment variables', () => {
  clear();
  vi.stubEnv('NEXT_PUBLIC_OPENAI_API_KEY', 'must-not-be-used');
  expect(credentialStatus().openaiConfigured).toBe(false);
});
