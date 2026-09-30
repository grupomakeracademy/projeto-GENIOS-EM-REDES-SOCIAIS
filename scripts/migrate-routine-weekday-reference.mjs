import pg from 'pg';
import { readFile } from 'node:fs/promises';

const version = '202609290002';
const name = 'routine_weekday_reference';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
await db.connect();
try {
  await db.query('begin');
  const applied = await db.query('select 1 from supabase_migrations.schema_migrations where version=$1', [version]);
  if (!applied.rowCount) {
    const sql = await readFile(new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url), 'utf8');
    await db.query(sql);
    await db.query('insert into supabase_migrations.schema_migrations(version,name) values($1,$2)', [version, name]);
  }
  await db.query('commit');
  console.log(applied.rowCount ? 'Migration já aplicada.' : 'Migration aplicada.');
} catch (error) {
  await db.query('rollback');
  throw error;
} finally {
  await db.end();
}
