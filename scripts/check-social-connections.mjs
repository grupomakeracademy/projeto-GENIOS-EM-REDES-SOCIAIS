import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    const sc = await client.query(`SELECT * FROM public.social_connections;`);
    console.log('social_connections:');
    for (const r of sc.rows) {
      console.log(r);
    }
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
