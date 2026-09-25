import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockAuth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  setSession: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  sessionClient: async () => ({
    auth: mockAuth,
  }),
  adminClient: () => ({
    auth: mockAuth,
  }),
  configured: () => true,
}));

import { translate } from '@/lib/i18n';
import { POST } from '@/app/api/auth/route';

describe('Auth Error Mapping & Translations', () => {
  it('translates invalid_credentials clearly and avoids misleading provider error', () => {
    const pt = translate('pt-BR', 'invalid_credentials');
    const en = translate('en-US', 'invalid_credentials');
    const es = translate('es-ES', 'invalid_credentials');

    expect(pt).toBe('E-mail ou senha incorretos.');
    expect(en).toBe('Incorrect email or password.');
    expect(es).toBe('Correo electrónico o contraseña incorrectos.');
    expect(pt).not.toContain('recusada pelo provedor');
  });

  it('translates email_not_confirmed and user_banned appropriately', () => {
    expect(translate('pt-BR', 'email_not_confirmed')).toContain('E-mail não confirmado');
    expect(translate('pt-BR', 'user_banned')).toContain('temporariamente suspensa');
  });

  it('maps Supabase invalid_credentials to AppError with invalid_credentials code (not generic authentication_error)', async () => {
    mockAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: {
        name: 'AuthApiError',
        status: 400,
        code: 'invalid_credentials',
        message: 'Invalid login credentials',
      },
    });

    const req = new Request('http://localhost:3000/api/auth', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        action: 'login',
        email: 'wrong@example.com',
        password: 'BadPassword123!',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe('invalid_credentials');
    expect(body.error).not.toBe('authentication_error');
  });

  it('returns ok: true when credentials are valid', async () => {
    mockAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'user-1' }, session: { access_token: 'tok' } },
      error: null,
    });

    const req = new Request('http://localhost:3000/api/auth', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        action: 'login',
        email: 'valid@example.com',
        password: 'CorrectPassword123#',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
