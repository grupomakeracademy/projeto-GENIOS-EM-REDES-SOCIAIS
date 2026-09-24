export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'test') return;
  const state = globalThis as typeof globalThis & { geniosStopJobs?: () => void; geniosStopPublishing?: () => void };
  state.geniosStopJobs?.();
  state.geniosStopJobs = undefined;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const { adminClient } = await import('./lib/supabase/server');
  await adminClient().rpc('expire_generation_jobs');
  // Scheduled publication is preserved. tick cannot create or claim generation jobs.
  if (!state.geniosStopPublishing) {
    const { startJobRunner } = await import('./lib/jobs/runner');
    const { tick } = await import('./lib/jobs/worker');
    state.geniosStopPublishing = startJobRunner(tick);
  }
}
