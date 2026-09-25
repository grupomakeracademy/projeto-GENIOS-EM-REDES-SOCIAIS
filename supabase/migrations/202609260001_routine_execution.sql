-- Historical scene prompts are preserved; never reconstruct provider prompts.
alter table public.content_media add column if not exists generation_prompt text;
alter table public.agent_schedules add column if not exists requested_by uuid references auth.users(id);

-- An explicitly saved enabled schedule is a durable user request. Old schedules
-- have no requested_by and remain dormant until saved again by an authorized user.
create or replace function public.dispatch_schedule(sid uuid, expected timestamptz, next_due timestamptz, fingerprint text)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.agent_schedules; a public.agents; jid uuid; lang text; p jsonb;
begin
 select * into s from public.agent_schedules where id=sid for update;
 if not found or not s.enabled or s.requested_by is null or s.next_run_at<>expected or expected>now() then return null; end if;
 if not exists(select 1 from public.workspace_members where workspace_id=s.workspace_id and user_id=s.requested_by and role in ('ADMIN','EDITOR')) then return null; end if;
 select * into a from public.agents where id=s.agent_id and workspace_id=s.workspace_id and active;
 if not found then return null; end if;
 if next_due<=now() then raise exception 'invalid_schedule'; end if;
 update public.agent_schedules set next_run_at=next_due where id=sid;
 -- Skip missed occurrences instead of generating an accumulated backlog after downtime.
 if expected<now()-interval '5 minutes' then return null; end if;
 select locale into lang from public.profiles where id=s.requested_by;
 p:=a.routine_settings||jsonb_build_object('agent_id',a.id,'created_by',s.requested_by,'origin','routine','dispatch_mode','scheduled_request','schedule_id',s.id,'scheduled_for',expected,'schedule_fingerprint',fingerprint,'title_language',coalesce(lang,'pt-BR'));
 insert into public.background_jobs(workspace_id,type,payload,idempotency_key,max_attempts)
 values(s.workspace_id,'agent_run',p,'routine:'||s.id||':'||expected,1)
 on conflict(idempotency_key) do nothing returning id into jid;
 return jid;
end $$;
revoke all on function public.dispatch_schedule(uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.dispatch_schedule(uuid,timestamptz,timestamptz,text) to service_role;

create or replace function public.claim_requested_job(j uuid,w uuid,actor_id uuid)
returns setof public.background_jobs language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor_id and role in ('ADMIN','EDITOR')) then
   raise exception 'forbidden';
 end if;
 return query update public.background_jobs b
 set status='RUNNING',attempts=attempts+1,started_at=now(),completed_at=null,
     lease_until=now()+interval '15 minutes',lock_token=gen_random_uuid(),last_error=null
 where b.id=j and b.workspace_id=w and b.status='PENDING' and b.attempts<b.max_attempts
   and ((b.payload->>'dispatch_mode'='user_request' and b.payload->>'origin' is distinct from 'routine')
     or (b.payload->>'dispatch_mode'='scheduled_request' and b.payload->>'origin'='routine'
       and exists(select 1 from public.agent_schedules s join public.agents a on a.id=s.agent_id
         where s.id::text=b.payload->>'schedule_id' and s.workspace_id=w and s.enabled and a.active
         and s.requested_by=actor_id and a.id::text=b.payload->>'agent_id'
         and b.payload->>'created_by'=actor_id::text)))
   and b.type in ('agent_run','regenerate_copy','regenerate_image')

   and b.payload->>'deleted' is null
 returning b.*;
end $$;

