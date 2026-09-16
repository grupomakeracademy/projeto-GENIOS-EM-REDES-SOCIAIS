-- Operation records contain usage/idempotency only. Money remains in profiles/quota_transactions.
alter table public.content_imports add column title text not null default '';
alter table public.content_imports add column channel text;
alter table public.content_imports add column connection_id uuid references public.social_connections(id);
alter table public.content_imports add column deleted_at timestamptz;
create table public.caption_operations (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id),
 actor_id uuid not null references auth.users(id), scope text not null check(scope in ('import','content')),
 target_id uuid not null, kind text not null check(kind in ('magic','storytelling')),
 state text not null check(state in ('pending','completed','failed')), cost int not null check(cost in (0,1)),
 result text, created_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.caption_operations enable row level security;
create index caption_usage on public.caption_operations(workspace_id,scope,target_id,kind,state);
revoke all on public.caption_operations from anon,authenticated;
grant all on public.caption_operations to service_role;

create function public.caption_operation(w uuid,a uuid,s text,t uuid,k text,r uuid,phase text,output text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare op caption_operations; n int; charge int; bal int; payment jsonb;
begin
 if not exists(select 1 from workspace_members where workspace_id=w and user_id=a and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 if s not in ('import','content') or k not in ('magic','storytelling') then raise exception 'invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text||s||t::text||k,0));
 if s='import' then
  perform 1 from content_imports where id=t and workspace_id=w and deleted_at is null for update;
 else
  perform 1 from content_items where id=t and workspace_id=w and status not in ('GENERATING','PUBLISHING','PUBLISHED','ARCHIVED') for update;
 end if;
 if not found then raise exception 'content locked'; end if;
 if s='import' and exists(select 1 from content_imports ci join content_items c on c.id=ci.content_id where ci.id=t and c.status in ('GENERATING','PUBLISHING','PUBLISHED','ARCHIVED')) then raise exception 'content locked'; end if;
 select * into op from caption_operations where id=r for update;
 if found and (op.workspace_id<>w or op.actor_id<>a or op.scope<>s or op.target_id<>t or op.kind<>k) then raise exception 'forbidden'; end if;
 if op.state='completed' then
  select content_quota_balance into bal from profiles where id=a;
  return jsonb_build_object('caption',op.result,'cost',op.cost,'balance',bal,'completed',true);
 end if;
 if phase='begin' then
  if op.id is not null then raise exception 'operation_already_started'; end if;
  update caption_operations set state='failed' where workspace_id=w and scope=s and target_id=t and kind=k and state='pending' and created_at<now()-interval '10 minutes';
  if exists(select 1 from caption_operations where workspace_id=w and scope=s and target_id=t and kind=k and state='pending') then raise exception 'operation_in_progress'; end if;
  select count(*) into n from caption_operations where workspace_id=w and scope=s and target_id=t and kind=k and state='completed';
  -- Preserve previously delivered free import improvements.
  if s='import' and k='magic' and exists(select 1 from content_imports where id=t and magic_used_at is not null) then n=n+1; end if;
  charge=case when n=0 then 0 else 1 end;
  select content_quota_balance into bal from profiles where id=a;
  if bal is null or bal<charge then raise exception 'insufficient_quota'; end if;
  insert into caption_operations(id,workspace_id,actor_id,scope,target_id,kind,state,cost) values(r,w,a,s,t,k,'pending',charge);
  return jsonb_build_object('cost',charge,'completed',false);
 end if;
 if op.id is null or op.state<>'pending' then raise exception 'operation_not_pending'; end if;
 if phase='fail' then update caption_operations set state='failed' where id=r; return '{}'::jsonb; end if;
 if phase<>'finish' or output is null or length(trim(output))=0 then raise exception 'invalid_output'; end if;
 if op.cost=1 then
  payment=deduct_content_quota(a,1,case when k='magic' then 'Prompt Mágico' else 'Storytelling' end,w,null,jsonb_build_object('caption_operation_id',r,'scope',s,'target_id',t));
  if not coalesce((payment->>'success')::boolean,false) then raise exception 'insufficient_quota'; end if;
 end if;
 update caption_operations set state='completed',result=output,completed_at=now() where id=r;
 select content_quota_balance into bal from profiles where id=a;
 return jsonb_build_object('caption',output,'cost',op.cost,'balance',bal,'completed',true);
end $$;
revoke all on function public.caption_operation(uuid,uuid,text,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.caption_operation(uuid,uuid,text,uuid,text,uuid,text,text) to service_role;

-- Keep existing editing rules, with one narrowly scoped exception for caption-only saves.
create or replace function public.variant_edit_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.content_status; begin
 if new.content_id<>old.content_id or new.workspace_id<>old.workspace_id then raise exception 'immutable ownership'; end if;
 select status into s from public.content_items where id=new.content_id for update;
 if s in ('PUBLISHING','PUBLISHED','ARCHIVED') then raise exception 'content locked'; end if;
 if current_setting('app.caption_only',true)='on' and (to_jsonb(new)-'caption')=(to_jsonb(old)-'caption') then
  update public.content_items set updated_at=now() where id=new.content_id;
 else
  update public.content_items set status=case when s in ('APPROVED','SCHEDULED') then 'AWAITING_REVIEW'::public.content_status else s end, scheduled_at=null where id=new.content_id;
 end if;
 return new;
end $$;

create function public.save_caption(w uuid,a uuid,v uuid,body text,expected int) returns void
language plpgsql security definer set search_path=public as $$
declare c content_items;
begin
 if not exists(select 1 from workspace_members where workspace_id=w and user_id=a and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 select ci.* into c from content_items ci join content_variants cv on cv.content_id=ci.id where cv.id=v and cv.workspace_id=w for update of ci;
 if c.id is null or c.version<>expected then raise exception 'conflict'; end if;
 if c.status in ('GENERATING','PUBLISHING','PUBLISHED','ARCHIVED') then raise exception 'content locked'; end if;
 perform set_config('app.caption_only','on',true);
 update content_variants set caption=body where id=v and workspace_id=w;
 update content_imports set caption=body where content_id=c.id and workspace_id=w;
 perform set_config('app.caption_only','off',true);
end $$;
revoke all on function public.save_caption(uuid,uuid,uuid,text,int) from public,anon,authenticated;
grant execute on function public.save_caption(uuid,uuid,uuid,text,int) to service_role;

create view public.import_overview with (security_invoker=true) as
 select i.*,case
 when exists(select 1 from content_variants v join content_publications p on p.variant_id=v.id where v.content_id=i.content_id and p.published_at is not null and p.external_id is not null) then 'Publicado'
 when c.status='SCHEDULED' and c.scheduled_at>now() then 'Agendado'
 else 'Rascunho' end as import_status,c.scheduled_at
 from content_imports i left join content_items c on c.id=i.content_id and c.workspace_id=i.workspace_id where i.deleted_at is null;
grant select on public.import_overview to authenticated,service_role;

create function public.delete_import(w uuid,a uuid,i uuid) returns void
language plpgsql security definer set search_path=public as $$
declare item content_imports; c content_items;
begin
 if not exists(select 1 from workspace_members where workspace_id=w and user_id=a and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 select * into item from content_imports where id=i and workspace_id=w for update;
 if item.id is null then raise exception 'forbidden'; end if;
 if item.deleted_at is not null then return; end if;
 if exists(select 1 from caption_operations where workspace_id=w and scope='import' and target_id=i and state='pending' and created_at>now()-interval '10 minutes') then raise exception 'operation_in_progress'; end if;
 if item.content_id is not null then
  select * into c from content_items where id=item.content_id and workspace_id=w for update;
  -- Lock matching jobs before cancelling, preventing a concurrent claim.
  perform 1 from background_jobs where workspace_id=w and (payload->>'content_id'=c.id::text or payload->>'variant_id' in (select id::text from content_variants where content_id=c.id)) for update;
  if c.status='PUBLISHING' or exists(select 1 from background_jobs where workspace_id=w and status='RUNNING' and (payload->>'content_id'=c.id::text or payload->>'variant_id' in (select id::text from content_variants where content_id=c.id))) then raise exception 'publication_in_progress'; end if;
  update background_jobs set status='FAILED',last_error='import_deleted',completed_at=now() where workspace_id=w and status='PENDING' and (payload->>'content_id'=c.id::text or payload->>'variant_id' in (select id::text from content_variants where content_id=c.id));
  if c.status not in ('PUBLISHED','ARCHIVED') then
   update content_variants set scheduled_at=null,status=case when status='SCHEDULED' then 'APPROVED' else status end where content_id=c.id and (scheduled_at is not null or status='SCHEDULED');
  end if;
  update content_publications set status='CANCELLED' where variant_id in (select id from content_variants where content_id=c.id) and published_at is null and status='PENDING';
  if c.status<>'ARCHIVED' then update content_items set status='ARCHIVED',scheduled_at=null where id=c.id; end if;
 end if;
 -- Soft deletion preserves shared media and audit records. Never calls a social provider.
 update content_imports set deleted_at=now() where id=i;
end $$;
revoke all on function public.delete_import(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_import(uuid,uuid,uuid) to service_role;

create function public.save_import_draft(w uuid,a uuid,i uuid,body jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare item content_imports; c content_items;
begin
 if not exists(select 1 from workspace_members where workspace_id=w and user_id=a and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 select * into item from content_imports where id=i and workspace_id=w and deleted_at is null for update;
 if item.id is null then raise exception 'forbidden'; end if;
 if nullif(body->>'connection_id','') is not null and not exists(select 1 from social_connections where id=(body->>'connection_id')::uuid and workspace_id=w and agent_id=item.agent_id and channel=body->>'channel') then raise exception 'forbidden'; end if;
 if item.content_id is not null then
  select * into c from content_items where id=item.content_id and workspace_id=w for update;
  if c.status in ('GENERATING','PUBLISHING','PUBLISHED','ARCHIVED') then raise exception 'content locked'; end if;
  perform set_config('app.caption_only','on',true);
  update content_variants set caption=body->>'caption' where content_id=c.id and workspace_id=w;
  perform set_config('app.caption_only','off',true);
 end if;
 update content_imports set title=body->>'title',caption=body->>'caption',channel=body->>'channel',connection_id=nullif(body->>'connection_id','')::uuid where id=i;
end $$;
revoke all on function public.save_import_draft(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_import_draft(uuid,uuid,uuid,jsonb) to service_role;
