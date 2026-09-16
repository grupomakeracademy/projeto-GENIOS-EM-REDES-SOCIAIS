import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({
  text: vi.fn(),
  rpc: vi.fn(),
  row: { id: '', agent_id: 'agent', title: 'Curso', channel: null, content_id: null },
}));
vi.mock('@/lib/ai/service', () => ({
  AIService: class {
    text = state.text;
  },
}));
vi.mock('@/lib/supabase/server', () => ({ adminClient: () => ({ rpc: state.rpc }) }));
import { captionInput, improveCaption } from '@/features/captions/service';
import { CaptionEditor } from '@/features/captions/editor';
const id = '11111111-1111-4111-8111-111111111111',
  request = '22222222-2222-4222-8222-222222222222';
const chain: any = {};
chain.select = chain.eq = chain.is = () => chain;
chain.maybeSingle = async () => ({ data: state.row, error: null });
const ctx = {
  db: { from: () => chain },
  workspaceId: 'workspace',
  user: { id: 'user' },
} as unknown as Parameters<typeof improveCaption>[0];
const input = {
  scope: 'import' as const,
  id,
  request_id: request,
  kind: 'magic' as const,
  caption: 'Conheça nosso curso.',
};
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw Error('External network forbidden');
    }),
  );
  state.text.mockReset().mockResolvedValue({ caption: 'Conheça o curso.' });
  state.rpc
    .mockReset()
    .mockImplementation(async (_name, args) => ({
      data:
        args.phase === 'finish'
          ? { caption: args.output, cost: 0, balance: 10, completed: true }
          : { cost: 0, completed: false },
      error: null,
    }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it('improves only textual context and commits success before returning without saving caption', async () => {
  const result = await improveCaption(ctx, input);
  expect(result.caption).toBe('Conheça o curso.');
  const payload = state.text.mock.calls[0][2];
  expect(Object.keys(payload).sort()).toEqual(['caption', 'context', 'max_characters', 'task']);
  expect(payload.caption).toBe(input.caption);
  expect(payload.context).toEqual({ title: 'Curso' });
  expect(state.rpc.mock.calls.map((c) => c[1].phase)).toEqual(['begin', 'finish']);
});
it('storytelling requires three narrative blocks and requests no invented facts', async () => {
  state.text.mockResolvedValue({
    caption: 'A dúvida aparece.\n\nNosso curso ajuda.\n\nConheça o curso.',
  });
  await improveCaption(ctx, { ...input, kind: 'storytelling' });
  const task = state.text.mock.calls[0][2].task;
  expect(task).toContain('Dor/situação/problema');
  expect(task).toContain('Solução → CTA');
  expect(task).toContain('Não invente fatos');
});
it('failed provider and invalid storytelling release the operation without completing or replacing caption', async () => {
  state.text.mockRejectedValueOnce(Error('timeout'));
  await expect(improveCaption(ctx, input)).rejects.toThrow('timeout');
  expect(state.rpc.mock.calls.map((c) => c[1].phase)).toEqual(['begin', 'fail']);
  state.rpc.mockClear();
  state.text.mockResolvedValue({ caption: 'Um só parágrafo.' });
  await expect(improveCaption(ctx, { ...input, kind: 'storytelling' })).rejects.toThrow();
  expect(state.rpc.mock.calls.map((c) => c[1].phase)).toEqual(['begin', 'fail']);
});
it('replays successful requests without another provider call', async () => {
  state.rpc.mockResolvedValue({
    data: { completed: true, caption: 'Já concluído', cost: 1, balance: 9 },
    error: null,
  });
  expect((await improveCaption(ctx, input)).caption).toBe('Já concluído');
  expect(state.text).not.toHaveBeenCalled();
});
it('blocks empty captions and unavailable balance before invoking text provider', async () => {
  expect(() => captionInput.parse({ ...input, caption: ' ' })).toThrow();
  state.rpc.mockResolvedValue({ data: null, error: { message: 'insufficient_quota' } });
  await expect(improveCaption(ctx, input)).rejects.toThrow('Saldo insuficiente');
  expect(state.text).not.toHaveBeenCalled();
});
it('renders the shared caption actions in the required order and disables AI on empty input', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CaptionEditor, {
      scope: 'import',
      id,
      value: '',
      onChange: () => {},
      onSave: async () => {},
    }),
  );
  const labels = ['Copiar texto', 'Prompt Mágico', 'Storytelling', 'Salvar alterações'];
  const offsets = labels.map((label) => markup.indexOf(label));
  expect(offsets.every((n) => n > 0)).toBe(true);
  expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  expect(markup).not.toContain('Regenerar texto');
  expect(markup).toMatch(/disabled=""[^>]*>Prompt Mágico/);
  expect(markup).toMatch(/disabled=""[^>]*>Storytelling/);
});
