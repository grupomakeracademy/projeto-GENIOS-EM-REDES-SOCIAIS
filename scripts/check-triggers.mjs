import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT tgname, relname, proname 
      FROM pg_trigger 
      JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid 
      JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid;
    `);
    for (const r of res.rows) {
      if (r.relname === 'users' || r.relname === 'profiles') {
        console.log(r);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
