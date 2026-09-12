create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 160)
  )
  on conflict (id) do update
    set name = excluded.name
    where excluded.name <> '';
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();

update public.profiles as profile
set name = left(trim(coalesce(auth_user.raw_user_meta_data ->> 'full_name', '')), 160)
from auth.users as auth_user
where profile.id = auth_user.id
  and trim(coalesce(profile.name, '')) = ''
  and trim(coalesce(auth_user.raw_user_meta_data ->> 'full_name', '')) <> '';
