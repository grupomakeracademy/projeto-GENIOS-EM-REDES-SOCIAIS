import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function check() {
  await client.connect();
  
  console.log('=== 1. ÚLTIMOS USAGE_EVENTS REGISTRADOS NO BANCO ===');
  const usageRes = await client.query(`
    SELECT id, created_at, provider, model, operation, latency_ms, input_tokens, output_tokens, images
    FROM public.usage_events
    ORDER BY created_at DESC
    LIMIT 15;
  `);
  for (const r of usageRes.rows) {
    console.log(`[${r.created_at.toISOString()}] ${r.provider} / ${r.model} (${r.operation}): in=${r.input_tokens}, out=${r.output_tokens}, img=${r.images}`);
  }

  console.log('\n=== 2. ESTRUTURA E LINHAS DE background_jobs ===');
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'background_jobs';
  `);
  console.log('Colunas de background_jobs:', cols.rows.map(c => c.column_name).join(', '));

  const jobsRes = await client.query(`
    SELECT * FROM public.background_jobs ORDER BY 1 DESC LIMIT 5;
  `);
  console.log('Últimos jobs:', jobsRes.rows);

  console.log('\n=== 3. CONTAGEM POR OPERAÇÃO E MODELO NAS ÚLTIMAS 24H ===');
  const statsRes = await client.query(`
    SELECT provider, model, operation, count(*) as calls, sum(input_tokens) as total_in, sum(output_tokens) as total_out, sum(images) as total_images
    FROM public.usage_events
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY provider, model, operation;
  `);
  for (const r of statsRes.rows) {
    console.log(`${r.provider} | ${r.model} | ${r.operation} | Chamadas: ${r.calls} | In: ${r.total_in} | Out: ${r.total_out} | Img: ${r.total_images}`);
  }

  await client.end();
}

check().catch(console.error);
