-- One account quota, retaining every existing profile limit (including NULL/-1).
alter table public.profiles alter column storage_quota_mb set default 2048;
create table public.account_storage_objects (
 path text primary key, user_id uuid not null references public.profiles(id),
 workspace_id uuid not null references public.workspaces(id),
 size_bytes bigint not null default 0 check(size_bytes>=0),
 reserved_bytes bigint check(reserved_bytes>=0),
 reservation_id uuid, reserved_at timestamptz,
 check ((reserved_bytes is null) = (reservation_id is null))
);
alter table public.account_storage_objects enable row level security;
create policy account_storage_read on public.account_storage_objects for select to authenticated using(user_id=auth.uid());
grant select on public.account_storage_objects to authenticated;
grant all on public.account_storage_objects to service_role;

-- Stop for reconciliation instead of silently skipping orphaned objects or unknown sizes.
do $$ begin
 if exists(select 1 from storage.objects o left join public.workspaces w on w.id::text=split_part(o.name,'/',2)
 where o.bucket_id='brand-assets' and split_part(o.name,'/',3) in ('library','content','imports') and (w.id is null or o.metadata->>'size' is null)) then
 raise exception 'account_storage_backfill_needs_audit'; end if;
end $$;
-- Actual physical objects, one row per path, including originals and retained versions.
-- Prefer the original uploader; unassigned routine media belongs to the workspace creator.
insert into public.account_storage_objects(path,user_id,workspace_id,size_bytes)
select o.name,coalesce(
 (select a.created_by from public.assets a where a.storage_path=o.name limit 1),
 (select i.created_by from public.content_imports i where i.id::text=split_part(o.name,'/',4) and i.workspace_id=w.id limit 1),
 (select c.created_by from public.content_items c where c.id::text=split_part(o.name,'/',4) and c.workspace_id=w.id limit 1),
 (select nullif(j.payload->>'created_by','')::uuid from public.background_jobs j where j.id::text=split_part(o.name,'/',4) and j.workspace_id=w.id limit 1),
 w.created_by),w.id,coalesce((o.metadata->>'size')::bigint,0)
from storage.objects o join public.workspaces w on w.id::text=split_part(o.name,'/',2)
where o.bucket_id='brand-assets' and split_part(o.name,'/',1)='workspace' and split_part(o.name,'/',3) in ('library','content','imports');

create view public.account_storage_usage with (security_invoker=true) as
select user_id as created_by, coalesce(sum(size_bytes),0)::bigint as size,
 coalesce(sum(greatest(size_bytes,coalesce(reserved_bytes,0))-size_bytes),0)::bigint as reserved
from public.account_storage_objects group by user_id;
grant select on public.account_storage_usage to authenticated,service_role;

