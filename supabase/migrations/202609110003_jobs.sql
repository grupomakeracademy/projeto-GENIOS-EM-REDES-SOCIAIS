create table public.agent_schedules (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 agent_id uuid not null unique, enabled boolean not null default false, timezone text not null, local_time text not null,
 weekdays int[] not null default array[1,2,3,4,5], next_run_at timestamptz not null,
 foreign key(agent_id,workspace_id) references public.agents(id,workspace_id) on delete cascade
);
create table public.background_jobs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 type text not null check(type in ('agent_run','regenerate_copy','regenerate_image','publishing')),
 status text not null default 'PENDING' check(status in ('PENDING','RUNNING','COMPLETED','FAILED')),
 payload jsonb not null, attempts int not null default 0, max_attempts int not null default 3,
 scheduled_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
 lease_until timestamptz, lock_token uuid, last_error text, idempotency_key text not null unique
);
create table public.agent_runs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 agent_id uuid not null, job_id uuid not null unique references public.background_jobs(id),
 content_id uuid, stage text not null default 'LOAD_CONTEXT', status text not null default 'RUNNING',
 checkpoint jsonb not null default '{}', started_at timestamptz not null default now(), completed_at timestamptz, error_code text,
 foreign key(agent_id,workspace_id) references public.agents(id,workspace_id),
 foreign key(content_id,workspace_id) references public.content_items(id,workspace_id)
);
create table public.usage_events (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 job_id uuid references public.background_jobs(id), provider text not null, model text not null, operation text not null,
 input_tokens int, output_tokens int, images int not null default 0, latency_ms int not null,
 estimated_cost numeric, created_at timestamptz not null default now()
);
create table public.rate_limits (key text primary key, window_at timestamptz not null, hits int not null);
alter table public.rate_limits enable row level security;
do $$ declare t text; begin
 foreach t in array array['agent_schedules','background_jobs','agent_runs','usage_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy tenant_read on public.%I for select to authenticated using(public.has_role(workspace_id))',t);
 end loop;
end $$;
create index jobs_due on public.background_jobs(scheduled_at) where status='PENDING';
create index schedules_due on public.agent_schedules(next_run_at) where enabled;
create function public.claim_job() returns setof public.background_jobs language plpgsql security definer set search_path='' as $$
begin
 update public.background_jobs set status='FAILED',last_error='lease_expired' where status='RUNNING' and lease_until<now() and attempts>=max_attempts;
 return query update public.background_jobs j set status='RUNNING',attempts=attempts+1,started_at=now(),lease_until=now()+interval '15 minutes',lock_token=gen_random_uuid()
 where j.id=(select id from public.background_jobs where ((status='PENDING' and scheduled_at<=now()) or (status='RUNNING' and lease_until<now())) and attempts<max_attempts order by scheduled_at for update skip locked limit 1)
 returning j.*;
end $$;
create function public.consume_rate(k text, max_hits int, window_seconds int) returns boolean language plpgsql security definer set search_path='' as $$
declare n int; begin
 insert into public.rate_limits(key,window_at,hits) values(k,now(),1)
 on conflict(key) do update set hits=case when public.rate_limits.window_at<now()-make_interval(secs=>window_seconds) then 1 else public.rate_limits.hits+1 end,
 window_at=case when public.rate_limits.window_at<now()-make_interval(secs=>window_seconds) then now() else public.rate_limits.window_at end returning hits into n;
 return n<=max_hits;
end $$;
revoke all on function public.claim_job(),public.consume_rate(text,int,int) from public,anon,authenticated;
grant execute on function public.claim_job(),public.consume_rate(text,int,int) to service_role;
