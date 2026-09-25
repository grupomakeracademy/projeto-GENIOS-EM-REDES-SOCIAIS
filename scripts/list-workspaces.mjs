import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    const ws = await client.query(`SELECT * FROM public.workspaces;`);
    console.log('Workspaces:');
    for (const w of ws.rows) {
      console.log(w);
    }
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
