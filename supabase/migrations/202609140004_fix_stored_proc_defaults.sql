-- Add admin_email column to quota_transactions
ALTER TABLE public.quota_transactions ADD COLUMN IF NOT EXISTS admin_email text;

-- Drop old overloads and recreate with defaults for seamless PostgREST RPC invocation
DROP FUNCTION IF EXISTS public.deduct_content_quota(uuid, uuid, uuid, integer, text, jsonb);
DROP FUNCTION IF EXISTS public.deduct_content_quota(uuid, integer, text, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.deduct_content_quota;

DROP FUNCTION IF EXISTS public.assign_user_quota(uuid, uuid, integer, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.assign_user_quota(uuid, integer, text, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.assign_user_quota;

CREATE OR REPLACE FUNCTION public.deduct_content_quota(
  p_user_id uuid,
  p_amount integer,
  p_description text DEFAULT 'Geração de conteúdo',
  p_workspace_id uuid DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_before integer;
  v_balance_after integer;
  v_existing_tx uuid;
BEGIN
  -- Check idempotency: If this job_id has already been processed for this user, return current balance
  IF p_job_id IS NOT NULL THEN
    SELECT id, balance_after INTO v_existing_tx, v_balance_after
    FROM public.quota_transactions
    WHERE job_id = p_job_id AND user_id = p_user_id AND type = 'CONSUMPTION'
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'transaction_id', v_existing_tx,
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
    p_description, p_job_id, coalesce(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'balance_before', v_balance_before,
    'balance', v_balance_after,
    'amount_debited', p_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_user_quota(
  p_user_id uuid,
  p_amount integer,
  p_mode text DEFAULT 'add',
  p_reason text DEFAULT 'Ajuste administrativo',
  p_admin_email text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_before integer;
  v_balance_after integer;
  v_tx_type text;
  v_tx_amount integer;
  v_new_tx record;
BEGIN
  SELECT content_quota_balance INTO v_balance_before 
  FROM public.profiles 
  WHERE id = p_user_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF p_mode = 'set' THEN
    v_balance_after := p_amount;
    v_tx_amount := v_balance_after - v_balance_before;
    v_tx_type := 'ADJUSTMENT';
  ELSE
    v_balance_after := v_balance_before + p_amount;
    v_tx_amount := p_amount;
    v_tx_type := 'ASSIGNMENT';
  END IF;

  UPDATE public.profiles
  SET content_quota_balance = v_balance_after,
      content_quota_total_assigned = CASE 
        WHEN p_mode = 'add' AND p_amount > 0 THEN content_quota_total_assigned + p_amount 
        ELSE content_quota_total_assigned 
      END
  WHERE id = p_user_id;

  INSERT INTO public.quota_transactions (
    user_id, workspace_id, amount, balance_before, balance_after, type, description, actor_id, admin_email, metadata
  ) VALUES (
    p_user_id, p_workspace_id, v_tx_amount, v_balance_before, v_balance_after, v_tx_type, 
    p_reason, p_admin_id, p_admin_email, jsonb_build_object('mode', p_mode)
  )
  RETURNING * INTO v_new_tx;

  RETURN jsonb_build_object(
    'success', true,
    'balance_before', v_balance_before,
    'balance', v_balance_after,
    'transaction', row_to_json(v_new_tx)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_content_quota(uuid, integer, text, uuid, uuid, jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_user_quota(uuid, integer, text, text, text, uuid, uuid) TO service_role, authenticated;
