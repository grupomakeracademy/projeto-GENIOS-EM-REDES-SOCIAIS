-- Storage creates an object with no metadata before finalizing its byte size.
-- Keep its reservation until that final write, including during retries.
create or replace function public.account_storage_object_guard() returns trigger
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
 n=(new.metadata->>'size')::bigint;
 if n is null and TG_OP='INSERT' and ledger.reserved_bytes is not null and ledger.reserved_at>=now()-interval '30 minutes' then
  return new;
 end if;
 if n is null or n<0 then raise exception 'storage_size_required'; end if;
 if TG_OP='UPDATE' and n=ledger.size_bytes and ledger.reserved_bytes is null then return new; end if;
 if ledger.reserved_bytes is null or n>ledger.reserved_bytes or ledger.reserved_at<now()-interval '30 minutes' then raise exception 'storage_reservation_required'; end if;
 update public.account_storage_objects set size_bytes=n,reserved_bytes=null,reservation_id=null,reserved_at=null where path=p;
 return new;
end $$;
