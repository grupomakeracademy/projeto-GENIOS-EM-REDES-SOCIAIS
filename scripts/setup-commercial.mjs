// Deployment helper: never outputs credentials; public app gets only publishable access.
import { readFile, writeFile, access } from 'node:fs/promises';
import pg from 'pg';
const version = '202609130003';
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
try {
  if (!process.env.DATABASE_URL) throw new Error('missing_configuration');
  await db.connect();
  await db.query('begin');
  await db.query('select pg_advisory_xact_lock($1)', [Number(version)]);
  const applied = await db.query(
    'select version from supabase_migrations.schema_migrations where version=$1',
    [version],
  );
  if (!applied.rowCount) {
    const sql = await readFile(
      new URL('../supabase/migrations/202609130003_commercial_leads.sql', import.meta.url),
      'utf8',
    );
    await db.query(sql);
    await db.query(
      'insert into supabase_migrations.schema_migrations(version, statements, name) values($1,$2,$3)',
      [version, [sql], 'commercial_leads'],
    );
  }
  await db.query('commit');
  const target = new URL('../apps/commercial/.env.local', import.meta.url);
  let exists = true;
  try {
    await access(target);
  } catch {
    exists = false;
  }
  if (!exists) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key || /[\r\n]/.test(url + key)) throw new Error('missing_configuration');
    await writeFile(
      target,
      `SUPABASE_URL=${url}\nSUPABASE_PUBLISHABLE_KEY=${key}\nCOMMERCIAL_ORIGIN=http://127.0.0.1:3000\nPRIVATE_LOGIN_URL=http://127.0.0.1:3001/login\nCOMMERCIAL_WHATSAPP=5519988788759\n`,
      { flag: 'wx' },
    );
  }
  console.log(
    'Migração comercial aplicada; ambiente público configurado sem credenciais administrativas.',
  );
} catch (e) {
  await db.query('rollback').catch(() => {});
  console.error(
    'Falha na configuração comercial:',
    /^[A-Z0-9_]+$/.test(e.code || '') ? e.code : 'configuration_or_connection_error',
  );
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
