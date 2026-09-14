-- Public acquisition is write-only through a narrowly scoped RPC. No workspace access.
create table if not exists public.commercial_leads (
  id uuid primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  constraint lead_object check (jsonb_typeof(data) = 'object')
);
alter table public.commercial_leads enable row level security;
revoke all on public.commercial_leads from anon, authenticated;
grant select, delete on public.commercial_leads to service_role;
create index if not exists commercial_leads_created on public.commercial_leads(created_at);
create or replace function public.submit_commercial_lead(request_id uuid, payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if request_id is null or payload is null or jsonb_typeof(payload) <> 'object' or octet_length(payload::text) > 6000
    or (select count(*) from jsonb_object_keys(payload)) <> 9
    or not payload ?& array['company','email','whatsapp','sector','employees','marketing','team','difficulty','consent']
    or length(trim(coalesce(payload->>'company',''))) not between 2 and 120
    or length(trim(coalesce(payload->>'sector',''))) not between 2 and 50
    or length(coalesce(payload->>'email','')) > 254
    or coalesce(payload->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or coalesce(payload->>'whatsapp','') !~ '^[1-9][1-9]([2-5][0-9]{7}|9[0-9]{8})$'
    or coalesce(payload->>'employees','') not in ('Somente eu','2 a 5','6 a 10','11 a 20','21 a 50','51 a 100','Mais de 100')
    or coalesce(payload->>'marketing','') not in ('Sim','Não')
    or coalesce(payload->>'team','') not in ('Sim','Não','Profissional terceirizado')
    or coalesce(payload->>'difficulty','') not in ('Falta de tempo','Falta de constância','Dificuldade para ter ideias','Dificuldade com design','Dificuldade para produzir textos','Falta de estratégia','Conteúdo sem resultado comercial','Equipe sobrecarregada','Dificuldade para manter identidade')
    or payload->'consent' is distinct from 'true'::jsonb then
    raise exception 'invalid_lead' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(130003);
  -- Retrying the same request never creates another lead or exposes stored data.
  if exists(select 1 from public.commercial_leads where id = request_id) then
    return exists(select 1 from public.commercial_leads where id = request_id and data = payload);
  end if;
  if (select count(*) from public.commercial_leads where created_at > now() - interval '1 hour') >= 100
    or (select count(*) from public.commercial_leads where created_at > now() - interval '1 hour'
      and (lower(data->>'email') = lower(payload->>'email') or data->>'whatsapp' = payload->>'whatsapp')) >= 3 then
    return false;
  end if;
  insert into public.commercial_leads(id,data) values(request_id,payload);
  return true;
end $$;
revoke all on function public.submit_commercial_lead(uuid,jsonb) from public;
grant execute on function public.submit_commercial_lead(uuid,jsonb) to anon;
