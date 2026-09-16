-- Ordered image metadata belongs to the existing import; final media uses content_media.
alter table public.content_imports add column images jsonb not null default '[]'::jsonb;
update public.content_imports set images=jsonb_build_array(jsonb_build_object(
 'storage_path',storage_path,'mime_type',mime_type,'width',width,'height',height));

create function public.validate_import_images() returns trigger language plpgsql set search_path='' as $$
declare image jsonb;
begin
 -- Compatibility for existing single-image writers.
 if new.images='[]'::jsonb then
  new.images=jsonb_build_array(jsonb_build_object('storage_path',new.storage_path,'mime_type',new.mime_type,'width',new.width,'height',new.height));
 end if;
 if jsonb_typeof(new.images)<>'array' then raise exception 'invalid_import_images'; end if;
 if jsonb_array_length(new.images) not between 1 and 6 then raise exception 'invalid_import_image_count'; end if;
 for image in select value from jsonb_array_elements(new.images) loop
  if jsonb_typeof(image)<>'object'
   or coalesce(image->>'mime_type','') not in ('image/jpeg','image/png','image/webp')
   or coalesce(image->>'width','') !~ '^[1-9][0-9]{0,8}$'
   or coalesce(image->>'height','') !~ '^[1-9][0-9]{0,8}$'
   or not starts_with(coalesce(image->>'storage_path',''),'workspace/'||new.workspace_id::text||'/imports/'||new.id::text||'/')
   then raise exception 'invalid_import_image'; end if;
 end loop;
 if (new.images->0->>'storage_path') is distinct from new.storage_path
  or (new.images->0->>'mime_type') is distinct from new.mime_type
  or (new.images->0->>'width')::int is distinct from new.width
  or (new.images->0->>'height')::int is distinct from new.height
  then raise exception 'import_cover_mismatch'; end if;
 if TG_OP='UPDATE' and old.content_id is not null and new.images<>old.images then raise exception 'import_images_locked'; end if;
 return new;
end $$;
create trigger import_images_guard before insert or update on public.content_imports
for each row execute function public.validate_import_images();

-- Append the new column without changing the existing view's column order.
create or replace view public.import_overview with (security_invoker=true) as
 select i.id,i.workspace_id,i.agent_id,i.created_by,i.storage_path,i.mime_type,i.width,i.height,
 i.caption,i.magic_used_at,i.magic_processing,i.content_id,i.created_at,i.title,i.channel,i.connection_id,i.deleted_at,
 case
 when exists(select 1 from public.content_variants v join public.content_publications p on p.variant_id=v.id where v.content_id=i.content_id and p.published_at is not null and p.external_id is not null) then 'Publicado'
 when c.status='SCHEDULED' and c.scheduled_at>now() then 'Agendado'
 else 'Rascunho' end as import_status,c.scheduled_at,i.images
 from public.content_imports i left join public.content_items c on c.id=i.content_id and c.workspace_id=i.workspace_id where i.deleted_at is null;

create or replace function public.finalize_content_import(w uuid,i uuid,actor_id uuid,ch text,caption_text text)
returns uuid language plpgsql security definer set search_path='' as $$
declare draft public.content_imports; c uuid; v uuid; ratio text; begin
 if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor_id and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 select * into draft from public.content_imports where id=i and workspace_id=w and deleted_at is null for update;
 if not found then raise exception 'not_found'; end if;
 if draft.content_id is not null then return draft.content_id; end if;
 if draft.magic_processing then raise exception 'caption_processing'; end if;
 if ch not in ('instagram','facebook','whatsapp','tiktok','x','linkedin') or length(trim(caption_text))=0 or length(caption_text)>63206 then raise exception 'invalid_input'; end if;
 ratio=case when ch in ('instagram','facebook','linkedin') then '4:5' when ch='x' then '16:9' else '9:16' end;
 insert into public.content_items(workspace_id,agent_id,topic,strategy,status,created_by)
 values(w,draft.agent_id,left(caption_text,120),jsonb_build_object('source','import','import_id',i,'image_count',jsonb_array_length(draft.images),'is_carousel',jsonb_array_length(draft.images)>1),'APPROVED',actor_id) returning id into c;
 -- Empty prompt slots retain the existing slide navigator; imported media never enters AI generation.
 insert into public.content_variants(workspace_id,content_id,channel,title,caption,aspect_ratio,image_prompts)
 values(w,c,ch,left(caption_text,120),caption_text,ratio,array_fill(''::text,array[jsonb_array_length(draft.images)])) returning id into v;
 insert into public.content_media(workspace_id,variant_id,storage_path,position,aspect_ratio,prompt,provider,model)
 select w,v,image->>'storage_path',(position-1)::int,(image->>'width')||':'||(image->>'height'),'','upload','original'
 from jsonb_array_elements(draft.images) with ordinality as slides(image,position);
 update public.content_imports set content_id=c,caption=caption_text,channel=ch where id=i;
 return c;
end $$;
