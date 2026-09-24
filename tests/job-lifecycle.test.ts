import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ tasks: [] as (() => Promise<void>)[], process: vi.fn() }));
vi.mock('next/server', () => ({ after: (task: () => Promise<void>) => state.tasks.push(task) }));
vi.mock('@/lib/jobs/worker', () => ({ processRequestedJob: state.process }));
import { dispatchRequestedJob } from '@/lib/jobs/lifecycle';
beforeEach(() => { state.tasks=[]; state.process.mockReset().mockResolvedValue({ status: 'COMPLETED' }); });
it('does nothing while idle; a request dispatches exactly its job then terminates', async () => {
  expect(state.process).not.toHaveBeenCalled();
  dispatchRequestedJob('job','workspace','actor');
  expect(state.process).not.toHaveBeenCalled();
  expect(state.tasks).toHaveLength(1);
  await state.tasks[0]();
  expect(state.process).toHaveBeenCalledExactlyOnceWith('job','workspace','actor');
  expect(state.tasks).toHaveLength(1);
});
it('does not reschedule a failed task', async () => {
  state.process.mockRejectedValue(new Error('database_error'));
  dispatchRequestedJob('job','workspace','actor');
  await state.tasks[0]();
  expect(state.process).toHaveBeenCalledTimes(1);
  expect(state.tasks).toHaveLength(1);
});
