-- Surplus Spin: after a verified Classic run over $1,000,000,000 the player chooses once
--   BANK IT  → credit the full surplus (verified_value − $1B)
--   RISK IT  → server rolls a weighted multiplier; credit floor(surplus × multiplier)
-- Only the run's surplus is at stake; existing Bank money is never debited.
--
-- Requires 20261017_1_bank_ledger.sql. Replaces the automatic run bonus: the old
-- bank_credit_run_bonus trigger is removed so the surplus is paid only by a decision.
-- (If 20261017_4_run_bonus_on.sql was applied, runs it already paid show as "banked".)
--
-- Integrity
--   * Surplus comes from user_leaderboard_runs.verified_value (server-priced), never the client.
--   * One decision row per run (PK) — retries, double taps and second devices return the
--     stored result. The payout posts through bank_post() keyed by run ID ('classic_run_bonus').
--   * Randomness: gen_random_uuid() (cryptographically random) → uniform 32-bit roll.
--   * Odds live in surplus_spin_odds (mirrored for guests in lib/tradeup/surplusSpin.ts).
--   * Only runs on/after the Bank launch (Oct 17, 2026 Pacific) qualify.
--
-- Trust note: verified runs prove a lineup's value, not that it was drafted from real
-- spins. Until runs are server-issued, a forged lineup can still qualify.
--
-- All Cash is fictional in-game currency. No purchase, no cash-out.
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Retire the automatic run bonus
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS bank_credit_run_bonus_trg ON public.user_leaderboard_runs;

UPDATE public.bank_settings
SET run_bonus_enabled = false,
    updated_at = now()
WHERE id;

-- ---------------------------------------------------------------------------
-- Odds (weights out of 10,000). Expected multiplier 0.945×.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.surplus_spin_odds (
  multiplier_tenths smallint PRIMARY KEY CHECK (multiplier_tenths BETWEEN 0 AND 100),
  weight integer NOT NULL CHECK (weight >= 0)
);

INSERT INTO public.surplus_spin_odds (multiplier_tenths, weight) VALUES
  (0, 3500),
  (5, 2300),
  (10, 2000),
  (20, 1300),
  (30, 450),
  (40, 200),
  (50, 110),
  (60, 60),
  (70, 35),
  (80, 20),
  (90, 15),
  (100, 10)
ON CONFLICT (multiplier_tenths) DO UPDATE SET weight = EXCLUDED.weight;

ALTER TABLE public.surplus_spin_odds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS surplus_spin_odds_read ON public.surplus_spin_odds;
CREATE POLICY surplus_spin_odds_read
  ON public.surplus_spin_odds
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.surplus_spin_odds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.surplus_spin_odds TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Decisions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.surplus_decisions (
  run_id uuid PRIMARY KEY REFERENCES public.user_leaderboard_runs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  surplus bigint NOT NULL CHECK (surplus > 0),
  choice text NOT NULL CHECK (choice IN ('bank', 'spin')),
  multiplier_tenths smallint NOT NULL CHECK (multiplier_tenths BETWEEN 0 AND 100),
  payout bigint NOT NULL CHECK (payout >= 0),
  roll bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS surplus_decisions_user_idx
  ON public.surplus_decisions (user_id, created_at DESC);

ALTER TABLE public.surplus_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS surplus_decisions_select_own ON public.surplus_decisions;
CREATE POLICY surplus_decisions_select_own
  ON public.surplus_decisions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.surplus_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.surplus_decisions TO authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.surplus_launch_at()
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$ SELECT timestamptz '2026-10-17 00:00:00 America/Los_Angeles' $$;

-- Shape returned to the client for one run.
CREATE OR REPLACE FUNCTION public.surplus_state(p_run public.user_leaderboard_runs)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_surplus bigint := p_run.verified_value - 1000000000;
  d public.surplus_decisions%ROWTYPE;
  v_legacy bigint;
BEGIN
  IF v_surplus <= 0 OR p_run.achieved_at < public.surplus_launch_at() THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  SELECT * INTO d FROM public.surplus_decisions WHERE run_id = p_run.id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'resolved',
      'client_run_id', p_run.client_run_id,
      'run_value', p_run.verified_value,
      'surplus', d.surplus,
      'choice', d.choice,
      'multiplier_tenths', d.multiplier_tenths,
      'payout', d.payout
    );
  END IF;

  -- Paid by the retired automatic bonus → treat as banked.
  SELECT amount INTO v_legacy
  FROM public.bank_ledger
  WHERE user_id = p_run.user_id AND kind = 'classic_run_bonus' AND source_ref = p_run.id::text;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'resolved',
      'client_run_id', p_run.client_run_id,
      'run_value', p_run.verified_value,
      'surplus', v_surplus,
      'choice', 'bank',
      'multiplier_tenths', 10,
      'payout', v_legacy
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'pending',
    'client_run_id', p_run.client_run_id,
    'run_value', p_run.verified_value,
    'surplus', v_surplus
  );
