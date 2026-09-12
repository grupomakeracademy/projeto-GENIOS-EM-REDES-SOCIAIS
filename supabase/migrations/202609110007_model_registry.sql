create table public.ai_model_registry (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 provider text not null check(provider in ('openai','anthropic','google')),
 model_id text not null, display_name text not null,
 capabilities text[] not null,
 enabled boolean not null default true, deprecated boolean not null default false,
 metadata jsonb not null default '{}', updated_at timestamptz not null default now(),
 primary key(workspace_id,provider,model_id)
);
alter table public.ai_model_registry enable row level security;
create policy registry_read on public.ai_model_registry for select to authenticated using(public.has_role(workspace_id));
create policy registry_admin on public.ai_model_registry for all to authenticated using(public.has_role(workspace_id,array['ADMIN']::public.member_role[])) with check(public.has_role(workspace_id,array['ADMIN']::public.member_role[]));
grant select,insert,update,delete on public.ai_model_registry to authenticated;
grant all on public.ai_model_registry to service_role;
