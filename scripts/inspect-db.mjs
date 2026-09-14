import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const total = await client.query('SELECT count(*) FROM public.assets;');
  const agents = await client.query("SELECT id, name, visual_settings->'reference_ids' as refs FROM public.agents;");
  console.log('Total assets:', total.rows[0].count);
  for (const ag of agents.rows) {
    console.log(`Agent ${ag.name} (${ag.id}): refs =`, ag.refs);
  }
  await client.end();
}
run().catch(console.error);
