-- Classic $1B wins — daily (24h Unix-epoch windows) + $10M Bank payout for top 10.
-- Requires 20261115_classic_wins_leaderboard.sql + bank_ledger (franchise kinds).
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
--
-- Contest windows: floor(epoch/86400)*86400 → +24h (not local midnight).
-- Top 10 of each completed window receive 10_000_000 Bank Money once.

ALTER TABLE public.bank_ledger DROP CONSTRAINT IF EXISTS bank_ledger_kind_check;
ALTER TABLE public.bank_ledger ADD CONSTRAINT bank_ledger_kind_check CHECK (kind IN (
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
  'daily_wins_payout'
));

CREATE TABLE IF NOT EXISTS public.classic_wins_daily_settlements (
  period_key bigint PRIMARY KEY,
  settled_at timestamptz NOT NULL DEFAULT now(),
  paid_count integer NOT NULL DEFAULT 0 CHECK (paid_count >= 0)
);

REVOKE ALL ON TABLE public.classic_wins_daily_settlements FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Daily wins — current 24h Unix-epoch window (top N, default 10)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_classic_wins_daily(p_limit integer DEFAULT 10)
RETURNS TABLE (
  rank bigint,
  username text,
  wins bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH bounds AS (
    SELECT
      to_timestamp(floor(extract(epoch FROM timezone('utc', now())) / 86400) * 86400) AS period_start
  ),
  tallies AS (
    SELECT
      r.user_id,
      count(*)::bigint AS win_count
    FROM public.user_leaderboard_runs r
    CROSS JOIN bounds b
    WHERE r.verified_value >= 1000000000
      AND r.achieved_at >= b.period_start
    GROUP BY r.user_id
  )
  SELECT
    row_number() OVER (ORDER BY t.win_count DESC, p.username_normalized ASC) AS rank,
    p.username,
    t.win_count AS wins
  FROM tallies t
  INNER JOIN public.profiles p ON p.user_id = t.user_id
  WHERE t.win_count > 0
  ORDER BY t.win_count DESC, p.username_normalized ASC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 10), 10));
$$;

REVOKE ALL ON FUNCTION public.get_classic_wins_daily(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_classic_wins_daily(integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signed-in player's daily wins + rank
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_classic_wins_daily()
RETURNS TABLE (
  rank bigint,
  username text,
  wins bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wins bigint;
  v_username text;
  v_normalized text;
  v_period_start timestamptz :=
    to_timestamp(floor(extract(epoch FROM timezone('utc', now())) / 86400) * 86400);
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RETURN;
  END IF;

  SELECT p.username, p.username_normalized
  INTO v_username, v_normalized
  FROM public.profiles p
  WHERE p.user_id = v_uid;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*)::bigint
  INTO v_wins
  FROM public.user_leaderboard_runs r
  WHERE r.user_id = v_uid
    AND r.verified_value >= 1000000000
    AND r.achieved_at >= v_period_start;

  IF coalesce(v_wins, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT 1 + count(*)::bigint INTO rank
  FROM (
    SELECT
      r.user_id,
      count(*)::bigint AS win_count,
      min(op.username_normalized) AS uname
    FROM public.user_leaderboard_runs r
    INNER JOIN public.profiles op ON op.user_id = r.user_id
    WHERE r.verified_value >= 1000000000
      AND r.achieved_at >= v_period_start
    GROUP BY r.user_id
  ) ahead
  WHERE ahead.win_count > v_wins
     OR (ahead.win_count = v_wins AND ahead.uname < v_normalized);

  username := v_username;
  wins := v_wins;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_classic_wins_daily() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_classic_wins_daily() TO authenticated;

-- ---------------------------------------------------------------------------
-- Settle previous 24h window — top 10 each get $10,000,000 Bank Money (once).
-- Idempotent via classic_wins_daily_settlements + bank_ledger unique source.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.settle_classic_wins_daily()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_now_key bigint := floor(extract(epoch FROM timezone('utc', now())) / 86400)::bigint;
  v_prev_key bigint := v_now_key - 1;
  v_prev_start timestamptz := to_timestamp(v_prev_key * 86400);
  v_prev_end timestamptz := to_timestamp(v_now_key * 86400);
  v_paid integer := 0;
  r record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.classic_wins_daily_settlements s WHERE s.period_key = v_prev_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'period_key', v_prev_key, 'already', true);
  END IF;

  FOR r IN
    WITH tallies AS (
      SELECT
        run.user_id,
        count(*)::bigint AS win_count
      FROM public.user_leaderboard_runs run
      WHERE run.verified_value >= 1000000000
        AND run.achieved_at >= v_prev_start
        AND run.achieved_at < v_prev_end
      GROUP BY run.user_id
    ),
    ranked AS (
      SELECT
        t.user_id,
        t.win_count,
        row_number() OVER (ORDER BY t.win_count DESC, p.username_normalized ASC) AS rk
      FROM tallies t
      INNER JOIN public.profiles p ON p.user_id = t.user_id
      WHERE t.win_count > 0
    )
    SELECT user_id, win_count, rk
    FROM ranked
    WHERE rk <= 10
    ORDER BY rk
  LOOP
    IF public.bank_post(
      r.user_id,
      10000000,
      'daily_wins_payout',
      'daily:' || v_prev_key::text,
      jsonb_build_object(
        'period_key', v_prev_key,
        'rank', r.rk,
        'wins', r.win_count
      )
    ) THEN
      v_paid := v_paid + 1;
    END IF;
  END LOOP;

  INSERT INTO public.classic_wins_daily_settlements (period_key, paid_count)
  VALUES (v_prev_key, v_paid)
  ON CONFLICT (period_key) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'period_key', v_prev_key,
    'paid', v_paid,
    'already', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_classic_wins_daily() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_classic_wins_daily() TO anon, authenticated;
