import { NextResponse } from 'next/server';
import { sessionClient } from '@/lib/supabase/server';
import type { EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const token_hash = url.searchParams.get('token_hash');
  const type = (url.searchParams.get('type') || 'recovery') as EmailOtpType;
  const rawNext = url.searchParams.get('next') || '';
  const next = rawNext === '/login?mode=reset' ? '/login?mode=reset' : '/dashboard';
  const origin = process.env.APP_ORIGIN || url.origin;

  // Case 1: PKCE code exchange flow
  if (code) {
    try {
      const db = await sessionClient();
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error) {
        console.log('[Auth Callback] Successfully exchanged code for session ->', next);
        return NextResponse.redirect(new URL(next, origin));
      }
      console.error('[Auth Callback] Code exchange failed:', error);
      return NextResponse.redirect(new URL('/login?error=recovery_link_expired', origin));
    } catch (err) {
      console.error('[Auth Callback] Unexpected error in code exchange:', err);
      return NextResponse.redirect(new URL('/login?error=recovery_link_expired', origin));
    }
  }

  // Case 2: Email OTP token_hash flow
  if (token_hash) {
    try {
      const db = await sessionClient();
      const { error } = await db.auth.verifyOtp({ token_hash, type });
      if (!error) {
        console.log('[Auth Callback] Successfully verified token_hash ->', next);
        return NextResponse.redirect(new URL(next, origin));
      }
      console.error('[Auth Callback] verifyOtp failed:', error);
      return NextResponse.redirect(new URL('/login?error=recovery_link_expired', origin));
    } catch (err) {
      console.error('[Auth Callback] Unexpected error in verifyOtp:', err);
      return NextResponse.redirect(new URL('/login?error=recovery_link_expired', origin));
    }
  }

  // Case 3: Client-side hash fragment bridge (#access_token=... or #error=...)
  // In Supabase default verify redirect, tokens or errors are returned in the URL hash fragment.
  // Since HTTP requests do not transmit hash fragments to the server, this HTML bridge extracts
  // them in the client, posts tokens to /api/auth (action: 'session') to set cookies, and redirects.
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verificando Acesso — Gênios</title>
  <style>
    body {
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      text-align: center;
      padding: 2.5rem;
      background: #111827;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 1rem;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      max-width: 420px;
      width: 90%;
    }
    .spinner {
      width: 42px;
      height: 42px;
      border: 3px solid rgba(255,255,255,0.12);
      border-top-color: #06b6d4;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1.5rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.5rem; }
    p { color: #94a3b8; font-size: 0.875rem; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Verificando link de acesso...</h2>
    <p>Aguarde enquanto autenticamos sua sessão com segurança.</p>
  </div>
  <script>
    (async function() {
      try {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);

        // 1. Check for errors in hash (e.g. otp_expired)
        const error = params.get('error');
        const errorCode = params.get('error_code');
        if (error || errorCode) {
          console.warn('[Auth Callback Client] Link error detected:', error, errorCode);
          window.location.replace('/login?error=recovery_link_expired');
          return;
        }

        // 2. Check for tokens in hash
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'session',
              accessToken,
              refreshToken
            })
          });

          if (res.ok) {
            const nextTarget = ${JSON.stringify(next)};
            window.location.replace(nextTarget);
            return;
          } else {
            console.error('[Auth Callback Client] Failed to persist session');
            window.location.replace('/login?error=recovery_link_expired');
            return;
          }
        }

        // No tokens or error found
        window.location.replace('/login');
      } catch (e) {
        console.error('[Auth Callback Client Exception]', e);
        window.location.replace('/login?error=recovery_link_expired');
      }
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
