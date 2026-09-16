import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ calls: [] as unknown[][] }));
const query: any = {};
for (const method of ['select', 'eq', 'or', 'order'])
  query[method] = (...args: unknown[]) => {
    state.calls.push([method, ...args]);
    return query;
  };
query.range = async (start: number, end: number) => {
  state.calls.push(['range', start, end]);
  return { data: [], count: 83, error: null };
};
vi.mock('@/lib/security/context', () => ({
  guard: async () => ({
    workspaceId: 'tenant',
    db: {
      from: (table: string) => {
        state.calls.push(['from', table]);
        return query;
      },
    },
  }),
  checked: (result: any) => result.data,
  fail: () => new Response(null, { status: 400 }),
}));
vi.mock('@/features/imports/service', () => ({ uploadImport: vi.fn() }));
import { GET } from '@/app/api/imports/route';
beforeEach(() => {
  state.calls = [];
});
it('recent imports are limited to five on the server with tenant scoping', async () => {
  const result = await GET(new Request('http://localhost/api/imports?recent=1'));
  expect(state.calls).toContainEqual(['eq', 'workspace_id', 'tenant']);
  expect(state.calls).toContainEqual(['range', 0, 4]);
  expect((await result.json()).pageSize).toBe(5);
});
it('history paginates independently of library and combines search/status/agent filters', async () => {
  const agent = '11111111-1111-4111-8111-111111111111';
  const response = await GET(
    new Request('http://localhost/api/imports?page=3&q=teste&status=Rascunho&agent=' + agent),
  );
  expect(state.calls).toContainEqual(['range', 40, 59]);
  expect(state.calls).toContainEqual(['eq', 'agent_id', agent]);
  expect(state.calls).toContainEqual(['eq', 'import_status', 'Rascunho']);
  expect(state.calls).toContainEqual(['or', 'title.ilike.%teste%,caption.ilike.%teste%']);
  expect((await response.json()).total).toBe(83);
});
it.each(['page=0', 'page=-1', 'status=FAKE', 'agent=invalid'])(
  'rejects invalid history query %s',
  async (params) => {
    expect((await GET(new Request('http://localhost/api/imports?' + params))).status).toBe(400);
  },
);
