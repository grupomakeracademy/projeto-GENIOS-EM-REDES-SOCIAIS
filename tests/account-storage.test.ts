import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, it, expect } from 'vitest';
let db:PGlite;
const u='00000000-0000-4000-8000-000000000001', w='00000000-0000-4000-8000-000000000002';
const path=(name:string, area='library')=>'workspace/'+w+'/'+area+'/'+name;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}');
 create table profiles(id uuid primary key,storage_quota_mb integer default 100);
 create table workspaces(id uuid primary key,created_by uuid);
 create table workspace_members(workspace_id uuid,user_id uuid,role text);
 create table assets(storage_path text,created_by uuid);
 create table content_imports(id uuid,workspace_id uuid,created_by uuid);
 create table content_items(id uuid,workspace_id uuid,created_by uuid);
 create table background_jobs(id uuid,workspace_id uuid,payload jsonb);
 create schema storage; create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 insert into auth.users(id,email) values('${u}','user@example.test');
 insert into profiles(id) values('${u}');
 insert into workspaces values('${w}','${u}');
 insert into workspace_members values('${w}','${u}','ADMIN');
 insert into assets values('${path('legacy')}','${u}');
 insert into storage.objects(bucket_id,name,metadata) values('brand-assets','${path('legacy')}','{"size":1024}');
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/202609240002_account_storage.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/202609240003_storage_upload_lifecycle.sql',import.meta.url),'utf8'));
});
afterAll(()=>db.close());
const reserve=(p:string,n:number)=>db.query<{reserve_account_storage:string}>('select reserve_account_storage($1,$2,$3,$4)',[w,u,p,n]);
const store=(p:string,n:number)=>db.query("insert into storage.objects(bucket_id,name,metadata) values('brand-assets',$1,$2) on conflict(bucket_id,name) do update set metadata=excluded.metadata",[p,JSON.stringify({size:n})]);
it('preserves the old 100 MB limit and backfills existing objects once',async()=>{
 expect((await db.query<{storage_quota_mb:number}>('select storage_quota_mb from profiles where id=$1',[u])).rows[0].storage_quota_mb).toBe(100);
 expect((await db.query<{size:number}>('select size from account_storage_usage')).rows[0].size).toBe(1024);
});
it('new profiles have 2048 MB while NULL and -1 remain unchanged',async()=>{
 for (const [suffix,limit] of [['3',undefined],['4',null],['5',-1]] as const) {
 const id='00000000-0000-4000-8000-00000000000'+suffix;
 if(limit===undefined) await db.query('insert into profiles(id) values($1)',[id]); else await db.query('insert into profiles values($1,$2)',[id,limit]);
 expect((await db.query<{storage_quota_mb:number|null}>('select storage_quota_mb from profiles where id=$1',[id])).rows[0].storage_quota_mb).toBe(limit===undefined?2048:limit);
 }
});
it('all modules share one allowance, and unreserved/bigger uploads fail',async()=>{
 await db.query('update profiles set storage_quota_mb=1 where id=$1',[u]);
 for(const area of ['library','content','imports']) {await reserve(path(area,area),100000);await store(path(area,area),100000);}
 await expect(reserve(path('overflow'),900000)).rejects.toThrow('storage_quota_exceeded');
 await expect(store(path('bypass'),100)).rejects.toThrow('storage_reservation_required');
 await reserve(path('size-cheat'),100);
 await expect(store(path('size-cheat'),101)).rejects.toThrow('storage_reservation_required');
});
it('concurrent reservation requests cannot consume more than the account limit',async()=>{
 const outcomes=await Promise.allSettled([reserve(path('concurrent-a'),500000),reserve(path('concurrent-b'),500000)]);
 expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 const total=(await db.query<{total:number}>('select sum(greatest(size_bytes,coalesce(reserved_bytes,0)))::bigint total from account_storage_objects where user_id=$1',[u])).rows[0].total;
 expect(Number(total)).toBeLessThanOrEqual(1048576);
});
it('physical deletion frees space, replacement charges only the final size',async()=>{
 await db.query('update profiles set storage_quota_mb=10 where id=$1',[u]);
 const p=path('replace','imports');
 await reserve(p,1000);await store(p,1000);
 await reserve(p,1500);await store(p,1500);
 expect((await db.query<{size_bytes:number}>('select size_bytes from account_storage_objects where path=$1',[p])).rows[0].size_bytes).toBe(1500);
 await db.query('delete from storage.objects where name=$1',[p]);
 expect((await db.query('select * from account_storage_objects where path=$1',[p])).rows).toHaveLength(0);
});
it('metadata renaming cannot bypass quota and failed uploads release reservations',async()=>{
 const p=path('release'), ticket=(await reserve(p,1000)).rows[0].reserve_account_storage;
 await db.query('select release_account_storage($1,$2)',[p,ticket]);
 expect((await db.query('select * from account_storage_objects where path=$1',[p])).rows).toHaveLength(0);
 await expect(db.query("update storage.objects set name='elsewhere' where name=$1",[path('legacy')])).rejects.toThrow('storage_move_not_supported');
});
it('users cannot change their own quota through direct profile writes',async()=>{
 await db.exec('grant usage on schema public to authenticated; grant select,update on profiles to authenticated; set role authenticated;');
 try {await expect(db.query('update profiles set storage_quota_mb=-1 where id=$1',[u])).rejects.toThrow('forbidden');}
 finally {await db.exec('reset role');}
});

it('retains reserved bytes during the real Storage two-phase upload',async()=>{
 const p=path('two-phase','imports');
 await reserve(p,1000);
 await db.query("insert into storage.objects(bucket_id,name) values('brand-assets',$1)",[p]);
 expect((await db.query<{reserved_bytes:number}>('select reserved_bytes from account_storage_objects where path=$1',[p])).rows[0].reserved_bytes).toBe(1000);
 await expect(store(p,1001)).rejects.toThrow('storage_reservation_required');
 await store(p,1000);
 expect((await db.query<{size_bytes:number,reserved_bytes:number|null}>('select size_bytes,reserved_bytes from account_storage_objects where path=$1',[p])).rows[0]).toEqual({size_bytes:1000,reserved_bytes:null});
 await expect(db.query("insert into storage.objects(bucket_id,name) values('brand-assets',$1)",[path('unreserved')])).rejects.toThrow('storage_reservation_required');
});
