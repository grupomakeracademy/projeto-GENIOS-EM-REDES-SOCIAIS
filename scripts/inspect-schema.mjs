import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  const client = await pool.connect();
  try {
    const cols = await client.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles';");
    console.log('profiles columns:', cols.rows);
    const wmCols = await client.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='workspace_members';");
    console.log('workspace_members columns:', wmCols.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
