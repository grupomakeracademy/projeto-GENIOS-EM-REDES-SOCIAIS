import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
const w=randomUUID(), actor=randomUUID(), agent=randomUUID();
let db: PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create type content_status as enum ('DRAFT','GENERATING','FAILED','AWAITING_REVIEW','ROUTINE','REJECTED');
 create table workspace_members(workspace_id uuid,user_id uuid,role text);
 create table agents(id uuid,workspace_id uuid,active boolean default true,routine_settings jsonb default '{"channels":["instagram"],"image_count":1}');
 create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${actor}');
 create table profiles(id uuid,locale text); insert into profiles values('${actor}','pt-BR');
 create table content_media(id uuid);
 create table agent_schedules(id uuid primary key,workspace_id uuid,agent_id uuid,enabled boolean,timezone text,local_time text,weekdays int[],next_run_at timestamptz);
 create table content_items(id uuid primary key,workspace_id uuid,agent_id uuid,status content_status,strategy jsonb,topic text,version int,updated_at timestamptz);
 create table content_events(workspace_id uuid,content_id uuid,actor uuid,event text,metadata jsonb);
 create table content_variants(id uuid,content_id uuid,workspace_id uuid,image_prompts text[]);
 create table agent_runs(job_id uuid,status text,error_code text,completed_at timestamptz);
 create table background_jobs(id uuid primary key default gen_random_uuid(),workspace_id uuid,type text,status text default 'PENDING',payload jsonb,
 attempts int default 0,max_attempts int default 3,scheduled_at timestamptz default now(),started_at timestamptz,completed_at timestamptz,lease_until timestamptz,lock_token uuid,last_error text,idempotency_key text unique);
 insert into workspace_members values('${w}','${actor}','ADMIN'); insert into agents(id,workspace_id) values('${agent}','${w}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/202609250001_demand_generation.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/202609260001_routine_execution.sql',import.meta.url),'utf8'));
});
afterAll(async()=>{await db.close();});

it('authorizes one scheduled occurrence and claims it only once',async()=>{
 const sid=randomUUID(),due=new Date(Date.now()-1000).toISOString(),next=new Date(Date.now()+86400000).toISOString();
 await db.query('insert into agent_schedules values($1,$2,$3,true,$4,$5,$6,$7,$8)',[sid,w,agent,'UTC','08:00',[1,2,3,4,5,6,7],due,actor]);
 const dispatch=()=>db.query<{id:string}>('select dispatch_schedule($1,$2,$3,$4) id',[sid,due,next,'fingerprint']);
 const results=await Promise.all([dispatch(),dispatch()]);
 const ids=results.flatMap(r=>r.rows.map(r=>r.id).filter(Boolean));expect(ids).toHaveLength(1);
 const claims=await Promise.all([db.query('select * from claim_requested_job($1,$2,$3)',[ids[0],w,actor]),db.query('select * from claim_requested_job($1,$2,$3)',[ids[0],w,actor])]);
 expect(claims.map(r=>r.rows.length).sort()).toEqual([0,1]);
 const payload=(claims.find(r=>r.rows.length)!.rows[0] as {payload:{channels:string[],title_language:string}}).payload;
 expect(payload.channels).toEqual(['instagram']);expect(payload.title_language).toBe('pt-BR');
});
it('skips overdue backlogs and never authorizes legacy schedules',async()=>{
 for(const requester of [actor,null]){
  const sid=randomUUID(),due=new Date(Date.now()-86400000).toISOString(),next=new Date(Date.now()+86400000).toISOString();
  await db.query('insert into agent_schedules values($1,$2,$3,true,$4,$5,$6,$7,$8)',[sid,w,agent,'UTC','08:00',[1,2,3,4,5,6,7],due,requester]);
  const result=await db.query<{id:string|null}>('select dispatch_schedule($1,$2,$3,$4) id',[sid,due,next,'fingerprint']);expect(result.rows[0].id).toBeNull();
 }
});
