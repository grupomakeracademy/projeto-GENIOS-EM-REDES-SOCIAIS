import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(
    "SELECT id, name, processing_status, content_hash, summary_text FROM public.assets WHERE processing_status = 'processed' LIMIT 3;"
  );
  for (const r of res.rows) {
    console.log(`\n=== Asset: ${r.name} (${r.id}) ===`);
    console.log(`Status: ${r.processing_status} | Hash: ${r.content_hash?.slice(0, 12)}...`);
    console.log(`Summary: ${r.summary_text}`);
  }
  await client.end();
}
run();
