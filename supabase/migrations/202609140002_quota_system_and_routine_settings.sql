-- Migration: 202609140002_quota_system_and_routine_settings.sql
-- Goal: Centralized Quota System, Agent Routine Settings, and Independent Variant Status

-- 1. Add routine_settings to agents table
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS routine_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Add content quota columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS content_quota_balance integer NOT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS content_quota_total_assigned integer NOT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS content_quota_total_consumed integer NOT NULL DEFAULT 0;

-- 3. Add independent status and scheduling columns to content_variants
ALTER TABLE public.content_variants
ADD COLUMN IF NOT EXISTS status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS scheduled_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS published_at timestamptz DEFAULT NULL;

-- 4. Create quota_transactions table (Ledger)
CREATE TABLE IF NOT EXISTS public.quota_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  amount integer NOT NULL, -- positive for credits/assignments, negative for deductions/consumptions
  balance_before integer NOT NULL,
  balance_after integer NOT NULL,
  type text NOT NULL CHECK (type IN ('ASSIGNMENT', 'CONSUMPTION', 'REFUND', 'ADJUSTMENT')),
  description text NOT NULL DEFAULT '',
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.background_jobs(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quota_transactions_user_id ON public.quota_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quota_transactions_job_id ON public.quota_transactions(job_id);

ALTER TABLE public.quota_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'quota_transactions' AND policyname = 'quota_transactions_user_select'
  ) THEN
    CREATE POLICY quota_transactions_user_select ON public.quota_transactions
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR public.has_role(workspace_id));
  END IF;
END $$;

GRANT SELECT ON public.quota_transactions TO authenticated;

-- 5. Atomic and Idempotent Quota Deduction Function
CREATE OR REPLACE FUNCTION public.deduct_content_quota(
  p_user_id uuid,
  p_workspace_id uuid,
  p_job_id uuid,
  p_amount integer,
  p_description text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_balance_before integer;
  v_balance_after integer;
  v_existing_tx uuid;
BEGIN
  -- Idempotency check: if already deducted for this job_id, return current balance safely
  IF p_job_id IS NOT NULL THEN
    SELECT id INTO v_existing_tx 
    FROM public.quota_transactions 
    WHERE job_id = p_job_id AND type = 'CONSUMPTION' 
    LIMIT 1;

    IF v_existing_tx IS NOT NULL THEN
      SELECT content_quota_balance INTO v_balance_after FROM public.profiles WHERE id = p_user_id;
      RETURN jsonb_build_object(
        'success', true, 
        'already_deducted', true, 
        'balance', coalesce(v_balance_after, 0)
      );
    END IF;
  END IF;

  -- Lock the target user's profile row
  SELECT content_quota_balance INTO v_balance_before 
  FROM public.profiles 
  WHERE id = p_user_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Check sufficient balance
  IF v_balance_before < p_amount THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'insufficient_quota', 
      'balance', v_balance_before, 
      'required', p_amount
    );
  END IF;

  v_balance_after := v_balance_before - p_amount;

  UPDATE public.profiles
  SET content_quota_balance = v_balance_after,
      content_quota_total_consumed = content_quota_total_consumed + p_amount
  WHERE id = p_user_id;

  INSERT INTO public.quota_transactions (
    user_id, workspace_id, amount, balance_before, balance_after, type, description, job_id, metadata
  ) VALUES (
    p_user_id, p_workspace_id, -p_amount, v_balance_before, v_balance_after, 'CONSUMPTION', 
    coalesce(p_description, 'Consumo de cotas para geração de conteúdo'), p_job_id, p_metadata
  );

  RETURN jsonb_build_object(
    'success', true, 
    'already_deducted', false, 
    'balance', v_balance_after, 
    'deducted', p_amount
  );
END;
$$;

-- 6. Super Admin Quota Assignment Function
CREATE OR REPLACE FUNCTION public.assign_user_quota(
  p_target_user_id uuid,
  p_admin_user_id uuid,
  p_amount integer,
  p_mode text, -- 'ADD' or 'SET'
  p_reason text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_balance_before integer;
  v_balance_after integer;
  v_assigned_diff integer;
BEGIN
  SELECT content_quota_balance INTO v_balance_before 
  FROM public.profiles 
  WHERE id = p_target_user_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF p_mode = 'SET' THEN
    v_balance_after := p_amount;
    v_assigned_diff := v_balance_after - v_balance_before;
  ELSE
    v_balance_after := v_balance_before + p_amount;
    v_assigned_diff := p_amount;
  END IF;

  IF v_balance_after < 0 THEN
    RAISE EXCEPTION 'balance_cannot_be_negative';
  END IF;

  UPDATE public.profiles
  SET content_quota_balance = v_balance_after,
      content_quota_total_assigned = greatest(0, content_quota_total_assigned + v_assigned_diff)
  WHERE id = p_target_user_id;

  INSERT INTO public.quota_transactions (
    user_id, amount, balance_before, balance_after, type, description, actor_id, metadata
  ) VALUES (
    p_target_user_id,
    v_balance_after - v_balance_before,
    v_balance_before,
    v_balance_after,
    'ASSIGNMENT',
    CASE WHEN p_reason <> '' THEN p_reason ELSE 'Atribuição de cotas pelo Super Admin' END,
    p_admin_user_id,
    jsonb_build_object('mode', p_mode, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'success', true, 
    'balance', v_balance_after, 
    'previous', v_balance_before
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_content_quota(uuid,uuid,uuid,integer,text,jsonb), public.assign_user_quota(uuid,uuid,integer,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_content_quota(uuid,uuid,uuid,integer,text,jsonb), public.assign_user_quota(uuid,uuid,integer,text,text) TO service_role;
