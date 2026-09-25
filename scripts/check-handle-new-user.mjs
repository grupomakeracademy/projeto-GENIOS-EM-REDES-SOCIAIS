import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
    `);
    console.log('handle_new_user source:', res.rows[0]?.prosrc);
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
