import pg from 'pg';
import { readFile } from 'node:fs/promises';

const url = process.env.DATABASE_URL;
if (!url || /\[YOUR|sua_connection|cole_sua/.test(url)) {
  console.error('DATABASE_URL ausente ou incompleta.');
  process.exit(1);
}

const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });

async function main() {
  try {
    await db.connect();
    console.log('Conexão com PostgreSQL estabelecida.');

    const version = '202609140001';
    const name = 'routine_status_and_mode';

    await db.query('begin');
    await db.query('select pg_advisory_xact_lock($1)', [2026091401]);
    await db.query('create schema if not exists supabase_migrations');
    await db.query('create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text)');

    const applied = await db.query('select version from supabase_migrations.schema_migrations where version=$1', [version]);
    if (!applied.rowCount) {
      const sql = await readFile(new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url), 'utf8');
      await db.query(sql);
      await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)', [version, [sql], name]);
      console.log(`Migração ${name} aplicada com sucesso!`);
    } else {
      console.log('Migração já estava aplicada.');
    }
    await db.query('commit');
  } catch (err) {
    await db.query('rollback').catch(() => {});
    console.error('Erro ao aplicar migração:', err);
    process.exitCode = 1;
  } finally {
    await db.end().catch(() => {});
  }
}

void main();
