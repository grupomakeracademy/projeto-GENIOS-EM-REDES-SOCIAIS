create extension if not exists vector with schema extensions;
alter table public.editorial_memory add column embedding extensions.vector(1536);
create index memory_embedding on public.editorial_memory using hnsw(embedding extensions.vector_cosine_ops);
create function public.match_editorial_memory(w uuid,a uuid,q extensions.vector(1536),threshold float default 0.88)
returns table(id uuid,topic text,similarity float) language sql stable set search_path='' as $$
 select id,topic,1-(embedding OPERATOR(extensions.<=>) q) as similarity from public.editorial_memory
 where workspace_id=w and agent_id=a and created_at>now()-interval '90 days' and embedding is not null
 and 1-(embedding OPERATOR(extensions.<=>) q)>threshold
 order by embedding OPERATOR(extensions.<=>) q limit 10
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('brand-assets','brand-assets',false,10485760,array['image/png','image/jpeg','image/webp','text/plain','application/pdf']) on conflict(id) do nothing;
create policy asset_read on storage.objects for select to authenticated using(bucket_id='brand-assets' and (storage.foldername(name))[1]='workspace' and public.has_role(((storage.foldername(name))[2])::uuid));
-- Uploads/deletions are server-only after validation of file bytes and workspace membership.
