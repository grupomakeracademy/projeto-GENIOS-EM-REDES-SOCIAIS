import pg from 'pg';
import { readFile } from 'node:fs/promises';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await db.connect();
  await db.query('BEGIN');
  const version = '202609150002';
  const applied = await db.query(
    'select version from supabase_migrations.schema_migrations where version=$1',
    [version],
  );
  if (!applied.rowCount) {
    await db.query(
      await readFile(
        new URL(
          '../supabase/migrations/202609150002_caption_import_management.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.query(
      'insert into supabase_migrations.schema_migrations(version,name) values($1,$2)',
      [version, 'caption_import_management'],
    );
  }
  await db.query('COMMIT');
  console.log('Migração de legendas e gestão de importações aplicada/verificada.');
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  console.error('Falha ao aplicar migração:', error instanceof Error ? error.message : 'erro');
  process.exitCode = 1;
} finally {
  await db.end();
}
