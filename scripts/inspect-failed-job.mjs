import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function inspectFailedJob() {
  await client.connect();

  console.log('=== ÚLTIMOS JOBS COM ERRO (status = FAILED) ===');
  const res = await client.query(`
    SELECT id, type, status, payload, last_error, scheduled_at, started_at, completed_at
    FROM public.background_jobs
    WHERE status = 'FAILED'
    ORDER BY scheduled_at DESC
    LIMIT 3;
  `);

  for (const job of res.rows) {
    console.log(`\nJob ID: ${job.id}`);
    console.log(`Type: ${job.type} | Status: ${job.status}`);
    console.log(`Last Error: ${job.last_error}`);
    console.log(`Scheduled: ${job.scheduled_at} | Started: ${job.started_at} | Completed: ${job.completed_at}`);
    console.log(`Payload:`, JSON.stringify(job.payload, null, 2));

    // Also check agent_runs
    const runRes = await client.query(
      `SELECT * FROM public.agent_runs WHERE job_id = $1;`,
      [job.id]
    );
    console.log('Agent Run Stage:', runRes.rows);
  }

  // Also check if there's any usage_events for this job
  if (res.rows.length > 0) {
    const usageRes = await client.query(
      `SELECT * FROM public.usage_events WHERE job_id = $1;`,
      [res.rows[0].id]
    );
    console.log('\nUsage events for latest failed job:', usageRes.rows);
  }

  await client.end();
}

inspectFailedJob().catch(console.error);
