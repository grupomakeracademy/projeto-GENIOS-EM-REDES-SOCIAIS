-- Migration: 202609140008_protected_identities_and_exact_assets.sql
-- Add support for Protected Identities (with single master reference) and Exact Assets (post-generation overlay)

ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS identity_name text,
ADD COLUMN IF NOT EXISTS identity_type text,
ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS asset_subtype text,
ADD COLUMN IF NOT EXISTS placement text DEFAULT 'top_left';

CREATE INDEX IF NOT EXISTS idx_assets_protected_identity ON public.assets(workspace_id, category, is_master);
CREATE INDEX IF NOT EXISTS idx_assets_identity_name ON public.assets(workspace_id, identity_name);

-- Stored procedure to atomically set an asset as master reference for its identity
create or replace function public.set_master_asset(w uuid, asset_id uuid, id_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.assets where id=asset_id and workspace_id=w) then
    raise exception 'forbidden';
  end if;

  -- Unset master for all other assets with this identity_name in this workspace
  update public.assets
  set is_master = false
  where workspace_id = w
    and identity_name = id_name
    and id <> asset_id;

  -- Set this asset as master
  update public.assets
  set is_master = true,
      category = 'protected_identity',
      identity_name = id_name
  where id = asset_id
    and workspace_id = w;
end $$;

grant execute on function public.set_master_asset(uuid, uuid, text) to authenticated, service_role;
