import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, it, expect } from 'vitest';
let db: PGlite;
const A = '00000000-0000-4000-8000-000000000001',
  B = '00000000-0000-4000-8000-000000000002',
  E = '00000000-0000-4000-8000-000000000003',
  V = '00000000-0000-4000-8000-000000000004';
let wa: string, wb: string, agentA: string;
async function asUser(id: string, sql: string) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
  try {
    return await db.query<Record<string, unknown>>(sql);
  } finally {
    await db.exec('reset role');
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
  );
  for (const filename of [
    '202609110001_foundation.sql',
    '202609110002_content.sql',
    '202609110003_jobs.sql',
    '202609110005_transactions.sql',
    '202609110006_regeneration.sql',
    '202609110007_model_registry.sql',
    '202609110009_support.sql',
    '202609120001_agent_isolation.sql',
    '202609130001_university.sql',
  ]) {
    const sql = await readFile(
      new URL(`../supabase/migrations/${filename}`, import.meta.url),
      'utf8',
    );
    await db.exec(sql.replace('create extension if not exists pgcrypto;', ''));
  }
  await db.exec(
    `grant usage on schema public to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated; revoke all on public.ai_credentials,public.social_connections from authenticated; revoke insert,update,delete on support_tickets,support_messages,support_attachments,support_ticket_events,support_ticket_reads from authenticated; insert into auth.users(id) values('${A}'),('${B}'),('${E}'),('${V}');`,
  );
  wa = String(
    (
      await asUser(
        A,
        `select public.complete_onboarding('Company A','Genie A','{"audience":"customers","channels":["instagram"]}') as id`,
      )
    ).rows[0]?.id,
  );
  wb = String(
    (
      await asUser(
        B,
        `select public.complete_onboarding('Company B','Genie B','{"audience":"customers","channels":["linkedin"]}') as id`,
      )
    ).rows[0]?.id,
  );
  await db.exec(
    `insert into public.workspace_members values('${wa}','${E}','EDITOR'),('${wa}','${V}','VIEWER');`,
  );
  agentA = String(
    (await db.query<Record<string, unknown>>(`select id from agents where workspace_id='${wa}'`))
      .rows[0].id,
  );
});
afterAll(async () => {
  await db.close();
});
it('support isolates private tickets, messages, events and notifications across users and tenants', async () => {
  const result = await asUser(
    E,
    `select support_create('${wa}','Não consigo agendar','calendario','alta','Preciso de ajuda com meu conteúdo') as result`,
  );
  const id = (result.rows[0].result as { id: string }).id;
  expect((await asUser(A, `select * from support_tickets where id='${id}'`)).rows).toHaveLength(1);
  for (const user of [V, B]) {
    expect(
      (await asUser(user, `select * from support_tickets where id='${id}'`)).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(user, `select * from support_messages where ticket_id='${id}'`)).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(user, `select * from notifications where support_ticket_id='${id}'`)).rows,
    ).toHaveLength(0);
    await expect(
      asUser(user, `select support_reply('${id}','Tentativa não autorizada')`),
    ).rejects.toThrow('forbidden');
  }
  await expect(
    asUser(E, `update support_tickets set status='fechado' where id='${id}'`),
  ).rejects.toThrow();
  await expect(asUser(E, `select support_change('${id}','priority','baixa')`)).rejects.toThrow(
    'forbidden',
  );
});
it('support lifecycle persists unread state, closes and reopens transactionally', async () => {
  const created = (
    await asUser(
      V,
      `select support_create('${wa}','Acesso à biblioteca','biblioteca','normal','Onde encontro os arquivos?') as result`,
    )
  ).rows[0].result as { id: string };
  await asUser(A, `select support_reply('${created.id}','Você pode acessar pela Biblioteca.')`);
  expect(
    (await asUser(V, `select status from support_tickets where id='${created.id}'`)).rows[0].status,
  ).toBe('respondido');
  let list = (await asUser(V, `select support_list('${wa}') as result`)).rows[0].result as {
    items: { id: string; unread: boolean }[];
  };
  expect(list.items.find((x) => x.id === created.id)?.unread).toBe(true);
  await asUser(V, `select support_mark_read('${created.id}',now())`);
  list = (await asUser(V, `select support_list('${wa}') as result`)).rows[0].result as typeof list;
  expect(list.items.find((x) => x.id === created.id)?.unread).toBe(false);
  await asUser(A, `select support_change('${created.id}','status','fechado')`);
  await asUser(V, `select support_reply('${created.id}','Ainda preciso de ajuda.')`);
  expect(
    (await asUser(V, `select status,closed_at from support_tickets where id='${created.id}'`))
      .rows[0],
  ).toEqual({ status: 'em_andamento', closed_at: null });
  expect(
    (
      await asUser(
        V,
        `select * from support_ticket_events where ticket_id='${created.id}' and event_type='TICKET_REOPENED'`,
      )
    ).rows,
  ).toHaveLength(1);
  const search = (await asUser(V, `select support_list('${wa}','{"q":"Ainda preciso"}') as result`))
    .rows[0].result as typeof list;
  expect(search.items).toHaveLength(1);
});
it('announcements validate administrator, recipient and read-only general messages', async () => {
  await expect(
    asUser(
      E,
      `select support_create('${wa}','Aviso geral','outros','normal','Mensagem','announcement','geral')`,
    ),
  ).rejects.toThrow('forbidden');
  await expect(
    asUser(
      A,
      `select support_create('${wa}','Aviso individual','outros','normal','Mensagem','announcement','individual','${B}')`,
    ),
  ).rejects.toThrow('forbidden');
  const individual = (
    await asUser(
      A,
      `select support_create('${wa}','Aviso individual','outros','normal','Mensagem privada','announcement','individual','${E}') as result`,
    )
  ).rows[0].result as { id: string };
  expect(
    (await asUser(E, `select * from support_tickets where id='${individual.id}'`)).rows,
  ).toHaveLength(1);
  expect(
    (await asUser(V, `select * from support_tickets where id='${individual.id}'`)).rows,
  ).toHaveLength(0);
  const general = (
    await asUser(
      A,
      `select support_create('${wa}','Manutenção programada','outros','normal','Mensagem geral','announcement','geral') as result`,
    )
  ).rows[0].result as { id: string };
  expect(
    (await asUser(V, `select * from support_tickets where id='${general.id}'`)).rows,
  ).toHaveLength(1);
  await expect(asUser(V, `select support_reply('${general.id}','Resposta')`)).rejects.toThrow(
    'read_only',
  );
  await expect(
    asUser(A, `select support_create('${wa}','Sem mensagem','outros','normal','')`),
  ).rejects.toThrow();
  expect(
    (await asUser(A, `select * from support_tickets where title='Sem mensagem'`)).rows,
  ).toHaveLength(0);
});
it('atomically creates a workspace and first agent; onboarding is idempotent', async () => {
  const result = await asUser(
    A,
    `select public.complete_onboarding('Company A','Genie A','{"audience":"customers"}') as id`,
  );
  expect(result.rows[0].id).toBe(wa);
});
it('isolates tenant reads', async () => {
  const result = await asUser(A, 'select workspace_id from agents');
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].workspace_id).toBe(wa);
  expect((await asUser(A, `select * from workspaces where id='${wb}'`)).rows).toHaveLength(0);
});
it('viewer cannot edit agents', async () => {
  const result = await asUser(
    V,
    `update agents set name='Hacked' where workspace_id='${wa}' returning id`,
  );
  expect(result.rows).toHaveLength(0);
});
it('editor can operate but cannot read credentials', async () => {
  expect(
    (await asUser(E, `update agents set name='Edited' where workspace_id='${wa}' returning id`))
      .rows,
  ).toHaveLength(1);
  await expect(asUser(E, 'select * from ai_credentials')).rejects.toThrow();
});
it('cannot forge ownership on insert', async () => {
  await expect(
    asUser(A, `insert into agents(workspace_id,name) values('${wb}','Attack')`),
  ).rejects.toThrow();
});
it('blocks cross-tenant references even for accidental server writes', async () => {
  await expect(
    db.exec(`insert into content_items(workspace_id,agent_id) values('${wb}','${agentA}')`),
  ).rejects.toThrow();
});
it('enforces content transitions and keeps immutable history', async () => {
  const result = await db.query<Record<string, unknown>>(
    `insert into content_items(workspace_id,agent_id) values('${wa}','${agentA}') returning id`,
  );
  const id = result.rows[0].id;
  await expect(
    db.exec(`update content_items set status='PUBLISHED' where id='${id}'`),
  ).rejects.toThrow('invalid transition');
  await db.exec(
    `update content_items set status='AWAITING_REVIEW' where id='${id}'; update content_items set status='APPROVED' where id='${id}';`,
  );
  expect(
    (await db.query<Record<string, unknown>>(`select status from content_items where id='${id}'`))
      .rows[0].status,
  ).toBe('APPROVED');
  expect(
    (await asUser(A, `delete from content_events where content_id='${id}' returning id`)).rows,
  ).toHaveLength(0);
});
it('claims a job once and persists its attempt count', async () => {
  await db.exec(
    `insert into background_jobs(workspace_id,type,payload,idempotency_key) values('${wa}','agent_run','{"agent_id":"${agentA}"}','one');`,
  );
  expect((await db.query<Record<string, unknown>>('select * from claim_job()')).rows).toHaveLength(
    1,
  );
  expect((await db.query<Record<string, unknown>>('select * from claim_job()')).rows).toHaveLength(
    0,
  );
  expect(
    (
      await db.query<Record<string, unknown>>(
        "select attempts from background_jobs where idempotency_key='one'",
      )
    ).rows[0].attempts,
  ).toBe(1);
});
it('isolates the verified model registry and limits writes to administrators', async () => {
  expect(
    (
      await asUser(
        A,
        `insert into ai_model_registry(workspace_id,provider,model_id,display_name,capabilities) values('${wa}','openai','verified-model','Verified model',array['text']) returning model_id`,
      )
    ).rows,
  ).toHaveLength(1);
  expect((await asUser(B, 'select model_id from ai_model_registry')).rows).toHaveLength(0);
  await expect(
    asUser(
      E,
      `insert into ai_model_registry(workspace_id,provider,model_id,display_name,capabilities) values('${wa}','openai','forbidden-model','Forbidden',array['text'])`,
    ),
  ).rejects.toThrow();
});
