/** One sequential consumer per server process; a failed tick never stops polling. */
export function startJobRunner(
  tick: () => Promise<unknown>,
  report: (error: unknown) => void = () => console.error('[Jobs] Tick failed; retrying automatically'),
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let failures = 0;
  const schedule = (delay: number) => {
    timer = setTimeout(async () => {
      try {
        await tick();
        failures = 0;
      } catch (error) {
        failures++;
        report(error);
      } finally {
        if (!stopped) schedule(Math.min(30000, 5000 * Math.max(1, failures)));
      }
    }, delay);
    timer.unref?.();
  };
  schedule(5000);
  return () => { stopped = true; clearTimeout(timer); };
}
