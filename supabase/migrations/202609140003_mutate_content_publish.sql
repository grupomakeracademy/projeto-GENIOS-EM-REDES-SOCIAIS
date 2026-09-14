-- Update mutate_content to support 'publish' operation and variant-level status updates

create or replace function public.mutate_content(w uuid,c uuid,expected int,operation text,payload jsonb,actor_id uuid)
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
   if (payload->>'variant_id') is not null then
     update public.content_variants set status='SCHEDULED',scheduled_at=(payload->>'scheduled_at')::timestamptz where id=(payload->>'variant_id')::uuid and content_id=c;
   end if;
 elsif operation='publish' then
   update public.content_items set status='PUBLISHED',published_at=now() where id=c;
   if (payload->>'variant_id') is not null then
     update public.content_variants set status='PUBLISHED',published_at=now() where id=(payload->>'variant_id')::uuid and content_id=c;
   end if;
 else
   target=case operation 
     when 'approve' then 'APPROVED'::public.content_status 
     when 'reject' then 'REJECTED'::public.content_status 
     when 'archive' then 'ARCHIVED'::public.content_status 
     else null end;
   if target is null then raise exception 'invalid_operation'; end if;
   update public.content_items set status=target where id=c;
 end if;
 insert into public.content_events(workspace_id,content_id,actor,event,metadata) values(w,c,actor_id,upper(operation),jsonb_build_object('reason',coalesce(payload->>'reason',''),'variant_id',payload->>'variant_id'));
end $$;

revoke all on function public.mutate_content(uuid,uuid,int,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.mutate_content(uuid,uuid,int,text,jsonb,uuid) to service_role;
