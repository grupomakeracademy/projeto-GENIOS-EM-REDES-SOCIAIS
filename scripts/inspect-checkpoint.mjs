import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function inspectCheckpoint() {
  await client.connect();

  const res = await client.query(`
    SELECT checkpoint, error_code
    FROM public.agent_runs
    WHERE job_id = '3722a302-44de-44e7-bd56-897e84614c50';
  `);

  if (res.rows.length) {
    const cp = res.rows[0].checkpoint;
    console.log('Checkpoint keys:', Object.keys(cp));
    console.log('Strategy:', cp.strategy);
    console.log('Variants:', JSON.stringify(cp.variants, null, 2));
  }

  await client.end();
}

inspectCheckpoint().catch(console.error);
