-- 202609140001_routine_status_and_mode.sql
-- 1. Safely migrate any legacy agents with mode='MANUAL' to 'ASSISTED'
UPDATE public.agents
SET mode = 'ASSISTED', approval_required = true
WHERE mode = 'MANUAL';

-- 2. Add ROUTINE to content_status enum before GENERATING
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'content_status'
      AND pg_enum.enumlabel = 'ROUTINE'
  ) THEN
    ALTER TYPE public.content_status ADD VALUE 'ROUTINE' BEFORE 'GENERATING';
  END IF;
END $$;

-- 3. Update enforce_content_transition trigger to support ROUTINE transitions
CREATE OR REPLACE FUNCTION public.enforce_content_transition() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF new.workspace_id<>old.workspace_id OR new.agent_id<>old.agent_id THEN
    RAISE EXCEPTION 'immutable ownership';
  END IF;

  IF new.status<>old.status AND NOT (
    (old.status='DRAFT' AND new.status IN ('ROUTINE','GENERATING','AWAITING_REVIEW','ARCHIVED')) OR
    (old.status='ROUTINE' AND new.status IN ('GENERATING','APPROVED','REJECTED','ARCHIVED')) OR
    (old.status='GENERATING' AND new.status IN ('ROUTINE','AWAITING_REVIEW','FAILED')) OR
    (old.status='AWAITING_REVIEW' AND new.status IN ('APPROVED','REJECTED','GENERATING','ARCHIVED')) OR
    (old.status='APPROVED' AND new.status IN ('SCHEDULED','AWAITING_REVIEW','ROUTINE','ARCHIVED')) OR
    (old.status='SCHEDULED' AND new.status IN ('PUBLISHING','APPROVED','AWAITING_REVIEW','ARCHIVED')) OR
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

-- 4. Update check constraint on agents.mode to strictly allow only 'ASSISTED' and 'AUTONOMOUS'
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_mode_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_mode_check CHECK (mode IN ('ASSISTED', 'AUTONOMOUS'));
