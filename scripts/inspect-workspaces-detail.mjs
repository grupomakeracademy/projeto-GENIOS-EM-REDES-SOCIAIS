import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    const ws = await client.query('SELECT id, name FROM public.workspaces;');
    for (const w of ws.rows) {
      const agents = await client.query('SELECT id, name FROM public.agents WHERE workspace_id = $1;', [w.id]);
      console.log(`Workspace ${w.name} (${w.id}): agents=${agents.rows.map(a => a.name).join(', ')}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
