import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_schema, table_name, column_name 
      FROM information_schema.columns 
      WHERE data_type IN ('text', 'character varying');
    `);
    let foundAny = false;
    for (const row of res.rows) {
      if (['pg_catalog', 'information_schema'].includes(row.table_schema)) continue;
      try {
        const q = await client.query(`SELECT count(*) FROM "${row.table_schema}"."${row.table_name}" WHERE "${row.column_name}"::text ILIKE '%grupomakeracademy%'`);
        if (parseInt(q.rows[0].count) > 0) {
          console.log('Found in', row.table_schema, row.table_name, row.column_name, q.rows[0].count);
          foundAny = true;
        }
      } catch (e) {}
    }
    if (!foundAny) {
      console.log('Nenhuma menção a grupomakeracademy encontrada em nenhuma tabela do banco.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
