import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'content_status';");
  console.log('content_status enum labels:', res.rows.map(r => r.enumlabel));
  
  // Check RLS policies on content_items
  const rls = await client.query("SELECT polname, polcmd, polroles::text FROM pg_policy WHERE polrelid = 'public.content_items'::regclass;");
  console.log('content_items policies:', rls.rows);

  await client.end();
}

run().catch(console.error);
