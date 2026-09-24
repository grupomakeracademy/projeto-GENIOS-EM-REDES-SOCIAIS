-- Generation is claimed only by id, following an authenticated request.
-- Disable legacy queue consumers without deleting their history.
create or replace function public.claim_job() returns setof public.background_jobs
language sql security definer set search_path='' as $$
 select * from public.background_jobs where false;
$$;

create function public.claim_requested_job(j uuid,w uuid,actor_id uuid)
returns setof public.background_jobs language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor_id and role in ('ADMIN','EDITOR')) then
   raise exception 'forbidden';
 end if;
 return query update public.background_jobs b
 set status='RUNNING',attempts=attempts+1,started_at=now(),completed_at=null,
     lease_until=now()+interval '15 minutes',lock_token=gen_random_uuid(),last_error=null
 where b.id=j and b.workspace_id=w and b.status='PENDING' and b.attempts<b.max_attempts
   and b.payload->>'dispatch_mode'='user_request'
   and b.type in ('agent_run','regenerate_copy','regenerate_image')
   and b.payload->>'origin' is distinct from 'routine'
   and b.payload->>'deleted' is null
 returning b.*;
end $$;

create function public.enqueue_manual_generation(w uuid,a uuid,actor_id uuid,p jsonb,k text,c uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare jid uuid; item public.content_items;
begin
 if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor_id and role in ('ADMIN','EDITOR'))
 or not exists(select 1 from public.agents where id=a and workspace_id=w) then raise exception 'forbidden'; end if;
 perform pg_advisory_xact_lock(hashtextextended(k,0));
 select id into jid from public.background_jobs where idempotency_key=k and workspace_id=w;
 if jid is not null then return jid; end if;
 if c is not null then
   select * into item from public.content_items where id=c and workspace_id=w for update;
   if not found or item.status<>'DRAFT' or item.strategy->>'source'='import' then raise exception 'conflict'; end if;
   update public.content_items set agent_id=a,topic=coalesce(nullif(trim(p->>'instruction'),''),'Conteúdo gerado'),
     strategy=p-'idempotency_key',status='GENERATING',updated_at=now() where id=c;
   insert into public.content_events(workspace_id,content_id,actor,event,metadata)
     values(w,c,actor_id,'CONTENT_GENERATION_STARTED',jsonb_build_object('origin','draft','channels',p->'channels'));
 end if;
 insert into public.background_jobs(id,workspace_id,type,payload,idempotency_key)
 values(coalesce(c,gen_random_uuid()),w,'agent_run',p||jsonb_build_object('agent_id',a,'created_by',actor_id,'origin','manual','dispatch_mode','user_request'),k)
 returning id into jid;
 return jid;
end $$;

create function public.retry_requested_job(j uuid,w uuid,actor_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare jid uuid;
begin
 if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor_id and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 update public.background_jobs set status='PENDING',last_error=null,lease_until=null,lock_token=null,completed_at=null,
   scheduled_at=now(),payload=payload||jsonb_build_object('dispatch_mode','user_request','origin','manual')
 where id=j and workspace_id=w and type='agent_run' and status='FAILED' and attempts<max_attempts and payload->>'deleted' is null returning id into jid;
 if jid is null then raise exception 'conflict'; end if;
 update public.agent_runs set status='PENDING',error_code=null,completed_at=null where job_id=jid;
 update public.content_items set status='GENERATING' where id=jid and workspace_id=w;
 return jid;
end $$;

-- Terminal recovery only: never requeue, reclaim or call a provider after a crash.
create function public.expire_generation_jobs() returns void language plpgsql security definer set search_path='' as $$
declare b public.background_jobs;
begin
 for b in update public.background_jobs set status='FAILED',last_error='lease_expired',completed_at=now(),lock_token=null,lease_until=null
 where type in ('agent_run','regenerate_copy','regenerate_image') and
 ((status='RUNNING' and lease_until<now()) or (status='PENDING' and scheduled_at<now()-interval '15 minutes')) returning * loop
   update public.agent_runs set status='FAILED',error_code='lease_expired',completed_at=now() where job_id=b.id;
   update public.content_items set status=case when b.type='agent_run' then 'FAILED' else coalesce(b.payload->>'previous_status','AWAITING_REVIEW') end::public.content_status
     where id=coalesce((b.payload->>'content_id')::uuid,b.id) and workspace_id=b.workspace_id and status='GENERATING';
 end loop;
end $$;

revoke all on function public.claim_requested_job(uuid,uuid,uuid),public.enqueue_manual_generation(uuid,uuid,uuid,jsonb,text,uuid),public.retry_requested_job(uuid,uuid,uuid),public.expire_generation_jobs() from public,anon,authenticated;
grant execute on function public.claim_requested_job(uuid,uuid,uuid),public.enqueue_manual_generation(uuid,uuid,uuid,jsonb,text,uuid),public.retry_requested_job(uuid,uuid,uuid),public.expire_generation_jobs() to service_role;

create or replace function public.enqueue_regeneration(
  w uuid,
  c uuid,
  v uuid,
  expected int,
  operation text,
  pos int,
  k text,
  actor_id uuid
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  item public.content_items;
  jid uuid;
begin
  select id into jid from public.background_jobs where idempotency_key=k and workspace_id=w;
  if jid is not null then return jid; end if;

  select * into item from public.content_items where id=c and workspace_id=w for update;
  if not found then raise exception 'not_found'; end if;

  -- Allow AWAITING_REVIEW, ROUTINE, REJECTED, FAILED
  if item.version <> expected or item.status not in ('AWAITING_REVIEW', 'ROUTINE', 'REJECTED', 'FAILED') then
    raise exception 'conflict';
  end if;

  if not exists(
    select 1 from public.workspace_members
    where workspace_id = w and user_id = actor_id and role in ('ADMIN', 'EDITOR')
  ) then
    raise exception 'forbidden';
  end if;

  if operation not in ('regenerate_copy', 'regenerate_image') or not exists(
    select 1 from public.content_variants where id = v and content_id = c and workspace_id = w
  ) then
    raise exception 'invalid_input';
  end if;

  if operation = 'regenerate_image' and (
    pos is null or pos < 0 or pos >= coalesce((select cardinality(image_prompts) from public.content_variants where id = v), 0)
  ) then
    raise exception 'invalid_input';
  end if;

  -- Set status to GENERATING while preserving previous status
  update public.content_items set status = 'GENERATING', updated_at = now() where id = c;

  insert into public.background_jobs(workspace_id, type, payload, idempotency_key)
  values(
    w,
    operation,
    jsonb_build_object(
      'content_id', c,
      'agent_id', item.agent_id,
      'variant_id', v,
      'position', pos,
      'previous_status', item.status,
      'actor_id', actor_id,
      'dispatch_mode', 'user_request'
    ),
    k
  )
  returning id into jid;

  return jid;
end $$;

revoke all on function public.enqueue_regeneration(uuid,uuid,uuid,int,text,int,text,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_regeneration(uuid,uuid,uuid,int,text,int,text,uuid) to service_role;
