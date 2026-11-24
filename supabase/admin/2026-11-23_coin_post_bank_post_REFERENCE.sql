-- REFERENCE ONLY — coin_post / bank_post as re-asserted in 2026-11-23_SECURE_coin_bank_REVIEW.sql
-- Not a migration. For independent security review.
-- Semantics: FOR UPDATE on account, UNIQUE (user_id, kind, source_ref), insufficient_* raises,
-- EXECUTE revoked from PUBLIC/anon/authenticated (service/feature RPCs only).

CREATE OR REPLACE FUNCTION public.coin_post(
  p_user uuid,
  p_amount bigint,
  p_kind text,
  p_source_ref text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_balance bigint;
  v_entry bigint;
BEGIN
  IF p_user IS NULL OR p_amount IS NULL OR p_amount = 0 THEN
    RETURN false;
  END IF;
  IF length(trim(coalesce(p_source_ref, ''))) < 1 OR length(p_source_ref) > 200 THEN
    RAISE EXCEPTION 'invalid_source_ref' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.coin_accounts (user_id) VALUES (p_user)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.coin_accounts
  WHERE user_id = p_user
  FOR UPDATE;

  INSERT INTO public.coin_ledger (user_id, amount, kind, source_ref, metadata)
  VALUES (p_user, p_amount, p_kind, p_source_ref, coalesce(p_metadata, '{}'::jsonb))
  ON CONFLICT ON CONSTRAINT coin_ledger_unique_source DO NOTHING
  RETURNING id INTO v_entry;

  IF v_entry IS NULL THEN
    RETURN false; -- duplicate source (idempotent no-op)
  END IF;

  IF v_balance + p_amount < 0 THEN
    -- Unique row already inserted — remove it so a retry can succeed after funding.
    DELETE FROM public.coin_ledger WHERE id = v_entry;
    RAISE EXCEPTION 'insufficient_coins' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.coin_accounts
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.coin_post(uuid, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bank_post(
  p_user uuid,
  p_amount bigint,
  p_kind text,
  p_source_ref text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_balance bigint;
  v_entry bigint;
BEGIN
  IF p_user IS NULL OR p_amount IS NULL OR p_amount = 0 THEN
    RETURN false;
  END IF;
  IF length(trim(coalesce(p_source_ref, ''))) < 1 OR length(p_source_ref) > 200 THEN
    RAISE EXCEPTION 'invalid_source_ref' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.bank_accounts (user_id) VALUES (p_user)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.bank_accounts
  WHERE user_id = p_user
  FOR UPDATE;

  INSERT INTO public.bank_ledger (user_id, amount, kind, source_ref, metadata)
  VALUES (p_user, p_amount, p_kind, p_source_ref, coalesce(p_metadata, '{}'::jsonb))
  ON CONFLICT ON CONSTRAINT bank_ledger_unique_source DO NOTHING
  RETURNING id INTO v_entry;

  IF v_entry IS NULL THEN
    RETURN false;
  END IF;

  IF v_balance + p_amount < 0 THEN
    DELETE FROM public.bank_ledger WHERE id = v_entry;
    RAISE EXCEPTION 'insufficient_funds' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bank_accounts
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.bank_post(uuid, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;
