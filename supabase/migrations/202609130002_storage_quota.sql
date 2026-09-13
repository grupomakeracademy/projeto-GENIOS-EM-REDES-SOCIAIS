-- Storage quota per user in megabytes. Default is 100 MB; -1 or NULL represents unlimited.
alter table public.profiles add column if not exists storage_quota_mb int default 100;
