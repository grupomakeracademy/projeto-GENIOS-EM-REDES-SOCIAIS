import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    console.log('--- Checking public schema for grupomakeracademy ---');
    
    // Check all tables in public schema
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('Public tables:', tablesRes.rows.map(r => r.table_name));

    // Search for grupomakeracademy in any text column of users, workspaces, etc.
    const users = await client.query(`SELECT * FROM public.users;`);
    console.log('public.users count:', users.rows.length);
    for (const u of users.rows) {
      console.log('public.user:', u);
    }

    const workspaces = await client.query(`SELECT id, name, created_at FROM public.workspaces;`);
    console.log('\nWorkspaces:');
    for (const w of workspaces.rows) {
      console.log('workspace:', w);
    }
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