create function public.reserve_account_storage(w uuid,u uuid,p text,n bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare account_id uuid; quota integer; used bigint; previous public.account_storage_objects; ticket uuid=gen_random_uuid(); unlimited boolean;
begin
 if n<0 or p not like 'workspace/'||w::text||'/%' or split_part(p,'/',3) not in ('library','content','imports') then raise exception 'invalid_input'; end if;
 account_id=u;
 if account_id is null then
  select coalesce(c.created_by,ws.created_by) into account_id from public.workspaces ws left join public.content_items c on c.id::text=split_part(p,'/',4) and c.workspace_id=ws.id where ws.id=w;
 end if;
 if not exists(select 1 from public.workspace_members where workspace_id=w and user_id=account_id and role in ('ADMIN','EDITOR')) then raise exception 'forbidden'; end if;
 -- The same profile row is locked for ALL three modules and administrative quota updates.
 select storage_quota_mb into quota from public.profiles where id=account_id for update;
 if not found then raise exception 'account_not_found'; end if;
 select (lower(email)='r.barros84@gmail.com' or coalesce((raw_app_meta_data->>'super_admin')::boolean,false)) into unlimited from auth.users where id=account_id;
 -- Expired reservations are safe to release: late uploads then fail the object trigger.
 update public.account_storage_objects set reserved_bytes=null,reservation_id=null,reserved_at=null where user_id=account_id and reserved_at < now()-interval '30 minutes';
 select * into previous from public.account_storage_objects where path=p;
 if previous.path is not null and (previous.user_id<>account_id or previous.reserved_bytes is not null) then raise exception 'storage_upload_in_progress'; end if;
 select coalesce(sum(greatest(size_bytes,coalesce(reserved_bytes,0))),0) into used from public.account_storage_objects where user_id=account_id;
 if not coalesce(unlimited,false) and quota is not null and quota<>-1 and n>coalesce(previous.size_bytes,0) and used + greatest(n-coalesce(previous.size_bytes,0),0)>quota::bigint*1048576 then raise exception 'storage_quota_exceeded'; end if;
 insert into public.account_storage_objects(path,user_id,workspace_id,reserved_bytes,reservation_id,reserved_at)
 values(p,account_id,w,n,ticket,now())
 on conflict(path) do update set reserved_bytes=n,reservation_id=ticket,reserved_at=now();
 return ticket;
end $$;

create function public.release_account_storage(p text,ticket uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 select user_id into u from public.account_storage_objects where path=p;
 perform 1 from public.profiles where id=u for update;
 update public.account_storage_objects set reserved_bytes=null,reservation_id=null,reserved_at=null where path=p and reservation_id=ticket;
 delete from public.account_storage_objects where path=p and size_bytes=0 and reserved_bytes is null and not exists(select 1 from storage.objects where bucket_id='brand-assets' and name=p);
end $$;

create function public.account_storage_object_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare ledger public.account_storage_objects; n bigint; p text;
begin
 if TG_OP='UPDATE' and old.bucket_id='brand-assets' and split_part(old.name,'/',3) in ('library','content','imports') and (new.name<>old.name or new.bucket_id<>old.bucket_id) then raise exception 'storage_move_not_supported'; end if;
 if TG_OP='DELETE' then p=old.name; else p=new.name; end if;
 if (case when TG_OP='DELETE' then old.bucket_id else new.bucket_id end)<>'brand-assets' or split_part(p,'/',3) not in ('library','content','imports') then
  if TG_OP='DELETE' then return old; else return new; end if;
 end if;
 select * into ledger from public.account_storage_objects where path=p;
 if ledger.path is null then raise exception 'storage_reservation_required'; end if;
 perform 1 from public.profiles where id=ledger.user_id for update;
 select * into ledger from public.account_storage_objects where path=p;
 if TG_OP='DELETE' then
  delete from public.account_storage_objects where path=p;
  return old;
 end if;
 if TG_OP='UPDATE' and (new.name<>old.name or new.bucket_id<>old.bucket_id) then raise exception 'storage_move_not_supported'; end if;
 n=(new.metadata->>'size')::bigint;
 if n is null or n<0 then raise exception 'storage_size_required'; end if;
 if TG_OP='UPDATE' and n=ledger.size_bytes and ledger.reserved_bytes is null then return new; end if;
 if ledger.reserved_bytes is null or n>ledger.reserved_bytes or ledger.reserved_at<now()-interval '30 minutes' then raise exception 'storage_reservation_required'; end if;
 update public.account_storage_objects set size_bytes=n,reserved_bytes=null,reservation_id=null,reserved_at=null where path=p;
 return new;
end $$;
create trigger account_storage_object_guard before insert or update or delete on storage.objects for each row execute function public.account_storage_object_guard();

-- Prevent direct profile APIs from raising their own quota; server admin routes still work.
create function public.protect_account_storage_quota() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and ((TG_OP='INSERT' and new.storage_quota_mb is distinct from 2048) or (TG_OP='UPDATE' and new.storage_quota_mb is distinct from old.storage_quota_mb)) then raise exception 'forbidden'; end if;
 return new;
end $$;
create trigger protect_account_storage_quota before insert or update on public.profiles for each row execute function public.protect_account_storage_quota();
revoke all on function public.reserve_account_storage(uuid,uuid,text,bigint),public.release_account_storage(text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_account_storage(uuid,uuid,text,bigint),public.release_account_storage(text,uuid) to service_role;
