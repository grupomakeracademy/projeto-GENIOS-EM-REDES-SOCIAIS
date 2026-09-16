-- Preserve legacy linked imports' original channel and distinguish caption save from draft save.
update public.content_imports i set channel=v.channel from public.content_variants v where v.content_id=i.content_id and i.channel is null;
create or replace function public.save_import_draft(w uuid,a uuid,i uuid,body jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare item content_imports; c content_items;
begin
 if not exists(select 1 from workspace_members where workspace_id=w and user_id=a and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 select * into item from content_imports where id=i and workspace_id=w and deleted_at is null for update;
 if item.id is null then raise exception 'forbidden'; end if;
 if not coalesce((body->>'caption_only')::boolean,false) and nullif(body->>'connection_id','') is not null and not exists(select 1 from social_connections where id=(body->>'connection_id')::uuid and workspace_id=w and agent_id=item.agent_id and channel=body->>'channel') then raise exception 'forbidden'; end if;
 if item.content_id is not null then
  select * into c from content_items where id=item.content_id and workspace_id=w for update;
  if not coalesce((body->>'caption_only')::boolean,false) and exists(select 1 from content_variants where content_id=c.id and channel is distinct from body->>'channel') then raise exception 'channel_locked'; end if;
  if c.status in ('GENERATING','PUBLISHING','PUBLISHED','ARCHIVED') then raise exception 'content locked'; end if;
  perform set_config('app.caption_only','on',true);
  update content_variants set caption=body->>'caption' where content_id=c.id and workspace_id=w;
  perform set_config('app.caption_only','off',true);
 end if;
 if coalesce((body->>'caption_only')::boolean,false) then
  update content_imports set caption=body->>'caption' where id=i;
 else
  update content_imports set title=body->>'title',caption=body->>'caption',channel=body->>'channel',connection_id=nullif(body->>'connection_id','')::uuid where id=i;
 end if;
end $$;
revoke all on function public.save_import_draft(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_import_draft(uuid,uuid,uuid,jsonb) to service_role;
