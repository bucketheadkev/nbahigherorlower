-- Coin ledger: server-side perk/shop coins for permanent accounts.
-- Parallel to bank_post / bank_accounts, but for the gold coin economy (not Bank Cash).
--
-- Model
--   coin_ledger    append-only entries (credits > 0, debits < 0), one per unique source.
--   coin_accounts  cached balance per user, maintained only by public.coin_post().
--   Clients can read their own balance via get_my_coin_balance(). Nothing is client-writable.
--
-- Apply in Supabase SQL Editor (or migrate). Safe to re-run.

CREATE TABLE IF NOT EXISTS public.coin_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coin_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount <> 0),
  kind text NOT NULL CHECK (kind IN (
    'admin_adjustment',
    'iap_grant',
    'iap_refund',
    'welcome',
    'run_award',
    'spend'
  )),
  source_ref text NOT NULL CHECK (length(source_ref) BETWEEN 1 AND 200),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coin_ledger_unique_source UNIQUE (user_id, kind, source_ref)
);

CREATE INDEX IF NOT EXISTS coin_ledger_user_created_idx
  ON public.coin_ledger (user_id, created_at DESC);

COMMENT ON TABLE public.coin_ledger IS
  'Append-only gold-coin ledger. Written only by coin_post().';
COMMENT ON TABLE public.coin_accounts IS
  'Cached coin balance = sum(coin_ledger.amount). Written only by coin_post().';

ALTER TABLE public.coin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.coin_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coin_ledger FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS coin_ledger_select_own ON public.coin_ledger;
CREATE POLICY coin_ledger_select_own
  ON public.coin_ledger
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON TABLE public.coin_ledger TO authenticated;

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
    RETURN false;
  END IF;

  IF v_balance + p_amount < 0 THEN
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

CREATE OR REPLACE FUNCTION public.get_my_coin_balance()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance bigint;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;
  SELECT coalesce(a.balance, 0) INTO v_balance
  FROM public.coin_accounts a
  WHERE a.user_id = v_uid;
  RETURN coalesce(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_coin_balance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_coin_balance() TO authenticated;
