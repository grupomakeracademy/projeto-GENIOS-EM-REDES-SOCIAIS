import pg from 'pg';
import { readFile } from 'node:fs/promises';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL ausente.');
  process.exit(1);
}

const db = new pg.Client({ connectionString: url });

async function main() {
  await db.connect();
  const version = '202609140008';
  const name = 'protected_identities_and_exact_assets';

  await db.query('BEGIN');
  const sql = await readFile(new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url), 'utf8');
  await db.query(sql);
  await db.query('INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES($1, $2) ON CONFLICT (version) DO NOTHING', [version, name]);
  await db.query('COMMIT');
  console.log('Migração 202609140008 aplicada e registrada com sucesso!');
  await db.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
