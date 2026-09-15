import { afterEach, expect, it, vi } from 'vitest';
import { startJobRunner } from '@/lib/jobs/runner';
afterEach(() => vi.useRealTimers());
it('consumes work repeatedly without a browser or another worker process', async () => {
  vi.useFakeTimers();
  const tick = vi.fn().mockResolvedValue({ processed: false });
  const stop = startJobRunner(tick);
  await vi.advanceTimersByTimeAsync(15000);
  expect(tick).toHaveBeenCalledTimes(3);
  stop();
  await vi.advanceTimersByTimeAsync(30000);
  expect(tick).toHaveBeenCalledTimes(3);
});
it('recovers automatically after a temporary failure', async () => {
  vi.useFakeTimers();
  const tick = vi.fn().mockRejectedValueOnce(new Error('database_error')).mockResolvedValue({ processed: true });
  const report = vi.fn();
  const stop = startJobRunner(tick, report);
  await vi.advanceTimersByTimeAsync(15000);
  expect(tick).toHaveBeenCalledTimes(3);
  expect(report).toHaveBeenCalledTimes(1);
  stop();
});
it('never overlaps ticks during a long image generation', async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const tick = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const stop = startJobRunner(tick);
  await vi.advanceTimersByTimeAsync(60000);
  expect(tick).toHaveBeenCalledTimes(1);
  stop();
  finish();
  await vi.advanceTimersByTimeAsync(60000);
  expect(tick).toHaveBeenCalledTimes(1);
});
