import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockAuth = {
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  setSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  admin: {
    generateLink: vi.fn(),
    createUser: vi.fn(),
  },
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

import { POST } from '@/app/api/auth/route';
import { GET } from '@/app/auth/callback/route';

describe('Fluxo de Recuperação e Redefinição de Senha', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TESTE 1 — Solicitação de Recuperação (Conta Existente)', () => {
    it('dispara resetPasswordForEmail com email e redirectTo corretos', async () => {
      mockAuth.resetPasswordForEmail.mockResolvedValueOnce({
        data: {},
        error: null,
      });

      const req = new Request('http://localhost:3001/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3001',
          'Host': 'localhost:3001',
        },
        body: JSON.stringify({
          action: 'forgot',
          email: 'valid-user@example.com',
        }),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.message).toBe('forgotInstructionsSent');
      expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith(
        'valid-user@example.com',
        expect.objectContaining({
          redirectTo: 'http://localhost:3001/auth/callback?next=/login?mode=reset',
        }),
      );
    });
  });

  describe('TESTE 2 — Redefinição Completa de Senha', () => {
    it('estabelece sessão a partir de tokens no callback e atualiza senha via updateUser', async () => {
      // 1. Session establishment via action: 'session'
      mockAuth.setSession.mockResolvedValueOnce({
        data: { user: { id: 'usr-123', email: 'valid-user@example.com' } },
        error: null,
      });

      const sessionReq = new Request('http://localhost:3001/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3001',
        },
        body: JSON.stringify({
          action: 'session',
          accessToken: 'valid-access-token',
          refreshToken: 'valid-refresh-token',
        }),
      });

      const sessionRes = await POST(sessionReq);
      const sessionJson = await sessionRes.json();
      expect(sessionRes.status).toBe(200);
      expect(sessionJson.ok).toBe(true);
      expect(sessionJson.email).toBe('valid-user@example.com');
      expect(mockAuth.setSession).toHaveBeenCalledWith({
        access_token: 'valid-access-token',
        refresh_token: 'valid-refresh-token',
      });

      // 2. New password update via action: 'reset'
      mockAuth.updateUser.mockResolvedValueOnce({
        data: { user: { id: 'usr-123', email: 'valid-user@example.com' } },
        error: null,
      });

      const resetReq = new Request('http://localhost:3001/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3001',
        },
        body: JSON.stringify({
          action: 'reset',
          password: 'newSecurePassword123#',
        }),
      });

      const resetRes = await POST(resetReq);
      const resetJson = await resetRes.json();
      expect(resetRes.status).toBe(200);
      expect(resetJson.ok).toBe(true);
      expect(resetJson.message).toBe('password_updated');
      expect(mockAuth.updateUser).toHaveBeenCalledWith({
        password: 'newSecurePassword123#',
      });
    });
  });

  describe('TESTE 3 — Tratamento Técnico de Erros', () => {
    it('rejeita input sem email com invalid_input', async () => {
      const req = new Request('http://localhost:3001/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3001',
        },
        body: JSON.stringify({
          action: 'forgot',
        }),
      });

      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe('invalid_input');
    });

    it('rejeita redefinição de senha com menos de 12 caracteres', async () => {
      const req = new Request('http://localhost:3001/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3001',
        },
        body: JSON.stringify({
          action: 'reset',
          password: 'short',
        }),
      });

      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe('invalid_input');
    });

    it('registra e propaga rate_limit quando o provedor rejeita por limite de e-mail (fora de localhost)', async () => {
      mockAuth.resetPasswordForEmail.mockResolvedValueOnce({
        data: null,
        error: {
          status: 429,
          code: 'over_email_send_rate_limit',
          message: 'email rate limit exceeded',
        },
      });

      // Remote host request to test production rate limit behavior without local dev fallback
      const req = new Request('https://app.genios.com/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://app.genios.com',
          'Host': 'app.genios.com',
        },
        body: JSON.stringify({
          action: 'forgot',
          email: 'rate-limited-user@example.com',
        }),
      });

      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(429);
      expect(json.error).toBe('rate_limit');
    });
  });

  describe('TESTE 4 — Segurança e Anti-Enumeração', () => {
    it('retorna resposta neutra idêntica para email não cadastrado sem vazar dados', async () => {
      // Supabase returns { data: {}, error: null } for non-existent users
      mockAuth.resetPasswordForEmail.mockResolvedValueOnce({
        data: {},
        error: null,
      });

      const req = new Request('http://localhost:3001/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3001',
          'Host': 'localhost:3001',
        },
        body: JSON.stringify({
          action: 'forgot',
          email: 'nonexistent-user-123456@example.com',
        }),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.message).toBe('forgotInstructionsSent');
      expect(json.userExists).toBeUndefined();
    });
  });

  describe('TESTE 5 — Callback para Link Inválido ou Expirado', () => {
    it('redireciona para /login?error=recovery_link_expired quando code é inválido', async () => {
      mockAuth.exchangeCodeForSession.mockResolvedValueOnce({
        data: null,
        error: { code: 'otp_expired', message: 'Token has expired', status: 400 },
      });

      const req = new Request('http://localhost:3001/auth/callback?code=invalid-code-123&next=/login?mode=reset');
      const res = await GET(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('/login?error=recovery_link_expired');
    });

    it('redireciona para /login?error=recovery_link_expired quando token_hash é inválido', async () => {
      mockAuth.verifyOtp.mockResolvedValueOnce({
        data: null,
        error: { code: 'otp_expired', message: 'Token has expired', status: 400 },
      });

      const req = new Request('http://localhost:3001/auth/callback?token_hash=invalid-token-hash&type=recovery&next=/login?mode=reset');
      const res = await GET(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('/login?error=recovery_link_expired');
    });

    it('retorna a ponte HTML para extrair hash tokens quando code e token_hash não estão na query string', async () => {
      const req = new Request('http://localhost:3001/auth/callback?next=/login?mode=reset');
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const html = await res.text();
      expect(html).toContain('recovery_link_expired');
      expect(html).toContain('access_token');
      expect(html).toContain('refresh_token');
      expect(html).toContain('/api/auth');
    });
  });
});
