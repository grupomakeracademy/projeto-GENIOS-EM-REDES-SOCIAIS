import { expect, it, vi, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/security/context', () => ({
  guard: vi.fn(),
  fail: () => Response.json({ error: 'unauthorized' }, { status: 401 }),
}));
import { guard } from '@/lib/security/context';
import { GET } from '@/app/api/ai/credentials/status/route';
afterEach(() => vi.restoreAllMocks());
it('requires admin authorization before returning status', async () => {
  vi.mocked(guard).mockRejectedValueOnce(new Error('unauthorized'));
  const response = await GET(new Request('http://localhost/api/ai/credentials/status'));
  expect(response.status).toBe(401);
  expect(await response.json()).not.toHaveProperty('openaiConfigured');
  expect(guard).toHaveBeenCalledWith(expect.any(Request), 'admin');
});
it('returns only boolean fields with no-store headers', async () => {
  vi.mocked(guard).mockResolvedValueOnce({} as Awaited<ReturnType<typeof guard>>);
  const response = await GET(new Request('http://localhost/api/ai/credentials/status'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual([
    'anthropicConfigured',
    'geminiConfigured',
    'openaiConfigured',
  ]);
  expect(Object.values(body).every((value) => typeof value === 'boolean')).toBe(true);
});
