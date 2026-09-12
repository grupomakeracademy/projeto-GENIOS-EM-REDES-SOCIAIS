create function public.enqueue_regeneration(w uuid,c uuid,v uuid,expected int,operation text,pos int,k text,actor_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare item public.content_items; jid uuid; begin
 select id into jid from public.background_jobs where idempotency_key=k and workspace_id=w;
 if jid is not null then return jid; end if;
 select * into item from public.content_items where id=c and workspace_id=w for update;
 if not found then raise exception 'not_found'; end if;
 if item.version<>expected or item.status not in ('AWAITING_REVIEW','REJECTED','FAILED') then raise exception 'conflict'; end if;
 if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor_id and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 if operation not in ('regenerate_copy','regenerate_image') or not exists(select 1 from public.content_variants where id=v and content_id=c and workspace_id=w) then raise exception 'invalid_input'; end if;
 if operation='regenerate_image' and (pos is null or pos<0 or pos>=coalesce((select cardinality(image_prompts) from public.content_variants where id=v),0)) then raise exception 'invalid_input'; end if;
 update public.content_items set status='GENERATING' where id=c;
 insert into public.background_jobs(workspace_id,type,payload,idempotency_key) values(w,operation,jsonb_build_object('content_id',c,'agent_id',item.agent_id,'variant_id',v,'position',pos),k) returning id into jid;
 return jid;
end $$;
revoke all on function public.enqueue_regeneration(uuid,uuid,uuid,int,text,int,text,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_regeneration(uuid,uuid,uuid,int,text,int,text,uuid) to service_role;
-- Explicit grants complement RLS, never replace it.
grant usage on schema public to authenticated,service_role;
grant select on public.profiles,public.workspaces,public.workspace_members,public.agents,public.workspace_settings,public.ai_provider_configs,public.assets,public.audit_logs,public.content_items,public.content_variants,public.content_media,public.content_events,public.content_publications,public.editorial_memory,public.notifications,public.agent_schedules,public.background_jobs,public.agent_runs,public.usage_events to authenticated;
grant insert,update on public.profiles to authenticated;
grant update on public.workspaces to authenticated;
grant insert,update,delete on public.agents,public.assets,public.workspace_settings,public.ai_provider_configs to authenticated;
grant all on all tables in schema public to service_role;
