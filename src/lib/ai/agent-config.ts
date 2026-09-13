import 'server-only';
import { configSchema, type AIConfig } from '@/lib/domain';
import { decrypt } from '@/lib/security/crypto';
import { serverCredential } from './credentials';

export type AgentAIRecord = AIConfig & {
  enabled: boolean;
  credential_ciphertext: string | null;
  configured_by: string | null;
  validated_at: string | null;
};
export function credentialContext(
  workspace: string,
  agent: string,
  purpose: string,
  provider: string,
) {
  return `agent-ai:${workspace}:${agent}:${purpose}:${provider}`;
}
export function usableOverride(
  row: AgentAIRecord | undefined | null,
  workspace: string,
  agent: string,
) {
  if (!row?.enabled || !row.configured_by || !row.validated_at) return null;
  const parsed = configSchema.safeParse(row);
  if (!parsed.success) return null;
  try {
    const key = row.credential_ciphertext
      ? decrypt(
          row.credential_ciphertext,
          credentialContext(workspace, agent, row.purpose, row.provider),
        )
      : serverCredential(row.provider);
    return key ? { config: parsed.data, key } : null;
  } catch {
    return null;
  }
}
