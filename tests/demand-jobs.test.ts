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
 create table agents(id uuid,workspace_id uuid);
 create table content_items(id uuid primary key,workspace_id uuid,agent_id uuid,status content_status,strategy jsonb,topic text,version int,updated_at timestamptz);
 create table content_events(workspace_id uuid,content_id uuid,actor uuid,event text,metadata jsonb);
 create table content_variants(id uuid,content_id uuid,workspace_id uuid,image_prompts text[]);
 create table agent_runs(job_id uuid,status text,error_code text,completed_at timestamptz);
 create table background_jobs(id uuid primary key default gen_random_uuid(),workspace_id uuid,type text,status text default 'PENDING',payload jsonb,
 attempts int default 0,max_attempts int default 3,scheduled_at timestamptz default now(),started_at timestamptz,completed_at timestamptz,lease_until timestamptz,lock_token uuid,last_error text,idempotency_key text unique);
 insert into workspace_members values('${w}','${actor}','ADMIN'); insert into agents values('${agent}','${w}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/202609250001_demand_generation.sql',import.meta.url),'utf8'));
});
afterAll(async()=>{await db.close();});
async function enqueue(key=randomUUID(),draft:string|null=null){
 return (await db.query<{id:string}>('select enqueue_manual_generation($1,$2,$3,$4,$5,$6) id',[w,agent,actor,JSON.stringify({instruction:'test',agent_id:agent,...(draft?{content_id:draft}:{})}),key,draft])).rows[0].id;
}
const claim=(id:string)=>db.query('select * from claim_requested_job($1,$2,$3)',[id,w,actor]);
it('deduplicates a request and atomically claims only its job once',async()=>{
 const key=randomUUID(), id=await enqueue(key), other=await enqueue();
 expect(await enqueue(key)).toBe(id);
 const results=await Promise.all([claim(id),claim(id)]);
 expect(results.reduce((n,r)=>n+r.rows.length,0)).toBe(1);
 expect((await db.query<{status:string}>('select status from background_jobs where id=$1',[other])).rows[0].status).toBe('PENDING');
 await db.query("update background_jobs set status='COMPLETED' where id=$1",[id]);
 expect((await claim(id)).rows).toHaveLength(0);
 expect((await db.query('select * from claim_job()')).rows).toHaveLength(0);
});
it('never resets a completed draft job with a new request key',async()=>{
 const c=randomUUID(); await db.query("insert into content_items(id,workspace_id,agent_id,status,strategy) values($1,$2,$3,'DRAFT','{}')",[c,w,agent]);
 const key=randomUUID(); expect(await enqueue(key,c)).toBe(c); expect(await enqueue(key,c)).toBe(c);
 await claim(c); await db.query("update background_jobs set status='COMPLETED' where id=$1",[c]);
 await expect(enqueue(randomUUID(),c)).rejects.toThrow('conflict');
});
it('requires explicit retries and enforces the stored attempt limit',async()=>{
 const id=await enqueue();
 for(let n=1;n<=3;n++){
   expect((await claim(id)).rows).toHaveLength(1);
   await db.query("update background_jobs set status='FAILED' where id=$1",[id]);
   expect((await claim(id)).rows).toHaveLength(0);
   if(n<3) await db.query('select retry_requested_job($1,$2,$3)',[id,w,actor]);
 }
 await expect(db.query('select retry_requested_job($1,$2,$3)',[id,w,actor])).rejects.toThrow('conflict');
});
it('blocks routines and unauthorized claims',async()=>{
 const id=await enqueue(); await db.query("update background_jobs set payload=payload||'{\"origin\":\"routine\"}' where id=$1",[id]);
 expect((await claim(id)).rows).toHaveLength(0);
 await expect(db.query('select claim_requested_job($1,$2,$3)',[id,w,randomUUID()])).rejects.toThrow('forbidden');
});
it('expires abandoned work terminally without requeuing or deleting history',async()=>{
 const id=await enqueue(); await claim(id);
 await db.query("update background_jobs set lease_until=now()-interval '1 minute' where id=$1",[id]);
 await db.query('select expire_generation_jobs()');
 expect((await db.query<{status:string,last_error:string}>('select status,last_error from background_jobs where id=$1',[id])).rows[0]).toEqual({status:'FAILED',last_error:'lease_expired'});
 expect((await claim(id)).rows).toHaveLength(0);
});
