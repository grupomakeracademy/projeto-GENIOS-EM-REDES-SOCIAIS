-- Keep each scheduled occurrence bound to that weekday's persisted reference and quality.
-- Existing routines have no weekday_settings and retain their previous configuration.
create or replace function public.dispatch_schedule(sid uuid, expected timestamptz, next_due timestamptz, fingerprint text)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.agent_schedules; a public.agents; jid uuid; lang text; p jsonb; weekday_key text; day_config jsonb;
begin
 select * into s from public.agent_schedules where id=sid for update;
 if not found or not s.enabled or s.requested_by is null or s.next_run_at<>expected or expected>now() then return null; end if;
 if not exists(select 1 from public.workspace_members where workspace_id=s.workspace_id and user_id=s.requested_by and role in ('ADMIN','EDITOR')) then return null; end if;
 select * into a from public.agents where id=s.agent_id and workspace_id=s.workspace_id and active;
 if not found then return null; end if;
 if next_due<=now() then raise exception 'invalid_schedule'; end if;
 update public.agent_schedules set next_run_at=next_due where id=sid;
 if expected<now()-interval '5 minutes' then return null; end if;
 select locale into lang from public.profiles where id=s.requested_by;
 weekday_key := extract(isodow from expected at time zone s.timezone)::int::text;
 day_config := coalesce(a.routine_settings->'weekday_settings'->weekday_key, '{}'::jsonb);
 -- Only the two per-day overrides are allowed to affect the job payload.
 day_config := jsonb_strip_nulls(jsonb_build_object(
   'reference_asset_id', day_config->'reference_asset_id',
   'image_quality', day_config->'image_quality'));
 p:=a.routine_settings||day_config||jsonb_build_object('agent_id',a.id,'created_by',s.requested_by,'origin','routine','dispatch_mode','scheduled_request','schedule_id',s.id,'scheduled_for',expected,'schedule_fingerprint',fingerprint,'title_language',coalesce(lang,'pt-BR'));
 insert into public.background_jobs(workspace_id,type,payload,idempotency_key,max_attempts)
 values(s.workspace_id,'agent_run',p,'routine:'||s.id||':'||expected,1)
 on conflict(idempotency_key) do nothing returning id into jid;
 return jid;
end $$;
revoke all on function public.dispatch_schedule(uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.dispatch_schedule(uuid,timestamptz,timestamptz,text) to service_role;
