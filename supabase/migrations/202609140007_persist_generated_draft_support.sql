-- Migration: 202609140007_persist_generated_draft_support.sql
-- Update persist_generated to support executing generation directly from an existing draft content item

create or replace function public.persist_generated(w uuid,a uuid,j uuid,token uuid,s jsonb,variants jsonb,approval boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v jsonb; begin
 perform 1 from public.background_jobs where id=j and workspace_id=w and lock_token=token and status='RUNNING' and lease_until>now() for update;
 if not found then raise exception 'lease_lost'; end if;

 if exists(select 1 from public.content_items where id=j and workspace_id=w) then
   update public.content_items set
     topic=s->>'topic',
     strategy=s,
     status='GENERATING',
     approval_required=approval,
     updated_at=now()
   where id=j and workspace_id=w;
 else
   insert into public.content_items(id,workspace_id,agent_id,topic,strategy,status,approval_required)
   values(j,w,a,s->>'topic',s,'GENERATING',approval);
 end if;

 for v in select * from jsonb_array_elements(variants) loop
   insert into public.content_variants(workspace_id,content_id,channel,title,caption,hashtags,cta,aspect_ratio,visual_concept,image_prompts)
   values(
     w,
     j,
     v->>'channel',
     v->>'title',
     v->>'caption',
     array(select jsonb_array_elements_text(v->'hashtags')),
     v->>'cta',
     case v->>'channel' when 'tiktok' then '9:16' when 'whatsapp' then '9:16' when 'x' then '16:9' else '4:5' end,
     v->>'visual_concept',
     array(select jsonb_array_elements_text(v->'image_prompts'))
   )
   on conflict (content_id, channel) do update set
     title=excluded.title,
     caption=excluded.caption,
     hashtags=excluded.hashtags,
     cta=excluded.cta,
     aspect_ratio=excluded.aspect_ratio,
     visual_concept=excluded.visual_concept,
     image_prompts=excluded.image_prompts;
 end loop;

 delete from public.content_variants
 where content_id=j and workspace_id=w
   and channel not in (select v->>'channel' from jsonb_array_elements(variants));

 update public.agent_runs set content_id=j where job_id=j;
 return j;
end $$;

revoke all on function public.persist_generated(uuid,uuid,uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.persist_generated(uuid,uuid,uuid,uuid,jsonb,jsonb,boolean) to service_role;
