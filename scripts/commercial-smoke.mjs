import pg from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const company = 'QA comercial — ação & contexto';
const email = `qa-${ids[0]}@example.com`;
const data = {
  requestId: ids[0],
  company,
  email,
  whatsapp: '19987654321',
  sector: 'Educação',
  employees: '2 a 5',
  marketing: 'Sim',
  team: 'Não',
  difficulty: 'Falta de tempo',
  consent: true,
  website: '',
};
const post = (payload) =>
  fetch('http://127.0.0.1:3000/api/leads', {
    method: 'POST',
    headers: { Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
try {
  await db.connect();
  const response = await post(data);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.saved, true);
  const url = new URL(result.whatsappUrl);
  assert.equal(url.hostname, 'wa.me');
  assert.ok(url.searchParams.get('text').includes(company));
  assert.ok(url.searchParams.get('text').includes(email));
  let stored = await db.query('select data from public.commercial_leads where id=$1', [ids[0]]);
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].data.company, company);
  assert.equal((await post(data)).status, 200);
  stored = await db.query('select count(*)::int as n from public.commercial_leads where id=$1', [
    ids[0],
  ]);
  assert.equal(stored.rows[0].n, 1);
  for (const id of ids.slice(1, 3))
    assert.equal((await post({ ...data, requestId: id })).status, 200);
  assert.equal((await post({ ...data, requestId: ids[3] })).status, 429);
  await db.query('begin');
  await db.query('set local role anon');
  let denied = false;
  try {
    await db.query('select * from public.commercial_leads');
  } catch {
    denied = true;
  }
  await db.query('rollback');
  assert.equal(denied, true);
  console.log(
    'PASS: gravação real, contexto WhatsApp, encoding, idempotência, rate limit e leitura anônima bloqueada.',
  );
} catch (e) {
  console.error('FAIL: teste comercial', e.code || e.name, e.actual, e.expected);
  process.exitCode = 1;
} finally {
  await db.query('rollback').catch(() => {});
  await db
    .query('delete from public.commercial_leads where id = any($1::uuid[])', [ids])
    .catch(() => {});
  await db.end();
}
