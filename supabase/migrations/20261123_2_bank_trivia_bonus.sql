-- Trivia Bank Cash credits for permanent accounts (web + iOS sync).
-- Extends bank_ledger kinds + client RPC. Safe to re-run.
-- Prefer applying supabase/admin/2026-11-23_coin_bank_sync_PASTE.sql (includes
-- coin RPCs + preflight). This file is the migration twin for trivia only.
-- Does not DELETE/UPDATE balances, ledger rows, or leaderboard data.

-- Extend the full current kind set (see 20261123_classic_wins_daily) — never
-- shrink the list or live rank/run/franchise rows fail constraint re-add.
ALTER TABLE public.bank_ledger DROP CONSTRAINT IF EXISTS bank_ledger_kind_check;
ALTER TABLE public.bank_ledger
  ADD CONSTRAINT bank_ledger_kind_check CHECK (kind IN (
    'achievement',
    'classic_run_bonus',
    'cash_table_wager',
    'cash_table_payout',
    'cash_table_refund',
    'league_entry',
    'league_payout',
    'league_refund',
    'admin_adjustment',
    'franchise_purchase',
    'franchise_payout',
    'franchise_income',
    'franchise_sale',
    'rank_reward',
    'run_bonus',
    'franchise_chest',
    'franchise_paycheck',
    'franchise_card_sale',
    'daily_wins_payout',
    'trivia_bonus'
  ));

CREATE OR REPLACE FUNCTION public.post_my_trivia_bonus(
  p_source_ref text,
  p_difficulty text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_diff text;
  v_amount bigint;
  v_balance bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_source_ref IS NULL OR length(trim(p_source_ref)) < 1 THEN
    RAISE EXCEPTION 'invalid_ref' USING ERRCODE = '22023';
  END IF;

  v_diff := lower(trim(coalesce(p_difficulty, '')));
  v_amount := CASE v_diff
    WHEN 'easy' THEN 10000000
    WHEN 'medium' THEN 25000000
    WHEN 'hard' THEN 45000000
    ELSE NULL
  END;
  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'invalid_difficulty' USING ERRCODE = '22023';
  END IF;

  PERFORM public.bank_post(
    v_uid,
    v_amount,
    'trivia_bonus',
    trim(p_source_ref),
    jsonb_build_object('difficulty', v_diff)
  );

  SELECT coalesce(a.balance, 0) INTO v_balance
  FROM public.bank_accounts a
  WHERE a.user_id = v_uid;
  RETURN coalesce(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.post_my_trivia_bonus(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_my_trivia_bonus(text, text) TO authenticated;
