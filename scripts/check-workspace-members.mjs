import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    const members = await client.query(`
      SELECT wm.workspace_id, wm.user_id, wm.role, u.email
      FROM public.workspace_members wm
      LEFT JOIN auth.users u ON u.id = wm.user_id;
    `);
    console.log('workspace_members count:', members.rows.length);
    for (const m of members.rows) {
      console.log('member:', m);
    }

    const profiles = await client.query(`SELECT * FROM public.profiles;`);
    console.log('\nProfiles count:', profiles.rows.length);
    for (const p of profiles.rows) {
      console.log('profile:', p);
    }
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
