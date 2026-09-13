import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { test, expect } from 'vitest';
test('agents own channels, jobs, briefings and schedules; attachment counts are enforced', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
    );
    for (const name of [
      '202609110001_foundation',
      '202609110002_content',
      '202609110003_jobs',
      '202609110009_support',
      '202609120001_agent_isolation',
    ])
      await db.exec(
        (
          await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
        ).replace('create extension if not exists pgcrypto;', ''),
      );
    const uid = '00000000-0000-4000-8000-000000000001';
    await db.query('insert into auth.users(id) values($1)', [uid]);
    const w = (
      await db.query<{ id: string }>(
        "insert into workspaces(name,created_by) values('QA',$1) returning id",
        [uid],
      )
    ).rows[0].id;
    const w2 = (
      await db.query<{ id: string }>(
        "insert into workspaces(name,created_by) values('Other',$1) returning id",
        [uid],
      )
    ).rows[0].id;
    await db.query(
      "insert into workspace_members(workspace_id,user_id,role) values($1,$2,'ADMIN')",
      [w, uid],
    );
    const config = {
      name: 'Marca B',
      briefing: { company: 'Marca B', audience: 'Público B' },
      text_settings: { instructions: 'Texto B' },
      visual_settings: { instructions: 'Visual B' },
      channels: ['instagram'],
      content_language: 'pt-BR',
      mode: 'ASSISTED',
      approval_required: true,
      image_count: 1,
    };
    const schedule = {
      enabled: false,
      timezone: 'America/Sao_Paulo',
      local_time: '14:00',
      weekdays: [1, 3],
      next_run_at: new Date().toISOString(),
    };
    const a = (
      await db.query<{ id: string }>(
        'insert into agents(workspace_id,name,briefing) values($1,\'Marca A\',\'{"company":"Marca A"}\') returning id',
        [w],
      )
    ).rows[0].id;
    const b = (
      await db.query<{ id: string }>('select create_configured_agent($1,$2,$3,$4) as id', [
        w,
        uid,
        config,
        schedule,
      ])
    ).rows[0].id;
    expect(
      (await db.query<{ briefing: unknown }>('select briefing from agents where id=$1', [b]))
        .rows[0].briefing,
    ).toEqual(config.briefing);
    expect(
      (
        await db.query<{ local_time: string }>(
          'select local_time from agent_schedules where agent_id=$1',
          [b],
        )
      ).rows[0].local_time,
    ).toBe('14:00');
    for (const id of [a, b])
      await db.query(
        "insert into social_connections(workspace_id,agent_id,channel,account_name,external_id,token_ciphertext) values($1,$2,'instagram','test-account','test-id','fixture')",
        [w, id],
      );
    expect(
      (await db.query('select * from social_connections where workspace_id=$1', [w])).rows,
    ).toHaveLength(2);
    await expect(
      db.query(
        "insert into social_connections(workspace_id,agent_id,channel,account_name,external_id,token_ciphertext) values($1,$2,'facebook','other','other','fixture')",
        [w2, a],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into background_jobs(workspace_id,type,payload,idempotency_key) values($1,'agent_run','{}','missing')",
        [w],
      ),
    ).rejects.toThrow('invalid_job_agent');
    await expect(
      db.query(
        "insert into background_jobs(workspace_id,type,payload,idempotency_key) values($1,'agent_run',$2,'foreign')",
        [w2, { agent_id: a }],
      ),
    ).rejects.toThrow('invalid_job_agent');
    const asset=(await db.query<{id:string}>("insert into assets(workspace_id,name,mime_type,storage_path,size) values($1,'Logo B','image/png','qa-logo',10) returning id",[w])).rows[0].id;
    await db.query('select set_asset_agents($1,$2,$3,$4)',[w,uid,asset,[b]]);
    expect((await db.query<{visual_settings:{reference_ids?:string[]}}>('select visual_settings from agents where id=$1',[a])).rows[0].visual_settings.reference_ids || []).not.toContain(asset);
    expect((await db.query<{visual_settings:{reference_ids:string[]}}>('select visual_settings from agents where id=$1',[b])).rows[0].visual_settings.reference_ids).toEqual([asset]);
    await expect(db.query('select set_asset_agents($1,$2,$3,$4)',[w2,uid,asset,[a]])).rejects.toThrow('forbidden');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    const ticket = (
      await db.query<{ result: { id: string; messageId: string } }>(
        "select support_create($1,'Teste de anexos','outros','normal','Mensagem de teste') as result",
        [w],
      )
    ).rows[0].result;
    for (let i = 0; i < 3; i++)
      await db.query(
        "insert into support_attachments(workspace_id,ticket_id,message_id,uploaded_by,original_name,storage_path,mime_type,size) values($1,$2,$3,$4,'teste.png',$5,'image/png',10)",
        [w, ticket.id, ticket.messageId, uid, `test-${i}`],
      );
    await expect(
      db.query(
        "insert into support_attachments(workspace_id,ticket_id,message_id,uploaded_by,original_name,storage_path,mime_type,size) values($1,$2,$3,$4,'quarto.png','test-4','image/png',10)",
        [w, ticket.id, ticket.messageId, uid],
      ),
    ).rejects.toThrow('support_attachment_limit');
  } finally {
    await db.close();
  }
});
