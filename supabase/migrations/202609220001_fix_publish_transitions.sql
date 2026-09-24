-- Fix publish transitions: allow transition to PUBLISHED from APPROVED, SCHEDULED, ROUTINE, and AWAITING_REVIEW
-- Fix variant_edit_guard to not reset content_items to AWAITING_REVIEW when updating variant status/published_at/scheduled_at

CREATE OR REPLACE FUNCTION public.enforce_content_transition() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF new.workspace_id<>old.workspace_id OR new.agent_id<>old.agent_id THEN
    RAISE EXCEPTION 'immutable ownership';
  END IF;

  IF new.status<>old.status AND NOT (
    (old.status='DRAFT' AND new.status IN ('ROUTINE','GENERATING','AWAITING_REVIEW','ARCHIVED')) OR
    (old.status='ROUTINE' AND new.status IN ('GENERATING','APPROVED','REJECTED','ARCHIVED','PUBLISHING','PUBLISHED')) OR
    (old.status='GENERATING' AND new.status IN ('ROUTINE','AWAITING_REVIEW','FAILED')) OR
    (old.status='AWAITING_REVIEW' AND new.status IN ('APPROVED','REJECTED','GENERATING','ARCHIVED','PUBLISHING','PUBLISHED')) OR
    (old.status='APPROVED' AND new.status IN ('SCHEDULED','AWAITING_REVIEW','ROUTINE','ARCHIVED','PUBLISHING','PUBLISHED')) OR
    (old.status='SCHEDULED' AND new.status IN ('PUBLISHING','APPROVED','AWAITING_REVIEW','ARCHIVED','PUBLISHED')) OR
    (old.status='PUBLISHING' AND new.status IN ('PUBLISHED','FAILED')) OR
    (old.status='FAILED' AND new.status IN ('ROUTINE','GENERATING','AWAITING_REVIEW','ARCHIVED')) OR
    (old.status='REJECTED' AND new.status IN ('ROUTINE','GENERATING','AWAITING_REVIEW','ARCHIVED')) OR
    (old.status='PUBLISHED' AND new.status='ARCHIVED')
  ) THEN
    RAISE EXCEPTION 'invalid transition % -> %',old.status,new.status;
  END IF;

  IF new.status='SCHEDULED' AND (new.scheduled_at IS NULL OR new.scheduled_at<=now()) THEN
    RAISE EXCEPTION 'future schedule required';
  END IF;

  IF new.topic<>old.topic OR new.strategy<>old.strategy THEN
    IF old.status IN ('PUBLISHING','PUBLISHED','ARCHIVED') THEN
      RAISE EXCEPTION 'content locked';
    END IF;
    IF new.status IN ('APPROVED','SCHEDULED') THEN
      new.status='AWAITING_REVIEW';
      new.scheduled_at=NULL;
    END IF;
  END IF;

  new.version=old.version+1;
  new.updated_at=now();
  RETURN new;
END $$;

CREATE OR REPLACE FUNCTION public.variant_edit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.content_status; BEGIN
 IF new.content_id<>old.content_id OR new.workspace_id<>old.workspace_id THEN RAISE EXCEPTION 'immutable ownership'; END IF;
 SELECT status INTO s FROM public.content_items WHERE id=new.content_id FOR UPDATE;

 -- If the content item is locked, only allow status/publication updates on the variant
 IF s IN ('PUBLISHING','PUBLISHED','ARCHIVED') AND (to_jsonb(new) - 'status' - 'published_at' - 'scheduled_at') <> (to_jsonb(old) - 'status' - 'published_at' - 'scheduled_at') THEN
   RAISE EXCEPTION 'content locked';
 END IF;

 -- If this is a variant status or publishing update, or a caption-only update, do not reset status to AWAITING_REVIEW
 IF (to_jsonb(new) - 'status' - 'published_at' - 'scheduled_at') = (to_jsonb(old) - 'status' - 'published_at' - 'scheduled_at') THEN
   UPDATE public.content_items SET updated_at=now() WHERE id=new.content_id;
 ELSIF current_setting('app.caption_only',true)='on' AND (to_jsonb(new)-'caption')=(to_jsonb(old)-'caption') THEN
   UPDATE public.content_items SET updated_at=now() WHERE id=new.content_id;
 ELSE
   UPDATE public.content_items SET status=CASE WHEN s IN ('APPROVED','SCHEDULED') THEN 'AWAITING_REVIEW'::public.content_status ELSE s END, scheduled_at=NULL WHERE id=new.content_id;
 END IF;
 RETURN new;
END $$;
