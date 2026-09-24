import pg from 'pg';
import { readFile } from 'node:fs/promises';

const dryRun = process.argv.includes('--dry-run');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await db.connect();
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout = '5s'");
  await db.query("SELECT pg_advisory_xact_lock(hashtext('five_optimizations_migration'))");
  for (const [version, name] of [
    ['202609240001', 'import_video_and_events'],
    ['202609240002', 'account_storage'],
    ['202609240003', 'storage_upload_lifecycle'],
  ]) {
    const applied = await db.query('SELECT version FROM supabase_migrations.schema_migrations WHERE version=$1', [version]);
    if (applied.rowCount) { console.log(`${version}: already applied`); continue; }
    await db.query(await readFile(new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url), 'utf8'));
    await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES($1,$2)', [version, name]);
    console.log(`${version}: ${dryRun ? 'validated' : 'prepared'}`);
  }
  const usage = await db.query('SELECT count(*) AS objects, coalesce(sum(size_bytes),0) AS bytes FROM public.account_storage_objects');
  console.log('Storage reconciliation:', usage.rows[0]);
  await db.query(dryRun ? 'ROLLBACK' : 'COMMIT');
  console.log(dryRun ? 'Validation complete; all changes rolled back.' : 'Migrations committed.');
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  console.error('Migration failed:', error.code || 'unknown', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