END;
$$;

REVOKE ALL ON FUNCTION public.surplus_state(public.user_leaderboard_runs) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

-- State for a run submitted with p_client_run_id: none | pending | resolved.
CREATE OR REPLACE FUNCTION public.get_surplus_decision(p_client_run_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  r public.user_leaderboard_runs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  SELECT * INTO r
  FROM public.user_leaderboard_runs
  WHERE user_id = auth.uid() AND client_run_id = p_client_run_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  RETURN public.surplus_state(r);
END;
$$;

REVOKE ALL ON FUNCTION public.get_surplus_decision(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_surplus_decision(text) TO authenticated;

-- Most recent undecided qualifying run (interrupted results screen), or status none.
CREATE OR REPLACE FUNCTION public.get_pending_surplus()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  r public.user_leaderboard_runs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  SELECT lr.* INTO r
  FROM public.user_leaderboard_runs lr
  WHERE lr.user_id = auth.uid()
    AND lr.verified_value > 1000000000
    AND lr.achieved_at >= public.surplus_launch_at()
    AND lr.client_run_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.surplus_decisions d WHERE d.run_id = lr.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.bank_ledger l
      WHERE l.user_id = lr.user_id AND l.kind = 'classic_run_bonus' AND l.source_ref = lr.id::text
    )
  ORDER BY lr.achieved_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  RETURN public.surplus_state(r);
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_surplus() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_surplus() TO authenticated;

-- Settle the decision once. Repeat calls return the stored result without paying again.
CREATE OR REPLACE FUNCTION public.resolve_surplus(p_client_run_id text, p_choice text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r public.user_leaderboard_runs%ROWTYPE;
  v_state jsonb;
  v_surplus bigint;
  v_total bigint;
  v_roll bigint;
  v_pick bigint;
  v_tenths smallint := 10;
  v_payout bigint;
  o record;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  IF p_choice NOT IN ('bank', 'spin') THEN
    RAISE EXCEPTION 'invalid_choice' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r
  FROM public.user_leaderboard_runs
  WHERE user_id = v_uid AND client_run_id = p_client_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_state := public.surplus_state(r);
  IF v_state ->> 'status' <> 'pending' THEN
    RETURN v_state;
  END IF;

  v_surplus := (v_state ->> 'surplus')::bigint;

  IF p_choice = 'spin' THEN
    SELECT sum(weight) INTO v_total FROM public.surplus_spin_odds WHERE weight > 0;
    IF coalesce(v_total, 0) <= 0 THEN
      RAISE EXCEPTION 'odds_unavailable' USING ERRCODE = 'P0001';
    END IF;
    v_roll := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint;
    v_pick := v_roll % v_total;
    FOR o IN
      SELECT multiplier_tenths, weight FROM public.surplus_spin_odds
      WHERE weight > 0 ORDER BY multiplier_tenths
    LOOP
      IF v_pick < o.weight THEN
        v_tenths := o.multiplier_tenths;
        EXIT;
      END IF;
      v_pick := v_pick - o.weight;
    END LOOP;
  END IF;

  v_payout := (v_surplus * v_tenths) / 10;

  INSERT INTO public.surplus_decisions (run_id, user_id, surplus, choice, multiplier_tenths, payout, roll)
  VALUES (r.id, v_uid, v_surplus, p_choice, v_tenths, v_payout, v_roll)
  ON CONFLICT (run_id) DO NOTHING;

  IF v_payout > 0 THEN
    PERFORM public.bank_post(v_uid, v_payout, 'classic_run_bonus', r.id::text,
      jsonb_build_object('run_id', r.id, 'choice', p_choice, 'multiplier_tenths', v_tenths,
        'surplus', v_surplus));
  END IF;

  RETURN public.surplus_state(r);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_surplus(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_surplus(text, text) TO authenticated;
