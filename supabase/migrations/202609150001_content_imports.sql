create table public.content_imports (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 agent_id uuid not null,
 created_by uuid not null references auth.users(id),
 storage_path text not null,
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 width integer not null check(width>0), height integer not null check(height>0),
 caption text not null default '' check(length(caption)<=63206),
 magic_used_at timestamptz,
 magic_processing boolean not null default false,
 content_id uuid,
 created_at timestamptz not null default now(),
 foreign key(agent_id,workspace_id) references public.agents(id,workspace_id),
 foreign key(content_id,workspace_id) references public.content_items(id,workspace_id),
 check(storage_path like 'workspace/' || workspace_id::text || '/imports/%')
);
alter table public.content_imports enable row level security;
create policy import_read on public.content_imports for select to authenticated using(public.has_role(workspace_id));
grant select on public.content_imports to authenticated;
grant all on public.content_imports to service_role;
create index content_imports_workspace on public.content_imports(workspace_id,created_at desc);

-- Lock the draft and materialize it once in the existing content tables.
create function public.finalize_content_import(w uuid,i uuid,actor_id uuid,ch text,caption_text text)
returns uuid language plpgsql security definer set search_path='' as $$
declare draft public.content_imports; c uuid; v uuid; ratio text; begin
 if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor_id and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 select * into draft from public.content_imports where id=i and workspace_id=w for update;
 if not found then raise exception 'not_found'; end if;
 if draft.content_id is not null then return draft.content_id; end if;
 if draft.magic_processing then raise exception 'caption_processing'; end if;
 if ch not in ('instagram','facebook','whatsapp','tiktok','x','linkedin') or length(trim(caption_text))=0 or length(caption_text)>63206 then raise exception 'invalid_input'; end if;
 ratio=case when ch in ('instagram','facebook','linkedin') then '4:5' when ch='x' then '16:9' else '9:16' end;
 insert into public.content_items(workspace_id,agent_id,topic,strategy,status,created_by)
 values(w,draft.agent_id,left(caption_text,120),jsonb_build_object('source','import','import_id',i),'APPROVED',actor_id) returning id into c;
 insert into public.content_variants(workspace_id,content_id,channel,title,caption,aspect_ratio)
 values(w,c,ch,left(caption_text,120),caption_text,ratio) returning id into v;
 insert into public.content_media(workspace_id,variant_id,storage_path,position,aspect_ratio,prompt,provider,model)
 values(w,v,draft.storage_path,0,draft.width::text||':'||draft.height::text,'','upload','original');
 update public.content_imports set content_id=c,caption=caption_text where id=i;
 return c;
end $$;
revoke all on function public.finalize_content_import(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finalize_content_import(uuid,uuid,uuid,text,text) to service_role;
