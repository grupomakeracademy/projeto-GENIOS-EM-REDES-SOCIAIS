create or replace function public.set_asset_agents(w uuid, actor_id uuid, asset uuid, agents uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare
 is_super boolean := false;
begin
 -- Check if actor is super admin
 select exists(
   select 1 from auth.users u
   where u.id = actor_id
   and (
     coalesce(u.raw_app_meta_data->>'super_admin', 'false') = 'true'
     or lower(coalesce(u.email, '')) = 'r.barros84@gmail.com'
   )
 ) into is_super;

 -- Authorization: must be Super Admin or ADMIN/EDITOR in workspace w
 if not is_super and not exists(
   select 1 from public.workspace_members
   where workspace_id = w and user_id = actor_id and role in ('ADMIN', 'EDITOR')
 ) then
   raise exception 'forbidden';
 end if;

 -- Asset must exist (in workspace w, or anywhere if Super Admin)
 if not exists(
   select 1 from public.assets
   where id = asset and (workspace_id = w or is_super)
 ) then
   raise exception 'forbidden';
 end if;

 -- All target agents must exist
 if exists(
   select 1 from unnest(agents) a
   where not exists(select 1 from public.agents where id = a)
 ) then
   raise exception 'forbidden';
 end if;

 -- If not super admin, actor must have access to all target agents
 if not is_super and exists(
   select 1 from unnest(agents) a
   where not exists(
     select 1 from public.agents ag
     join public.workspace_members wm on wm.workspace_id = ag.workspace_id
     where ag.id = a and wm.user_id = actor_id and wm.role in ('ADMIN', 'EDITOR')
   )
 ) then
   raise exception 'forbidden';
 end if;

 -- Update agents: add asset to selected agents, remove asset from unselected agents
 update public.agents a
 set visual_settings = jsonb_set(
   coalesce(a.visual_settings, '{}'::jsonb),
   '{reference_ids}',
   coalesce(
     (
       select jsonb_agg(x)
       from jsonb_array_elements(coalesce(a.visual_settings->'reference_ids', '[]'::jsonb)) x
       where x <> to_jsonb(asset::text)
     ),
     '[]'::jsonb
   ) || case when a.id = any(agents) then jsonb_build_array(asset::text) else '[]'::jsonb end
 )
 where a.id = any(agents)
    or coalesce(a.visual_settings->'reference_ids', '[]'::jsonb) @> jsonb_build_array(asset::text);

end $$;

revoke all on function public.set_asset_agents(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.set_asset_agents(uuid, uuid, uuid, uuid[]) to service_role;
