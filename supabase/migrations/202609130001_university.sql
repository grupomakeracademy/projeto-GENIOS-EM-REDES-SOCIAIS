create table if not exists public.university_videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  video_url text not null,
  description text not null,
  thumbnail_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists university_videos_workspace_idx on public.university_videos(workspace_id);
create index if not exists university_videos_created_idx on public.university_videos(created_at desc);

alter table public.university_videos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'university_videos' and policyname = 'workspace_access'
  ) then
    create policy workspace_access on public.university_videos
      for all
      to authenticated
      using (public.has_role(workspace_id))
      with check (public.has_role(workspace_id, array['ADMIN','EDITOR']::public.member_role[]));
  end if;
end
$$;

grant all on public.university_videos to authenticated;
