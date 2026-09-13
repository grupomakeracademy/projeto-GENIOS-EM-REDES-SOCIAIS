-- Connections without an unambiguous owner remain unassigned until explicitly linked.
alter table public.social_connections add column if not exists agent_id uuid;
alter table public.social_connections add constraint social_connections_agent_workspace_fk foreign key(agent_id,workspace_id) references public.agents(id,workspace_id) on delete cascade;
alter table public.social_connections drop constraint if exists social_connections_workspace_id_channel_key;
create unique index social_connections_agent_channel on public.social_connections(workspace_id,agent_id,channel);
update public.social_connections c set agent_id=a.id from public.agents a where c.workspace_id=a.workspace_id and c.agent_id is null and (select count(*) from public.agents x where x.workspace_id=c.workspace_id)=1;
-- Briefing, communication, visual settings and model overrides belong to agents.id.
-- Existing JSON settings retain their shape; no copy of another agent is performed.
create or replace function public.limit_support_attachments() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from public.support_messages where id=new.message_id and workspace_id=new.workspace_id for update;
 if (select count(*) from public.support_attachments where message_id=new.message_id)>=3 then raise exception 'support_attachment_limit'; end if;
 return new;
end $$;
create trigger support_attachment_limit before insert on public.support_attachments for each row execute function public.limit_support_attachments();

create function public.create_configured_agent(w uuid, actor_id uuid, p jsonb, s jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid; begin
 if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor_id and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 insert into public.agents(workspace_id,name,briefing,text_settings,visual_settings,channel_settings,channels,content_language,mode,approval_required,research_enabled,image_count,active)
 values(w,p->>'name',p->'briefing',p->'text_settings',p->'visual_settings','{}',array(select jsonb_array_elements_text(p->'channels')),p->>'content_language',p->>'mode',(p->>'approval_required')::boolean,false,(p->>'image_count')::int,true) returning id into a;
 insert into public.agent_schedules(workspace_id,agent_id,enabled,timezone,local_time,weekdays,next_run_at) values(w,a,(s->>'enabled')::boolean,s->>'timezone',s->>'local_time',array(select jsonb_array_elements_text(s->'weekdays')::int),(s->>'next_run_at')::timestamptz);
 return a;
end $$;
revoke all on function public.create_configured_agent(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_configured_agent(uuid,uuid,jsonb,jsonb) to service_role;

create function public.validate_job_agent() returns trigger language plpgsql set search_path='' as $$
begin
 if new.type in ('agent_run','regenerate_copy','regenerate_image') then
  if not exists(select 1 from public.agents where id=(new.payload->>'agent_id')::uuid and workspace_id=new.workspace_id) then raise exception 'invalid_job_agent'; end if;
  if tg_op='UPDATE' and old.payload->>'agent_id' is distinct from new.payload->>'agent_id' then raise exception 'immutable_job_agent'; end if;
 end if;
 return new;
end $$;
create trigger validate_job_agent before insert or update of payload on public.background_jobs for each row execute function public.validate_job_agent();

create function public.set_asset_agents(w uuid, actor_id uuid, asset uuid, agents uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor_id and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 if not exists(select 1 from public.assets where id=asset and workspace_id=w) or exists(select 1 from unnest(agents) a where not exists(select 1 from public.agents where id=a and workspace_id=w)) then raise exception 'forbidden'; end if;
 update public.agents a set visual_settings=jsonb_set(a.visual_settings,'{reference_ids}',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(a.visual_settings->'reference_ids','[]')) x where x<>to_jsonb(asset::text)),'[]') || case when a.id=any(agents) then jsonb_build_array(asset::text) else '[]'::jsonb end) where a.workspace_id=w and (a.id=any(agents) or coalesce(a.visual_settings->'reference_ids','[]') @> jsonb_build_array(asset::text));
end $$;
revoke all on function public.set_asset_agents(uuid,uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.set_asset_agents(uuid,uuid,uuid,uuid[]) to service_role;
