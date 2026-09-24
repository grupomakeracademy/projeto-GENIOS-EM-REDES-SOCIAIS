import { AsyncLocalStorage } from 'node:async_hooks';

export type AICallContext = {
  trigger: 'user_action' | 'scheduled_routine' | 'retry' | 'system_internal' | 'unknown';
  source: string;
  reason: string;
  jobId?: string;
  attempt?: number;
  runId?: string;
  contentId?: string;
  agentId?: string;
  beforeCall?: () => Promise<void | { runId?: string }>;
};
const context = new AsyncLocalStorage<AICallContext>();
export function withAICallContext<T>(details: Partial<AICallContext>, action: () => T): T {
  return context.run(
    { trigger: 'unknown', source: 'unknown', reason: 'unknown', ...context.getStore(), ...details },
    action,
  );
}
// Logs contain attribution only: never prompts, response bodies, credentials or query strings.
export async function auditAICall(
  provider: string,
  endpoint: string,
  model: string,
  type: string,
  details?: Partial<AICallContext>,
) {
  const current = { ...context.getStore(), ...details };
  const execution = await current.beforeCall?.();
  const callId = crypto.randomUUID();
  const attribution = {
    callId, timestamp: new Date().toISOString(), attempt: current.attempt ?? null,
    provider,
    model,
    type,
    endpoint: new URL(endpoint).pathname,
    source: current.source || 'unknown',
    reason: current.reason || 'unknown',
    trigger: current.trigger || 'unknown',
    jobId: current.jobId || null,
    runId: execution?.runId || current.runId || null,
    contentId: current.contentId || null,
    agentId: current.agentId || null,
  };
  console.info('AI_CALL', attribution);
  return (status: string, tokens?: { input?: number; output?: number }) => console.info('AI_CALL_RESULT', { ...attribution, finishedAt: new Date().toISOString(), status, tokens });
}
