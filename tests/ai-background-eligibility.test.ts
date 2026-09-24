import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ rows: {} as Record<string, unknown> }));
vi.mock('@/lib/supabase/server', () => ({
  adminClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: state.rows[table] ?? null, error: null }),
      };
      return q;
    },
  }),
}));
import { assertJobEligible, routineMatches } from '@/lib/jobs/eligibility';
import { withAICallContext } from '@/lib/ai/audit';
import { apiJSON } from '@/lib/ai/providers';
import type { Job } from '@/lib/jobs/pipeline';
const schedule = {
  id: 'schedule',
  enabled: true,
  local_time: '08:00',
  timezone: 'America/Sao_Paulo',
  weekdays: [2, 3],
};
const payload = {
  agent_id: 'agent',
  origin: 'routine',
  schedule_id: 'schedule',
  scheduled_for: '2026-09-15T11:00:00Z',
  schedule_fingerprint: JSON.stringify([schedule.local_time, schedule.weekdays, schedule.timezone]),
};
const job = {
  id: 'job',
  workspace_id: 'workspace',
  lock_token: 'token',
  type: 'agent_run',
  attempts: 1,
  max_attempts: 3,
  payload,
} as Job;
beforeEach(() => {
  state.rows = {
    background_jobs: {
      status: 'RUNNING',
      lock_token: 'token',
      lease_until: new Date(Date.now() + 60000).toISOString(),
      payload,
    },
    agents: { id: 'agent', active: true },
    agent_schedules: schedule,
  };
});
it('rejects scheduled generation and accepts explicit manual generation with routine inactive', async () => {
  await expect(assertJobEligible(job)).rejects.toThrow('job_not_eligible');
  state.rows.agents = { id: 'agent', active: false };
  await expect(
    assertJobEligible({ ...job, payload: { agent_id: 'agent', origin: 'manual', dispatch_mode: 'user_request' } }),
  ).resolves.toEqual({ runId: undefined });
});
it.each(['disabled', 'changed', 'missing', 'archived', 'imported', 'deleted', 'lease'])(
  'rejects %s jobs before provider access',
  async (kind) => {
    if (kind === 'disabled') state.rows.agent_schedules = { ...schedule, enabled: false };
    if (kind === 'changed') state.rows.agent_schedules = { ...schedule, local_time: '09:00' };
    if (kind === 'missing') state.rows.agents = null;
    if (kind === 'archived') state.rows.content_items = { status: 'ARCHIVED' };
    if (kind === 'imported')
      state.rows.content_items = { status: 'APPROVED', strategy: { source: 'import' } };
    if (kind === 'deleted')
      state.rows.background_jobs = {
        ...(state.rows.background_jobs as object),
        payload: { deleted: true },
      };
    if (kind === 'lease')
      state.rows.background_jobs = {
        ...(state.rows.background_jobs as object),
        lock_token: 'revoked',
      };
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    try {
      await expect(
        withAICallContext(
          { trigger: 'scheduled_routine', beforeCall: () => assertJobEligible(job) },
          () =>
            apiJSON(
              'https://api.openai.com/v1/chat/completions',
              'secret',
              { model: 'fixture' },
              'openai',
            ),
        ),
      ).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  },
);
it('rejects early, wrong-day and legacy untraceable routine occurrences', () => {
  expect(routineMatches(payload, schedule, new Date('2026-09-15T10:59:00Z'))).toBe(false);
  expect(routineMatches({ ...payload, scheduled_for: '2026-09-14T11:00:00Z' }, schedule)).toBe(
    false,
  );
  expect(routineMatches({ origin: 'routine' }, schedule)).toBe(false);
});
it('attributes authorized provider calls without logging secrets or prompts', async () => {
  const logger = vi.spyOn(console, 'info').mockImplementation(() => {});
  const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  try {
    await withAICallContext(
      { trigger: 'user_action', source: 'test', reason: 'caption', agentId: 'agent' },
      () =>
        apiJSON(
          'https://api.openai.com/v1/chat/completions',
          'secret',
          { model: 'fixture', prompt: 'private' },
          'openai',
        ),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith(
      'AI_CALL',
      expect.objectContaining({ trigger: 'user_action', model: 'fixture', reason: 'caption' }),
    );
    expect(JSON.stringify(logger.mock.calls)).not.toMatch(/secret|private/);
  } finally {
    logger.mockRestore();
    vi.unstubAllGlobals();
  }
});
