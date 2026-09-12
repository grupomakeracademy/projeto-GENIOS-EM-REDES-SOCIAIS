create function public.mutate_content(w uuid,c uuid,expected int,operation text,payload jsonb,actor_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare item public.content_items; target public.content_status; begin
 select * into item from public.content_items where id=c and workspace_id=w for update;
 if not found then raise exception 'not_found'; end if;
 if item.version<>expected then raise exception 'conflict'; end if;
 if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor_id and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 if operation='edit' then
 update public.content_variants set caption=payload->>'caption' where id=(payload->>'variant_id')::uuid and content_id=c and workspace_id=w;
 if not found then raise exception 'not_found'; end if;
 elsif operation='schedule' then
 update public.content_items set status='SCHEDULED',scheduled_at=(payload->>'scheduled_at')::timestamptz where id=c;
 else
 target=case operation when 'approve' then 'APPROVED'::public.content_status when 'reject' then 'REJECTED'::public.content_status when 'archive' then 'ARCHIVED'::public.content_status else null end;
 if target is null then raise exception 'invalid_operation'; end if;
 update public.content_items set status=target where id=c;
 end if;
 insert into public.content_events(workspace_id,content_id,actor,event,metadata) values(w,c,actor_id,upper(operation),jsonb_build_object('reason',coalesce(payload->>'reason','')));
end $$;
create function public.persist_generated(w uuid,a uuid,j uuid,token uuid,s jsonb,variants jsonb,approval boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v jsonb; begin
 perform 1 from public.background_jobs where id=j and workspace_id=w and lock_token=token and status='RUNNING' and lease_until>now() for update;
 if not found then raise exception 'lease_lost'; end if;
 if exists(select 1 from public.content_items where id=j and workspace_id=w) then return j; end if;
 insert into public.content_items(id,workspace_id,agent_id,topic,strategy,status,approval_required) values(j,w,a,s->>'topic',s,'GENERATING',approval);
 for v in select * from jsonb_array_elements(variants) loop
 insert into public.content_variants(workspace_id,content_id,channel,title,caption,hashtags,cta,aspect_ratio,visual_concept,image_prompts)
 values(w,j,v->>'channel',v->>'title',v->>'caption',array(select jsonb_array_elements_text(v->'hashtags')),v->>'cta',case v->>'channel' when 'tiktok' then '9:16' when 'whatsapp' then '9:16' when 'x' then '16:9' else '4:5' end,v->>'visual_concept',array(select jsonb_array_elements_text(v->'image_prompts')));
 end loop;
 update public.agent_runs set content_id=j where job_id=j;
 return j;
end $$;
revoke all on function public.mutate_content(uuid,uuid,int,text,jsonb,uuid),public.persist_generated(uuid,uuid,uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.mutate_content(uuid,uuid,int,text,jsonb,uuid),public.persist_generated(uuid,uuid,uuid,uuid,jsonb,jsonb,boolean) to service_role;
