-- Agent-specific secrets use the existing AES-GCM server encryption.
-- No authenticated client has direct access, including workspace administrators.
create table public.agent_ai_configs (
 workspace_id uuid not null,
 agent_id uuid not null,
 purpose text not null check(purpose in ('orchestrator','text','image','embedding')),
 provider text not null check(provider in ('openai','anthropic','google')),
 model text not null,
 enabled boolean not null default false,
 credential_ciphertext text,
 configured_by uuid references auth.users(id) on delete set null,
 validated_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(agent_id,purpose),
 foreign key(agent_id,workspace_id) references public.agents(id,workspace_id) on delete cascade
);
alter table public.agent_ai_configs enable row level security;
revoke all on public.agent_ai_configs from public,anon,authenticated;
grant all on public.agent_ai_configs to service_role;

-- Preserve legacy choices as drafts. Unverified old overrides must not execute.
insert into public.agent_ai_configs(workspace_id,agent_id,purpose,provider,model)
select a.workspace_id,a.id,c.key,c.value->>'provider',c.value->>'model'
from public.agents a cross join lateral jsonb_each(
 case when jsonb_typeof(a.text_settings->'ai_configs')='object'
 then a.text_settings->'ai_configs' else '{}'::jsonb end) c
where c.key in ('orchestrator','text','image','embedding')
and c.value->>'provider' in ('openai','anthropic','google')
and coalesce(c.value->>'model','')<>'';

create function public.protect_legacy_agent_ai() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
  if tg_op='INSERT' then
   if new.text_settings ? 'ai_configs' then raise exception 'forbidden'; end if;
  elsif (new.text_settings->'ai_configs') is distinct from (old.text_settings->'ai_configs') then
   raise exception 'forbidden';
  end if;
 end if;
 return new;
end $$;
create trigger protect_legacy_agent_ai before insert or update of text_settings on public.agents
for each row execute function public.protect_legacy_agent_ai();

create function public.save_agent_ai(w uuid,a uuid,actor_id uuid,configs jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=actor_id and raw_app_meta_data->>'super_admin'='true')
 or not exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor_id)
 or not exists(select 1 from public.agents where id=a and workspace_id=w) then raise exception 'forbidden'; end if;
 perform 1 from public.agents where id=a for update;
 delete from public.agent_ai_configs where agent_id=a and workspace_id=w;
 insert into public.agent_ai_configs(workspace_id,agent_id,purpose,provider,model,enabled,credential_ciphertext,configured_by,validated_at)
 select w,a,c->>'purpose',c->>'provider',c->>'model',true,c->>'credential_ciphertext',actor_id,now()
 from jsonb_array_elements(configs) c;
 update public.agents set text_settings=text_settings-'ai_configs' where id=a and workspace_id=w;
 insert into public.audit_logs(workspace_id,actor,event,metadata)
 values(w,actor_id,case when jsonb_array_length(configs)=0 then 'AGENT_AI_RESTORED' else 'AGENT_AI_UPDATED' end,jsonb_build_object('agent_id',a));
end $$;
revoke all on function public.save_agent_ai(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_agent_ai(uuid,uuid,uuid,jsonb) to service_role;
