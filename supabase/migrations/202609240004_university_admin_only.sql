-- All video mutations go through the existing server endpoints, which enforce
-- requireSuperAdmin. Block direct PostgREST writes even for workspace admins.
-- Reading policies and video records are retained.
revoke insert, update, delete, truncate, references, trigger
on public.university_videos from authenticated, anon;
grant select, insert, update, delete on public.university_videos to service_role;
