import 'server-only';
import { cookies } from 'next/headers';
import { sessionClient, adminClient } from '@/lib/supabase/server';
import { permitted, type Role } from '@/lib/domain';
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function requireSameOrigin(request: Request) {
  const supplied = request.headers.get('origin');
  if (!supplied) throw new AppError('invalid_origin', 403);
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(request.url).origin);
    if (process.env.APP_ORIGIN) allowed.add(new URL(process.env.APP_ORIGIN).origin);
    const forwardedHost = request.headers.get('x-forwarded-host');
    if (forwardedHost) {
      const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
      allowed.add(`${forwardedProto}://${forwardedHost}`);
    }
    const origin = new URL(supplied).origin;
    if (!allowed.has(origin)) throw new AppError('invalid_origin', 403);
    return origin;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('invalid_origin', 403);
  }
}
export async function context(action: 'read' | 'write' | 'admin' = 'read') {
  const db = await sessionClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new AppError('unauthorized', 401);
  const selected = (await cookies()).get('workspace')?.value;
  let query = db
    .from('workspace_members')
    .select('workspace_id,role,workspaces(id,name,timezone)')
    .eq('user_id', user.id);
  if (selected) query = query.eq('workspace_id', selected);
  const { data: member, error: membershipError } = await query.limit(1).maybeSingle();
  if (membershipError) throw new AppError('database_error', 503);
  if (!member) throw new AppError('onboarding_required', 403);
  if (!permitted(member.role as Role, action)) throw new AppError('forbidden', 403);
  return { db, user, workspaceId: member.workspace_id as string, role: member.role as Role };
}
export async function guard(request: Request, action: 'read' | 'write' | 'admin' = 'read', maxBytes = 12 * 1024 * 1024) {
  if (request.method !== 'GET') {
    requireSameOrigin(request);
    if (Number(request.headers.get('content-length') || 0) > maxBytes)
      throw new AppError('file_too_large', 413);
  }
  const ctx = await context(action);
  if (request.method !== 'GET') {
    const { data, error } = await adminClient().rpc('consume_rate', {
      k: `${ctx.user.id}:${new URL(request.url).pathname}`,
      max_hits: 30,
      window_seconds: 60,
    });
    if (error) throw new AppError('database_error', 503);
    if (!data) throw new AppError('rate_limit', 429);
  }
  return ctx;
}
export function fail(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ error: error.code }, { status: error.status });
  if (error instanceof Error && error.name === 'ZodError')
    return Response.json({ error: 'invalid_input' }, { status: 400 });
  const safe = [
    'setup_required',
    'provider_missing',
    'invalid_output',
    'rate_limit',
    'timeout',
    'authentication_error',
    'provider_unavailable',
    'content_policy',
    'unsupported_capability',
    'invalid_schedule',
    'invalid_timezone',
    'repetitive_topic',
  ];
  const code =
    error instanceof Error && safe.includes(error.message) ? error.message : 'internal_error';
  return Response.json({ error: code }, { status: code === 'setup_required' ? 503 : 400 });
}
export function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new AppError('database_error', 503);
  return result.data;
}
export function required<T>(result: { data: T; error: unknown }): NonNullable<T> {
  const data = checked(result);
  if (data === null || data === undefined) throw new AppError('database_error', 503);
  return data as NonNullable<T>;
}
