import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ output: '' }));
vi.mock('@/lib/security/context', () => ({
  guard: async () => ({ workspaceId: 'test-workspace' }),
  AppError: class AppError extends Error { constructor(message: string, public status = 400) { super(message); } },
  fail: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : 'Erro' },
    { status: error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500 }),
}));
vi.mock('@/lib/security/agent', () => ({ requireAgent: async () => ({}) }));
vi.mock('@/lib/ai/service', () => ({ AIService: class { async text() { return { improved_text: state.output }; } } }));

import { POST } from '@/app/api/ai/magic-prompt/route';

function request(text: string) {
  return new Request('http://localhost/api/ai/magic-prompt', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'instruction', text }) });
}

describe('limite da pauta no Prompt Mágico', () => {
  it('aceita exatamente 2.000 caracteres sem cortar a resposta', async () => {
    state.output = 'A'.repeat(2000);
    const response = await POST(request('pauta de teste'));
    expect(response.status).toBe(200);
    expect((await response.json()).refinedText).toBe(state.output);
  });

  it('recusa resposta da IA acima do limite em vez de truncar', async () => {
    state.output = 'B'.repeat(2001);
    const response = await POST(request('pauta de teste'));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('2.000');
  });

  it('recusa entrada acima do limite antes de chamar a IA', async () => {
    state.output = 'curta';
    const response = await POST(request('C'.repeat(2001)));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('2.000');
  });
});
