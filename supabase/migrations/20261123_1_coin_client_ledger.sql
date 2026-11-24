-- Client-callable coin spend / credit for permanent accounts (web + iOS sync).
-- Requires coin_accounts / coin_post / get_my_coin_balance (20261122_1_coin_ledger.sql).
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.spend_my_coins(
  p_amount bigint,
  p_source_ref text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_amount bigint;
  v_balance bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  v_amount := abs(coalesce(p_amount, 0));
  IF v_amount <= 0 OR p_source_ref IS NULL OR length(trim(p_source_ref)) < 1 THEN
    RAISE EXCEPTION 'invalid_spend' USING ERRCODE = '22023';
  END IF;

  IF NOT public.coin_post(v_uid, -v_amount, 'spend', trim(p_source_ref), '{}'::jsonb) THEN
    -- Duplicate source_ref — treat as already applied.
    NULL;
  END IF;

  SELECT coalesce(a.balance, 0) INTO v_balance
  FROM public.coin_accounts a
  WHERE a.user_id = v_uid;
  RETURN coalesce(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.spend_my_coins(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_my_coins(bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.credit_my_coins(
  p_amount bigint,
  p_kind text,
  p_source_ref text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_amount bigint;
  v_kind text;
  v_balance bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  v_amount := abs(coalesce(p_amount, 0));
  v_kind := lower(trim(coalesce(p_kind, '')));
  IF v_amount <= 0 OR p_source_ref IS NULL OR length(trim(p_source_ref)) < 1 THEN
    RAISE EXCEPTION 'invalid_credit' USING ERRCODE = '22023';
  END IF;
  IF v_kind NOT IN ('run_award', 'welcome', 'iap_grant') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023';
  END IF;

  IF NOT public.coin_post(v_uid, v_amount, v_kind, trim(p_source_ref), '{}'::jsonb) THEN
    NULL;
  END IF;

  SELECT coalesce(a.balance, 0) INTO v_balance
  FROM public.coin_accounts a
  WHERE a.user_id = v_uid;
  RETURN coalesce(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.credit_my_coins(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credit_my_coins(bigint, text, text) TO authenticated;
