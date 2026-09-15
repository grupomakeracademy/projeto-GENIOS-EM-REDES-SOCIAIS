/** Safe, bounded diagnostics: never retain response bodies, prompts or credentials. */
export class ProviderError extends Error {
  constructor(code: string, public readonly diagnostic: {
    provider: string; operation: string; status?: number; code?: string; param?: string;
  }) { super(code); this.name = 'ProviderError'; }
}
const identifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_.\[\]-]{1,100}$/.test(value) ? value : undefined;
export function providerHttpError(provider: string, operation: string, status: number, body: unknown) {
  const details = body && typeof body === 'object' && 'error' in body ? body.error : undefined;
  const error = details && typeof details === 'object' ? details as Record<string, unknown> : {};
  const code = identifier(error.code);
  const reason = code === 'content_policy_violation' || code === 'moderation_blocked' || code === 'safety_violation'
    ? 'content_policy'
    : status === 401 || status === 403 ? 'authentication_error'
    : code === 'insufficient_quota' ? 'provider_quota_exceeded'
    : status === 429 ? 'rate_limit'
    : status >= 500 ? 'provider_unavailable'
    : 'provider_request_rejected';
  return new ProviderError(reason, { provider, operation, status, code, param: identifier(error.param) });
}
