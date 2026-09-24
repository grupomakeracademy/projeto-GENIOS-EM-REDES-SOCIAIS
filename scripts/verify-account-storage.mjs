// Explicit integration check: creates one tiny temporary object and removes it.
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const api = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let path, ticket, uploaded = false;
function check(result) { if (result.error) throw new Error(result.error.message); return result.data; }
try {
  await sql.connect();
  const { rows: [account] } = await sql.query(`SELECT m.workspace_id, m.user_id FROM workspace_members m
    JOIN profiles p ON p.id=m.user_id LEFT JOIN account_storage_usage a ON a.created_by=m.user_id
    WHERE m.role IN ('ADMIN','EDITOR') AND (p.storage_quota_mb IS NULL OR p.storage_quota_mb=-1
    OR p.storage_quota_mb::bigint*1048576-coalesce(a.size,0)-coalesce(a.reserved,0)>1024) LIMIT 1`);
  if (!account) throw new Error('No account with space for the temporary check');
  path = `workspace/${account.workspace_id}/imports/${randomUUID()}/storage-check.png`;
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
  ticket = check(await api.rpc('reserve_account_storage', { w: account.workspace_id, u: account.user_id, p: path, n: bytes.length }));
  check(await api.storage.from('brand-assets').upload(path, bytes, { contentType: 'image/png' }));
  uploaded = true;
  const row = check(await api.from('account_storage_objects').select('size_bytes,reserved_bytes').eq('path',path).single());
  if (Number(row.size_bytes)!==bytes.length || row.reserved_bytes!==null) throw new Error('Incorrect byte accounting');
  console.log('Real Storage upload and exact byte accounting: passed');
} finally {
  if (uploaded) check(await api.storage.from('brand-assets').remove([path]));
  if (ticket) check(await api.rpc('release_account_storage', {p:path,ticket}));
  if (path) {
    const remaining = check(await api.from('account_storage_objects').select('path').eq('path',path));
    if (remaining.length) throw new Error('Temporary storage entry still present');
    console.log('Physical deletion and quota release: passed');
  }
  await sql.end();
}
