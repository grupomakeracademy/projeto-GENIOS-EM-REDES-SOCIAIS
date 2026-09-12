insert into storage.buckets(id,name,public,file_size_limit) values('support','support',false,52428800) on conflict(id) do nothing;
-- No direct client upload/read policies. The API validates membership, ticket, file bytes,
-- extension and MIME before upload. Downloads use short-lived signed URLs.
