create extension if not exists pgcrypto;
create type public.member_role as enum ('ADMIN','EDITOR','VIEWER');
create type public.content_status as enum ('DRAFT','GENERATING','AWAITING_REVIEW','APPROVED','SCHEDULED','PUBLISHING','PUBLISHED','FAILED','REJECTED','ARCHIVED');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null default '', locale text not null default 'pt-BR' check(locale in ('pt-BR','en-US','es-ES')),
 onboarding_draft jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.workspaces (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 160),
 timezone text not null default 'America/Sao_Paulo', created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.workspace_members (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, role public.member_role not null default 'VIEWER',
 primary key(workspace_id,user_id)
);
create index members_user on public.workspace_members(user_id);
create function public.has_role(w uuid, roles public.member_role[] default array['ADMIN','EDITOR','VIEWER']::public.member_role[])
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role=any(roles))
$$;
revoke all on function public.has_role(uuid,public.member_role[]) from public;
grant execute on function public.has_role(uuid,public.member_role[]) to authenticated;
create table public.agents (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null, briefing jsonb not null default '{}', text_settings jsonb not null default '{}', visual_settings jsonb not null default '{}',
 channel_settings jsonb not null default '{}', channels text[] not null default array['instagram'],
 content_language text not null default 'pt-BR', mode text not null default 'ASSISTED' check(mode in ('MANUAL','ASSISTED','AUTONOMOUS')),
 approval_required boolean not null default true, research_enabled boolean not null default false,
 image_count int not null default 1 check(image_count between 0 and 20), active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,workspace_id)
);
create table public.workspace_settings (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 settings jsonb not null default '{}'
);
create table public.ai_provider_configs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 purpose text not null check(purpose in ('orchestrator','text','image','embedding')),
 provider text not null check(provider in ('openai','anthropic','google')), model text not null,
 enabled boolean not null default true, unique(workspace_id,purpose)
);
create table public.ai_credentials (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 provider text not null check(provider in ('openai','anthropic','google')),
 ciphertext text not null, updated_at timestamptz not null default now(), primary key(workspace_id,provider)
);
create table public.assets (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null, category text not null default 'reference', mime_type text not null,
 storage_path text not null unique, size bigint not null check(size>0 and size<=10485760), tags text[] not null default '{}',
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), unique(id,workspace_id)
);
create table public.social_connections (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 channel text not null, account_name text not null, external_id text not null, token_ciphertext text not null,
 expires_at timestamptz, metadata jsonb not null default '{}', created_at timestamptz not null default now(), unique(workspace_id,channel)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 actor uuid, event text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profile_select on public.profiles for select to authenticated using(id=auth.uid());
create policy profile_insert on public.profiles for insert to authenticated with check(id=auth.uid());
create policy profile_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
alter table public.workspaces enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using(public.has_role(id));
create policy workspace_update on public.workspaces for update to authenticated using(public.has_role(id,array['ADMIN']::public.member_role[])) with check(public.has_role(id,array['ADMIN']::public.member_role[]));
alter table public.workspace_members enable row level security;
create policy member_read on public.workspace_members for select to authenticated using(public.has_role(workspace_id));
-- Membership mutation deliberately only through privileged, audited server workflows.
do $$ declare t text; begin
 foreach t in array array['agents','assets','workspace_settings','ai_provider_configs','audit_logs','ai_credentials','social_connections'] loop
 execute format('alter table public.%I enable row level security',t);
 if t not in ('ai_credentials','social_connections') then
 execute format('create policy tenant_read on public.%I for select to authenticated using(public.has_role(workspace_id))',t);
 end if;
 if t in ('agents','assets') then
 execute format('create policy tenant_insert on public.%I for insert to authenticated with check(public.has_role(workspace_id,array[''ADMIN'',''EDITOR'']::public.member_role[]))',t);
 execute format('create policy tenant_update on public.%I for update to authenticated using(public.has_role(workspace_id,array[''ADMIN'',''EDITOR'']::public.member_role[])) with check(public.has_role(workspace_id,array[''ADMIN'',''EDITOR'']::public.member_role[]))',t);
 execute format('create policy tenant_delete on public.%I for delete to authenticated using(public.has_role(workspace_id,array[''ADMIN'',''EDITOR'']::public.member_role[]))',t);
 elsif t in ('workspace_settings','ai_provider_configs') then
 execute format('create policy admin_write on public.%I for all to authenticated using(public.has_role(workspace_id,array[''ADMIN'']::public.member_role[])) with check(public.has_role(workspace_id,array[''ADMIN'']::public.member_role[]))',t);
 end if;
 end loop;
end $$;
-- Secret tables have no client policies, including ADMIN. Only server code can decrypt.
revoke all on public.ai_credentials,public.social_connections from anon,authenticated;
create function public.complete_onboarding(company text, agent_name text, config jsonb, tz text default 'America/Sao_Paulo')
returns uuid language plpgsql security definer set search_path='' as $$
declare w uuid; begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if length(trim(company))<2 or length(trim(agent_name))<2 or length(coalesce(config->>'audience',''))<3 then raise exception 'invalid onboarding'; end if;
 if not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'invalid timezone'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select workspace_id into w from public.workspace_members where user_id=auth.uid() order by workspace_id limit 1;
 if w is not null then return w; end if;
 insert into public.profiles(id) values(auth.uid()) on conflict do nothing;
 insert into public.workspaces(name,timezone,created_by) values(company,tz,auth.uid()) returning id into w;
 insert into public.workspace_members values(w,auth.uid(),'ADMIN');
 insert into public.workspace_settings(workspace_id) values(w);
 insert into public.agents(workspace_id,name,briefing,text_settings,visual_settings,channels)
 values(w,agent_name,config,jsonb_build_object('instructions',config->>'communication'),jsonb_build_object('style',config->>'visual'),coalesce(array(select jsonb_array_elements_text(config->'channels')),array['instagram']));
 update public.profiles set onboarding_draft='{}' where id=auth.uid();
 insert into public.audit_logs(workspace_id,actor,event) values(w,auth.uid(),'WORKSPACE_CREATED');
 return w;
end $$;
revoke all on function public.complete_onboarding(text,text,jsonb,text) from public;
grant execute on function public.complete_onboarding(text,text,jsonb,text) to authenticated;
