create table public.content_items (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 agent_id uuid not null, topic text not null default '', strategy jsonb not null default '{}',
 status public.content_status not null default 'DRAFT', approval_required boolean not null default true,
 scheduled_at timestamptz, created_by uuid references auth.users(id), version int not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,workspace_id), foreign key(agent_id,workspace_id) references public.agents(id,workspace_id)
);
create table public.content_variants (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 content_id uuid not null, channel text not null, title text not null default '', caption text not null default '',
 hashtags text[] not null default '{}', cta text not null default '', aspect_ratio text not null check(aspect_ratio in ('4:5','9:16','16:9')),
 visual_concept text not null default '', image_prompts text[] not null default '{}',
 unique(content_id,channel), unique(id,workspace_id), foreign key(content_id,workspace_id) references public.content_items(id,workspace_id) on delete cascade
);
create table public.content_media (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 variant_id uuid not null, storage_path text not null, position int not null check(position>=0), aspect_ratio text not null,
 prompt text not null, provider text not null, model text not null, created_at timestamptz not null default now(),
 unique(variant_id,position), foreign key(variant_id,workspace_id) references public.content_variants(id,workspace_id) on delete cascade
);
create table public.content_events (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 content_id uuid not null, actor uuid, event text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now(),
 foreign key(content_id,workspace_id) references public.content_items(id,workspace_id) on delete cascade
);
create table public.content_publications (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 variant_id uuid not null, external_id text, status text not null default 'PENDING', idempotency_key text not null unique,
 published_at timestamptz, error_code text, foreign key(variant_id,workspace_id) references public.content_variants(id,workspace_id) on delete cascade
);
create table public.editorial_memory (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 agent_id uuid not null, content_id uuid not null unique, topic text not null, angle text not null, headline text not null, cta text not null,
 channels text[] not null, source_references jsonb not null default '[]', created_at timestamptz not null default now(),
 foreign key(agent_id,workspace_id) references public.agents(id,workspace_id),
 foreign key(content_id,workspace_id) references public.content_items(id,workspace_id) on delete cascade
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 message text not null, href text not null default '/contents', read_at timestamptz, created_at timestamptz not null default now()
);
create function public.enforce_content_transition() returns trigger language plpgsql set search_path='' as $$
begin
 if new.workspace_id<>old.workspace_id or new.agent_id<>old.agent_id then raise exception 'immutable ownership'; end if;
 if new.status<>old.status and not (
 (old.status='DRAFT' and new.status in ('GENERATING','AWAITING_REVIEW','ARCHIVED')) or
 (old.status='GENERATING' and new.status in ('AWAITING_REVIEW','FAILED')) or
 (old.status='AWAITING_REVIEW' and new.status in ('APPROVED','REJECTED','GENERATING','ARCHIVED')) or
 (old.status='APPROVED' and new.status in ('SCHEDULED','AWAITING_REVIEW','ARCHIVED')) or
 (old.status='SCHEDULED' and new.status in ('PUBLISHING','APPROVED','AWAITING_REVIEW','ARCHIVED')) or
 (old.status='PUBLISHING' and new.status in ('PUBLISHED','FAILED')) or
 (old.status='FAILED' and new.status in ('GENERATING','AWAITING_REVIEW','ARCHIVED')) or
 (old.status='REJECTED' and new.status in ('GENERATING','AWAITING_REVIEW','ARCHIVED')) or
 (old.status='PUBLISHED' and new.status='ARCHIVED')
 ) then raise exception 'invalid transition % -> %',old.status,new.status; end if;
 if new.status='SCHEDULED' and (new.scheduled_at is null or new.scheduled_at<=now()) then raise exception 'future schedule required'; end if;
 if new.topic<>old.topic or new.strategy<>old.strategy then
 if old.status in ('PUBLISHING','PUBLISHED','ARCHIVED') then raise exception 'content locked'; end if;
 if new.status in ('APPROVED','SCHEDULED') then new.status='AWAITING_REVIEW'; new.scheduled_at=null; end if;
 end if;
 new.version=old.version+1; new.updated_at=now(); return new;
end $$;
create trigger content_transition before update on public.content_items for each row execute function public.enforce_content_transition();
create function public.content_event_log() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.content_events(workspace_id,content_id,actor,event,metadata)
 values(new.workspace_id,new.id,auth.uid(),case when TG_OP='INSERT' then 'CREATED' when new.status<>old.status then new.status::text else 'EDITED' end,jsonb_build_object('version',new.version));
 return new;
end $$;
create trigger content_event after insert or update on public.content_items for each row execute function public.content_event_log();
create function public.variant_edit_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.content_status; begin
 if new.content_id<>old.content_id or new.workspace_id<>old.workspace_id then raise exception 'immutable ownership'; end if;
 select status into s from public.content_items where id=new.content_id for update;
 if s in ('PUBLISHING','PUBLISHED','ARCHIVED') then raise exception 'content locked'; end if;
 update public.content_items set status=case when s in ('APPROVED','SCHEDULED') then 'AWAITING_REVIEW'::public.content_status else s end, scheduled_at=null where id=new.content_id;
 return new;
end $$;
create trigger variant_guard before update on public.content_variants for each row execute function public.variant_edit_guard();
do $$ declare t text; begin
 foreach t in array array['content_items','content_variants','content_media','content_events','content_publications','editorial_memory','notifications'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy tenant_read on public.%I for select to authenticated using(public.has_role(workspace_id))',t);
 -- All content mutations go through transactional server workflows. No direct client state changes.
 end loop;
end $$;
create index content_workspace_status on public.content_items(workspace_id,status,created_at desc);
create index content_calendar on public.content_items(workspace_id,scheduled_at) where scheduled_at is not null;
create index variants_workspace_channel on public.content_variants(workspace_id,channel);
create index memory_agent_date on public.editorial_memory(workspace_id,agent_id,created_at desc);
create index events_content on public.content_events(workspace_id,content_id,created_at desc);
create index agents_workspace on public.agents(workspace_id);
create index assets_workspace on public.assets(workspace_id,created_at desc);
