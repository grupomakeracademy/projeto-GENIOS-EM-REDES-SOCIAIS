import { z } from 'zod';
import { adminClient, sessionClient } from '@/lib/supabase/server';
import { AppError, fail, requireSameOrigin } from '@/lib/security/context';

function localSignupFallbackAllowed(request: Request, error: { code?: string; status?: number }) {
  const host = new URL(request.url).hostname;
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.LOCAL_SIGNUP_WITHOUT_EMAIL_CONFIRMATION === 'true' &&
    ['127.0.0.1', 'localhost', '::1'].includes(host) &&
    (error.status === 429 || error.code === 'over_email_send_rate_limit')
  );
}

export async function POST(request: Request) {
  try {
    const origin = requireSameOrigin(request);
    const body = z
      .object({
        action: z.enum(['login', 'signup', 'forgot', 'reset', 'logout']),
        fullName: z.string().trim().min(1).max(160).nullable().optional(),
        email: z.string().email().nullable().optional(),
        password: z.string().nullable().optional(),
        confirmPassword: z.string().nullable().optional(),
      })
      .parse(await request.json());
    const db = await sessionClient();
    let error;
    if (body.action === 'logout') ({ error } = await db.auth.signOut());
    else if (body.action === 'login') {
      if (!body.email || !body.password) throw new AppError('invalid_input');
      ({ error } = await db.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      }));
    } else if (body.action === 'signup') {
      if (!body.fullName || !body.email || !body.password || body.password.length < 12)
        throw new AppError('invalid_input');
      if (!body.confirmPassword || body.password !== body.confirmPassword)
        throw new AppError('password_mismatch');
      const signup = await db.auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: { full_name: body.fullName },
        },
      });
      error = signup.error;
      if (error && localSignupFallbackAllowed(request, error)) {
        const created = await adminClient().auth.admin.createUser({
          email: body.email,
          password: body.password,
          email_confirm: true,
          user_metadata: { full_name: body.fullName },
        });
        if (created.error) {
          error = created.error;
        } else {
          const login = await db.auth.signInWithPassword({
            email: body.email,
            password: body.password,
          });
          error = login.error;
          if (!error) return Response.json({ ok: true, signedIn: true });
        }
      }
    } else if (body.action === 'forgot') {
      if (!body.email) throw new AppError('invalid_input');
      await db.auth.resetPasswordForEmail(body.email, {
        redirectTo: `${origin}/auth/callback?next=/login?mode=reset`,
      });
      return Response.json({ ok: true });
    } else {
      if (!body.password || body.password.length < 12) throw new AppError('invalid_input');
      ({ error } = await db.auth.updateUser({ password: body.password }));
    }
    if (error) {
      const authErrors: Record<string, string> = {
        email_address_invalid: 'invalid_email',
        email_exists: 'account_exists',
        user_already_exists: 'account_exists',
        weak_password: 'weak_password',
        over_email_send_rate_limit: 'rate_limit',
      };
      throw new AppError(
        error.status === 429
          ? 'rate_limit'
          : authErrors[error.code || ''] || 'authentication_error',
        400,
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
