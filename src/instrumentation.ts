export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'test') return;
  // A continuously running Node server owns its consumer. Serverless deployments
  // must explicitly use an external scheduler calling the authenticated tick route.
  if (process.env.JOBS_RUNNER_MODE === 'external') return;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const state = globalThis as typeof globalThis & { geniosStopJobs?: () => void };
  if (state.geniosStopJobs) return;
  const { startJobRunner } = await import('./lib/jobs/runner');
  const { tick } = await import('./lib/jobs/worker');
  state.geniosStopJobs = startJobRunner(tick);
  console.info('[Jobs] Automatic queue and routine processing started with the application');
}
