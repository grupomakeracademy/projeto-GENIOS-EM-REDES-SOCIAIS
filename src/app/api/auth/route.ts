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

function logAuthEvent(stage: string, details: Record<string, unknown>) {
  console.log(`[Auth Event] [${new Date().toISOString()}] ${stage}:`, JSON.stringify(details));
}
function logAuthError(stage: string, details: Record<string, unknown>) {
  console.error(`[Auth Error] [${new Date().toISOString()}] ${stage}:`, JSON.stringify(details));
}

export async function POST(request: Request) {
  try {
    const origin = requireSameOrigin(request);
    const body = z
      .object({
        action: z.enum(['login', 'signup', 'forgot', 'reset', 'logout', 'session']),
        fullName: z.string().trim().min(1).max(160).nullable().optional(),
        email: z.string().email().nullable().optional(),
        password: z.string().nullable().optional(),
        confirmPassword: z.string().nullable().optional(),
        accessToken: z.string().nullable().optional(),
        refreshToken: z.string().nullable().optional(),
      })
      .parse(await request.json());
    const db = await sessionClient();
    let error;
    if (body.action === 'logout') ({ error } = await db.auth.signOut());
    else if (body.action === 'login') {
      if (!body.email || !body.password) throw new AppError('invalid_input');
      const loginTimestamp = new Date().toISOString();
      logAuthEvent('login_attempt', { email: body.email, timestamp: loginTimestamp });
      ({ error } = await db.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      }));
      if (error) {
        logAuthError('login_failed', {
          email: body.email,
          status: error.status,
          code: error.code,
          message: error.message,
        });
      } else {
        logAuthEvent('login_success', { email: body.email, timestamp: new Date().toISOString() });
      }
    } else if (body.action === 'session') {
      if (!body.accessToken || !body.refreshToken) throw new AppError('invalid_input');
      const { data, error: sessionErr } = await db.auth.setSession({
        access_token: body.accessToken,
        refresh_token: body.refreshToken,
      });
      if (sessionErr) {
        logAuthError('set_session_failed', { code: sessionErr.code, message: sessionErr.message });
        throw new AppError('authentication_error', 401);
      }
      logAuthEvent('session_established_from_tokens', { userId: data.user?.id, email: data.user?.email });
      return Response.json({ ok: true, email: data.user?.email });
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
      const redirectTo = `${origin}/auth/callback?next=/login?mode=reset`;
      const requestTimestamp = new Date().toISOString();

      logAuthEvent('recovery_requested', {
        timestamp: requestTimestamp,
        email: body.email,
        redirectTo,
      });

      const { data: _data, error: resetErr } = await db.auth.resetPasswordForEmail(body.email, {
        redirectTo,
      });

      if (resetErr) {
        logAuthError('recovery_request_rejected', {
          timestamp: requestTimestamp,
          email: body.email,
          status: resetErr.status,
          code: resetErr.code,
          message: resetErr.message,
        });

        // If local development environment hit Supabase's email rate limit (3/hr default free limit),
        // use adminClient().auth.admin.generateLink to create the valid recovery link,
        // log it to the server console and file so the developer/tester can access it immediately.
        if (localSignupFallbackAllowed(request, resetErr)) {
          try {
            const { data: linkData, error: linkErr } = await adminClient().auth.admin.generateLink({
              type: 'recovery',
              email: body.email,
              options: { redirectTo },
            });

            if (!linkErr && linkData?.properties?.action_link) {
              const devRecoveryUrl = linkData.properties.action_link;
              logAuthEvent('recovery_dev_fallback_generated', {
                email: body.email,
                devRecoveryUrl,
              });

              try {
                const fs = await import('fs/promises');
                const path = await import('path');
                const logDir = path.resolve(process.cwd(), '.local-logs');
                await fs.mkdir(logDir, { recursive: true });
                await fs.appendFile(
                  path.join(logDir, 'auth-recovery.log'),
                  `[${requestTimestamp}] RECOVERY LINK FOR ${body.email}:\n${devRecoveryUrl}\n\n`,
                  'utf-8',
                );
              } catch {}

              return Response.json({
                ok: true,
                message: 'forgotInstructionsSent',
                devRecoveryUrl,
              });
            } else if (linkErr) {
              logAuthError('recovery_dev_admin_generate_failed', {
                email: body.email,
                linkErr,
              });
            }
          } catch (fallbackErr) {
            logAuthError('recovery_fallback_exception', { error: String(fallbackErr) });
          }
        }

        if (resetErr.status === 429 || resetErr.code === 'over_email_send_rate_limit') {
          throw new AppError('rate_limit', 429);
        }
        if (resetErr.code === 'email_address_invalid') {
          throw new AppError('invalid_email', 400);
        }
        throw new AppError('authentication_error', 400);
      }

      logAuthEvent('recovery_request_accepted', {
        timestamp: requestTimestamp,
        email: body.email,
      });

      return Response.json({ ok: true, message: 'forgotInstructionsSent' });
    } else {
      if (!body.password || body.password.length < 12) throw new AppError('invalid_input');
      const resetTimestamp = new Date().toISOString();
      logAuthEvent('password_reset_attempt', { timestamp: resetTimestamp });

      const { data: updatedData, error: updateErr } = await db.auth.updateUser({
        password: body.password,
      });
      if (updateErr) {
        logAuthError('password_reset_failed', {
          timestamp: resetTimestamp,
          code: updateErr.code,
          status: updateErr.status,
          message: updateErr.message,
        });
        error = updateErr;
      } else {
        logAuthEvent('password_reset_success', {
          timestamp: resetTimestamp,
          userId: updatedData.user?.id,
          email: updatedData.user?.email,
        });
        return Response.json({ ok: true, message: 'password_updated' });
      }
    }
    if (error) {
      const authErrors: Record<string, string> = {
        invalid_credentials: 'invalid_credentials',
        invalid_grant: 'invalid_credentials',
        email_not_confirmed: 'email_not_confirmed',
        user_banned: 'user_banned',
        email_address_invalid: 'invalid_email',
        email_exists: 'account_exists',
        user_already_exists: 'account_exists',
        weak_password: 'weak_password',
        over_email_send_rate_limit: 'rate_limit',
      };
      let resolvedCode = authErrors[error.code || ''];
      if (!resolvedCode && error.message) {
        const msg = error.message.toLowerCase();
        if (msg.includes('invalid login credentials') || msg.includes('invalid credentials') || msg.includes('invalid_grant')) {
          resolvedCode = 'invalid_credentials';
        } else if (msg.includes('email not confirmed')) {
          resolvedCode = 'email_not_confirmed';
        }
      }
      throw new AppError(
        error.status === 429
          ? 'rate_limit'
          : resolvedCode || 'authentication_error',
        400,
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
