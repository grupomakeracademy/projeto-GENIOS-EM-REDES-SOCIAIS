import 'server-only';
import type { ProviderId } from '@/lib/domain';

const variables = {
  openai: ['OPENAI_API_KEY', 'OPENAI_KEY'],
  google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
} as const;

// Never serialize this value or import this module from client components.
export function serverCredential(provider: ProviderId): string | undefined {
  for (const name of variables[provider]) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
}

export function credentialStatus() {
  return {
    openaiConfigured: Boolean(serverCredential('openai')),
    geminiConfigured: Boolean(serverCredential('google')),
    anthropicConfigured: Boolean(serverCredential('anthropic')),
  };
}
