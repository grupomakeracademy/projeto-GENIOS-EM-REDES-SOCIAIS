-- Migration 202609140005: Media versioning and resilient regeneration
-- 1. Add version column to content_media and update unique constraint
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'content_media' and column_name = 'version'
  ) then
    alter table public.content_media add column version integer not null default 1;
  end if;
end $$;

-- Drop old unique constraint on (variant_id, position) and create composite unique on (variant_id, position, version)
do $$
begin
  alter table public.content_media drop constraint if exists content_media_variant_id_position_key;
  if not exists (
    select 1 from pg_constraint where conname = 'content_media_variant_id_position_version_key'
  ) then
    alter table public.content_media add constraint content_media_variant_id_position_version_key unique(variant_id, position, version);
  end if;
end $$;

-- 2. Update enqueue_regeneration stored procedure to support ROUTINE status and preserve previous_status in payload
create or replace function public.enqueue_regeneration(
  w uuid,
  c uuid,
  v uuid,
  expected int,
  operation text,
  pos int,
  k text,
  actor_id uuid
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  item public.content_items;
  jid uuid;
begin
  select id into jid from public.background_jobs where idempotency_key=k and workspace_id=w;
  if jid is not null then return jid; end if;

  select * into item from public.content_items where id=c and workspace_id=w for update;
  if not found then raise exception 'not_found'; end if;

  -- Allow AWAITING_REVIEW, ROUTINE, REJECTED, FAILED
  if item.version <> expected or item.status not in ('AWAITING_REVIEW', 'ROUTINE', 'REJECTED', 'FAILED') then
    raise exception 'conflict';
  end if;

  if not exists(
    select 1 from public.workspace_members
    where workspace_id = w and user_id = actor_id and role in ('ADMIN', 'EDITOR')
  ) then
    raise exception 'forbidden';
  end if;

  if operation not in ('regenerate_copy', 'regenerate_image') or not exists(
    select 1 from public.content_variants where id = v and content_id = c and workspace_id = w
  ) then
    raise exception 'invalid_input';
  end if;

  if operation = 'regenerate_image' and (
    pos is null or pos < 0 or pos >= coalesce((select cardinality(image_prompts) from public.content_variants where id = v), 0)
  ) then
    raise exception 'invalid_input';
  end if;

  -- Set status to GENERATING while preserving previous status
  update public.content_items set status = 'GENERATING', updated_at = now() where id = c;

  insert into public.background_jobs(workspace_id, type, payload, idempotency_key)
  values(
    w,
    operation,
    jsonb_build_object(
      'content_id', c,
      'agent_id', item.agent_id,
      'variant_id', v,
      'position', pos,
      'previous_status', item.status,
      'actor_id', actor_id
    ),
    k
  )
  returning id into jid;

  return jid;
end $$;

revoke all on function public.enqueue_regeneration(uuid,uuid,uuid,int,text,int,text,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_regeneration(uuid,uuid,uuid,int,text,int,text,uuid) to service_role;
