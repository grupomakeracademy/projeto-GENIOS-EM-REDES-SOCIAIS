import pg from 'pg';
import { readFile } from 'node:fs/promises';
const url = process.env.DATABASE_URL;
if (!url || /\[YOUR|sua_connection|cole_sua/.test(url)) { console.error('DATABASE_URL ausente ou incompleta.'); process.exit(1); }
let parsed;
try { parsed = new URL(url); }
catch { console.error('DATABASE_URL possui formato inválido. Codifique caracteres especiais da senha.'); process.exit(1); }
if (!['postgres:','postgresql:'].includes(parsed.protocol) || !parsed.hostname) { console.error('DATABASE_URL possui formato inválido.'); process.exit(1); }
const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
try {
  await db.connect();
  await db.query('select 1');
  console.log('Conexão PostgreSQL validada.');
  if (process.argv.includes('--apply')) {
    await db.query('begin');
    await db.query("select pg_advisory_xact_lock(202609120001)");
    await db.query('create schema if not exists supabase_migrations');
    await db.query('create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text)');
    const version = '202609120001';
    const applied = await db.query('select version from supabase_migrations.schema_migrations where version=$1',[version]);
    if (!applied.rowCount) {
      const sql = await readFile(new URL('../supabase/migrations/202609120001_agent_isolation.sql', import.meta.url), 'utf8');
      await db.query(sql);
      await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)',[version,[sql],'agent_isolation']);
    }
    await db.query('commit');
    console.log(applied.rowCount ? 'Migração já aplicada.' : 'Migração multiagente aplicada.');
  }
} catch (error) {
  await db.query('rollback').catch(()=>{});
  console.error('Falha PostgreSQL:', /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'connection_or_query_error');
  process.exitCode=1;
} finally { await db.end().catch(()=>{}); }
