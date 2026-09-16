import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, it, expect } from 'vitest';
import {randomUUID} from 'node:crypto';
let db: PGlite;
const A = '00000000-0000-4000-8000-000000000001',
  B = '00000000-0000-4000-8000-000000000002',
  E = '00000000-0000-4000-8000-000000000003',
  V = '00000000-0000-4000-8000-000000000004';
let wa: string, wb: string, agentA: string;
it('imports original media once into existing content and isolates drafts by workspace',async()=>{
  const id=randomUUID();
  await db.query(`insert into content_imports(id,workspace_id,agent_id,created_by,storage_path,mime_type,width,height) values($1,$2,$3,$4,$5,'image/jpeg',720,1280)`,[id,wa,agentA,A,`workspace/${wa}/imports/${id}/original.jpg`]);
  const hidden=await asUser(B,`select id from content_imports where id='${id}'`);
  expect(hidden.rows).toHaveLength(0);
  const visible=await asUser(A,`select id from content_imports where id='${id}'`);
  expect(visible.rows).toHaveLength(1);
  const sql=`select finalize_content_import($1,$2,$3,'instagram','Minha legenda') as id`;
  const first=await db.query<{id:string}>(sql,[wa,id,A]);
  const second=await db.query<{id:string}>(sql,[wa,id,A]);
  expect(first.rows[0].id).toBe(second.rows[0].id);
  const media=await db.query(`select m.storage_path,m.provider,m.aspect_ratio from content_media m join content_variants v on v.id=m.variant_id where v.content_id=$1`,[first.rows[0].id]);
  expect(media.rows).toEqual([{storage_path:`workspace/${wa}/imports/${id}/original.jpg`,provider:'upload',aspect_ratio:'720:1280'}]);
  await expect(db.query(sql,[wa,id,V])).rejects.toThrow('forbidden');
});
it('allows only one atomic magic claim and protects image storage scope',async()=>{
  const id=randomUUID();
  await db.query(`insert into content_imports(id,workspace_id,agent_id,created_by,storage_path,mime_type,width,height) values($1,$2,$3,$4,$5,'image/png',100,100)`,[id,wa,agentA,A,`workspace/${wa}/imports/${id}/original.png`]);
  const claim=`update content_imports set magic_used_at=now() where id=$1 and magic_used_at is null returning id`;
  expect((await db.query(claim,[id])).rows).toHaveLength(1);
  expect((await db.query(claim,[id])).rows).toHaveLength(0);
  await expect(db.query('update content_imports set storage_path=$1 where id=$2',[`workspace/${wb}/imports/fake.png`,id])).rejects.toThrow();
});
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
    '202609140007_persist_generated_draft_support.sql',
    '202609140008_protected_identities_and_exact_assets.sql',
    '202609140002_quota_system_and_routine_settings.sql',
    '202609140004_fix_stored_proc_defaults.sql',
    '202609150001_content_imports.sql',
    '202609150002_caption_import_management.sql',
    '202609150003_import_caption_save.sql',
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
async function newImport(){const id=randomUUID();await db.query(`insert into content_imports(id,workspace_id,agent_id,created_by,storage_path,mime_type,width,height) values($1,$2,$3,$4,$5,'image/jpeg',720,1280)`,[id,wa,agentA,A,`workspace/${wa}/imports/${id}/original.jpg`]);return id;}
async function captionCall(id:string,kind:string,request:string,phase:string,output:string|null=null,actor=A){return (await db.query<{result:{cost:number;caption:string;balance:number;completed:boolean}}>('select caption_operation($1,$2,\'import\',$3,$4,$5,$6,$7) as result',[wa,actor,id,kind,request,phase,output])).rows[0].result;}
it('gives independent free successes, charges subsequent use once through the central ledger',async()=>{
 const id=await newImport();await db.query('update profiles set content_quota_balance=10 where id=$1',[A]);
 for(const kind of ['magic','storytelling']){
  const free=randomUUID();expect((await captionCall(id,kind,free,'begin')).cost).toBe(0);
  const first=await captionCall(id,kind,free,'finish','Dor.\n\nSolução.\n\nCTA.');expect(first.balance).toBe(kind==='magic'?10:9);
  const paid=randomUUID();expect((await captionCall(id,kind,paid,'begin')).cost).toBe(1);
  const second=await captionCall(id,kind,paid,'finish','Texto revisado');
  expect(await captionCall(id,kind,paid,'finish','Repetição')).toEqual(second);
  expect((await db.query('select id from quota_transactions where metadata->>\'caption_operation_id\'=$1',[paid])).rows).toHaveLength(1);
 }
 expect((await db.query<{content_quota_balance:number}>('select content_quota_balance from profiles where id=$1',[A])).rows[0].content_quota_balance).toBe(8);
 expect((await db.query<{caption:string}>('select caption from content_imports where id=$1',[id])).rows[0].caption).toBe('');
});
it('failure retains the free use and concurrent requests cannot both claim it',async()=>{
 const id=await newImport(),one=randomUUID();await captionCall(id,'magic',one,'begin');
 await expect(captionCall(id,'magic',randomUUID(),'begin')).rejects.toThrow('operation_in_progress');
 await captionCall(id,'magic',one,'fail');
 const retry=randomUUID();expect((await captionCall(id,'magic',retry,'begin')).cost).toBe(0);
 await captionCall(id,'magic',retry,'finish','Sucesso');
 await expect(captionCall(id,'magic',randomUUID(),'begin',null,V)).rejects.toThrow('forbidden');
});
it('insufficient funds at completion preserve counters and prevent negative balance',async()=>{
 const id=await newImport(),free=randomUUID();await captionCall(id,'magic',free,'begin');await captionCall(id,'magic',free,'finish','Primeiro');
 await db.query('update profiles set content_quota_balance=1 where id=$1',[A]);
 const paid=randomUUID();await captionCall(id,'magic',paid,'begin');
 // Another existing quota consumer can use the balance while a text request is running.
 await db.query('select deduct_content_quota($1,1)',[A]);
 await expect(captionCall(id,'magic',paid,'finish','Não deve ser entregue')).rejects.toThrow('insufficient_quota');
 await captionCall(id,'magic',paid,'fail');
 expect((await db.query('select id from quota_transactions where metadata->>\'caption_operation_id\'=$1',[paid])).rows).toHaveLength(0);
 expect((await db.query<{content_quota_balance:number}>('select content_quota_balance from profiles where id=$1',[A])).rows[0].content_quota_balance).toBe(0);
 await expect(captionCall(id,'magic',randomUUID(),'begin')).rejects.toThrow('insufficient_quota');
});
it('draft saving restores text and channel without creating content or jobs',async()=>{
 const id=await newImport();await db.query('select save_import_draft($1,$2,$3,$4)',[wa,A,id,{title:'Rascunho de teste',caption:'Minha legenda',channel:null,connection_id:null}]);
 const row=(await db.query<{title:string;caption:string;channel:null;content_id:null;import_status:string}>('select title,caption,channel,content_id,import_status from import_overview where id=$1',[id])).rows[0];
 expect(row).toEqual({title:'Rascunho de teste',caption:'Minha legenda',channel:null,content_id:null,import_status:'Rascunho'});
 await db.query('select save_import_draft($1,$2,$3,$4)',[wa,A,id,{caption_only:true,caption:'Somente legenda'}]);
 expect((await db.query('select title,caption,channel from content_imports where id=$1',[id])).rows[0]).toEqual({title:'Rascunho de teste',caption:'Somente legenda',channel:null});
 await expect(db.query('select save_import_draft($1,$2,$3,$4)',[wa,V,id,{title:'',caption:''}])).rejects.toThrow('forbidden');
});
it('caption saves preserve approved status and schedule, with optimistic concurrency',async()=>{
 const id=await newImport();const c=(await db.query<{id:string}>('select finalize_content_import($1,$2,$3,\'instagram\',\'Antes\') as id',[wa,id,A])).rows[0].id;
 await db.query("update content_items set status='SCHEDULED',scheduled_at=now()+interval '1 day' where id=$1",[c]);
 const before=(await db.query<{version:number;scheduled_at:string}>('select version,scheduled_at from content_items where id=$1',[c])).rows[0];
 const v=(await db.query<{id:string}>('select id from content_variants where content_id=$1',[c])).rows[0].id;
 await db.query('select save_caption($1,$2,$3,$4,$5)',[wa,A,v,'Depois',before.version]);
 expect((await db.query('select status,scheduled_at from content_items where id=$1',[c])).rows[0]).toEqual({status:'SCHEDULED',scheduled_at:before.scheduled_at});
 await expect(db.query('select save_caption($1,$2,$3,$4,$5)',[wa,A,v,'Sobrescrever',before.version])).rejects.toThrow('conflict');
});
it('deletion cancels pending jobs, removes the import from queries, preserves other imports and files',async()=>{
 const id=await newImport(),other=await newImport();const c=(await db.query<{id:string}>('select finalize_content_import($1,$2,$3,\'instagram\',\'Antes\') as id',[wa,id,A])).rows[0].id;
 await db.query("update content_items set status='SCHEDULED',scheduled_at=now()+interval '1 day' where id=$1",[c]);
 const job=randomUUID();await db.query("insert into background_jobs(id,workspace_id,type,payload,idempotency_key) values($1,$2,'publishing',$3,$4)",[job,wa,{content_id:c},job]);
 expect((await db.query<{import_status:string}>('select import_status from import_overview where id=$1',[id])).rows[0].import_status).toBe('Agendado');
 await db.query('select delete_import($1,$2,$3)',[wa,A,id]);
 expect((await db.query('select id from import_overview where id=$1',[id])).rows).toHaveLength(0);
 expect((await db.query('select id from import_overview where id=$1',[other])).rows).toHaveLength(1);
 expect((await db.query('select status,last_error from background_jobs where id=$1',[job])).rows[0]).toEqual({status:'FAILED',last_error:'import_deleted'});
 expect((await db.query('select id from content_media where variant_id in (select id from content_variants where content_id=$1)',[c])).rows).toHaveLength(1);
});
it('requires real publication evidence and keeps external publication records on deletion',async()=>{
 const id=await newImport();const c=(await db.query<{id:string}>('select finalize_content_import($1,$2,$3,\'instagram\',\'Antes\') as id',[wa,id,A])).rows[0].id;
 const v=(await db.query<{id:string}>('select id from content_variants where content_id=$1',[c])).rows[0].id;
 await db.query("insert into content_publications(workspace_id,variant_id,external_id,published_at,status,idempotency_key) values($1,$2,'real-post',now(),'PUBLISHED',$3)",[wa,v,randomUUID()]);
 expect((await db.query<{import_status:string}>('select import_status from import_overview where id=$1',[id])).rows[0].import_status).toBe('Publicado');
 await db.query('select delete_import($1,$2,$3)',[wa,A,id]);
 expect((await db.query('select external_id from content_publications where variant_id=$1',[v])).rows).toEqual([{external_id:'real-post'}]);
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

it('supports generating directly from an existing draft using persist_generated without duplicating', async () => {
  const draftId = '10000000-0000-4000-8000-000000000001';
  const lockToken = '20000000-0000-4000-8000-000000000001';
  
  // 1. Insert existing draft
  await db.exec(
    `insert into content_items(id, workspace_id, agent_id, topic, strategy, status)
     values ('${draftId}', '${wa}', '${agentA}', 'Draft Initial Topic', '{"instruction":"Original"}', 'DRAFT')`,
  );

  // 2. Insert running background job matching the draft id
  await db.exec(
    `insert into background_jobs(id, workspace_id, type, status, payload, lock_token, lease_until, idempotency_key)
     values ('${draftId}', '${wa}', 'agent_run', 'RUNNING', '{"agent_id":"${agentA}"}', '${lockToken}', now() + interval '5 minutes', 'test-draft-key-1')`,
  );

  // 3. Call persist_generated
  const variants = JSON.stringify([
    {
      channel: 'instagram',
      title: 'Instagram Title',
      caption: 'Final generated caption',
      hashtags: ['#teste'],
      cta: 'Saiba mais',
      visual_concept: 'concept 1',
      image_prompts: ['prompt 1', 'prompt 2'],
    },
  ]);
  const strategy = JSON.stringify({
    topic: 'Generated Content Topic',
    instruction: 'Original',
    is_carousel: true,
  });

  const res = await db.query<Record<string, unknown>>(
    `select persist_generated(
      '${wa}',
      '${agentA}',
      '${draftId}',
      '${lockToken}',
      '${strategy}',
      '${variants}',
      true
    ) as result`,
  );

  expect(res.rows[0]?.result).toBe(draftId);

  // 4. Verify draft was updated in place, retaining id and changing status to GENERATING
  const updated = await db.query<Record<string, unknown>>(
    `select id, status, topic, strategy->>'topic' as strategy_topic from content_items where id = '${draftId}'`,
  );
  expect(updated.rows).toHaveLength(1);
  expect(updated.rows[0].id).toBe(draftId);
  expect(updated.rows[0].status).toBe('GENERATING');
  expect(updated.rows[0].topic).toBe('Generated Content Topic');

  // Verify variant was upserted for the draft
  const vars = await db.query<Record<string, unknown>>(
    `select content_id, channel, caption from content_variants where content_id = '${draftId}'`,
  );
  expect(vars.rows).toHaveLength(1);
  expect(vars.rows[0].channel).toBe('instagram');
  expect(vars.rows[0].caption).toBe('Final generated caption');
});

it('supports protected identities and exact assets with single master reference enforcement', async () => {
  const asset1 = '00000000-0000-4000-8000-000000000091';
  const asset2 = '00000000-0000-4000-8000-000000000092';
  const assetLogo = '00000000-0000-4000-8000-000000000093';

  // 1. Insert protected identity asset 1 as master
  await db.query(`
    insert into public.assets (
      id, workspace_id, name, category, identity_name, identity_type, is_master, mime_type, storage_path, size, created_by
    ) values (
      '${asset1}', '${wa}', 'Geninho Mestre.png', 'protected_identity', 'Geninho', 'genie', true, 'image/png', 'test/1.png', 1000, '${A}'
    )
  `);

  // 2. Insert protected identity asset 2 as secondary
  await db.query(`
    insert into public.assets (
      id, workspace_id, name, category, identity_name, identity_type, is_master, mime_type, storage_path, size, created_by
    ) values (
      '${asset2}', '${wa}', 'Geninho Secundario.png', 'protected_identity', 'Geninho', 'genie', false, 'image/png', 'test/2.png', 1000, '${A}'
    )
  `);

  // 3. Insert exact asset
  await db.query(`
    insert into public.assets (
      id, workspace_id, name, category, asset_subtype, placement, mime_type, storage_path, size, created_by
    ) values (
      '${assetLogo}', '${wa}', 'Logo Oficial Geninhos.png', 'exact_asset', 'logo', 'top_left', 'image/png', 'test/logo.png', 500, '${A}'
    )
  `);

  // 4. Test set_master_asset RPC switches master
  await db.query(`select public.set_master_asset('${wa}', '${asset2}', 'Geninho')`);

  const rows = await db.query<Record<string, unknown>>(
    `select id, is_master from public.assets where identity_name = 'Geninho' order by id`,
  );
  const a1 = rows.rows.find((r) => r.id === asset1);
  const a2 = rows.rows.find((r) => r.id === asset2);

  expect(a1?.is_master).toBe(false);
  expect(a2?.is_master).toBe(true);

  // Check exact asset columns
  const logoRow = await db.query<Record<string, unknown>>(
    `select id, category, asset_subtype, placement from public.assets where id = '${assetLogo}'`,
  );
  expect(logoRow.rows[0].category).toBe('exact_asset');
  expect(logoRow.rows[0].asset_subtype).toBe('logo');
  expect(logoRow.rows[0].placement).toBe('top_left');
});
