-- Rollover, Run Bonuses and rank-up rewards (2026-10-26).
-- Requires 20261018_1_surplus_spin.sql, 20261018_6_wager_slips.sql, 20261025_1_bank_rank.sql and
-- 20261025_3_bets_cash_cups.sql. Cash Cups are not touched.
--
-- Rollover
--   * Every dollar a verified Classic run is worth above $1,000,000,000 is paid to the Bank
--     automatically when the run is recorded — no choice, no spin, nothing to lose. One payout per
--     run (ledger key = run id, kind 'classic_run_bonus'), recorded as a 'bank' surplus decision.
--   * Runs still waiting on the old Bank-it / Risk-it choice are paid in full now. Runs already
--     decided keep their recorded result. Older app builds that ask to "spin" are banked instead.
--
-- Bet on Yourself is retired: no new slips; any slip still open gets its stake back once.
--
-- Run Bonuses (mirror lib/tradeup/runBonuses.ts)
--   * Each signed-in player always has one open bonus, picked by the server (tier 45/30/20/5 %,
--     even within a tier). It stays the same until a Classic run is completed after it was given,
--     so leaving a run never re-rolls it.
--   * It settles against the FIRST Classic run recorded after it was assigned (Cash Cup runs —
--     client ids 'circuit_…' — don't count), from the server-priced lineup. Reroll use comes from
--     the app for that run; if the app never reports it, rerolls are assumed used.
--   * A completed bonus pays once (kind 'run_bonus', key = assignment id).
--
-- Rank-up rewards
--   * Reaching Pro, All-Star, Superstar, Legend and GOAT (highest Bank ever, bank_peak) pays
--     $5M, $10M, $20M, $30M and $40M once each (kind 'rank_reward', key 'bankrank:<rank>').
--     Each reward is smaller than the gap to the next rank, so rewards never chain into ranks.
--   * Players who already hold a rank collect its reward once on their next visit.
--
-- In-game Cash only. Apply manually in the Supabase SQL Editor. Safe to re-run.

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
  'run_bonus'
));

-- ---------------------------------------------------------------------------
-- Rollover
-- ---------------------------------------------------------------------------

-- Pays a run's full surplus once. Runs that already have a surplus decision are left alone.
CREATE OR REPLACE FUNCTION public.classic_rollover_pay(r public.user_leaderboard_runs)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_surplus bigint := r.verified_value - 1000000000;
  v_rows integer;
BEGIN
  IF v_surplus <= 0 OR r.achieved_at < public.surplus_launch_at() THEN
    RETURN 0;
  END IF;
  -- Already paid by the retired automatic bonus.
  IF EXISTS (
    SELECT 1 FROM public.bank_ledger
    WHERE user_id = r.user_id AND kind = 'classic_run_bonus' AND source_ref = r.id::text
  ) THEN
    RETURN 0;
  END IF;
  INSERT INTO public.surplus_decisions (run_id, user_id, surplus, choice, multiplier_tenths, payout, roll)
  VALUES (r.id, r.user_id, v_surplus, 'bank', 10, v_surplus, NULL)
  ON CONFLICT (run_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN 0;
  END IF;
  PERFORM public.bank_post(r.user_id, v_surplus, 'classic_run_bonus', r.id::text,
    jsonb_build_object('run_id', r.id, 'rollover', true, 'surplus', v_surplus));
  RETURN v_surplus;
END;
$$;

REVOKE ALL ON FUNCTION public.classic_rollover_pay(public.user_leaderboard_runs) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.classic_rollover_on_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  PERFORM public.classic_rollover_pay(NEW);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.classic_rollover_on_run() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS classic_rollover_on_run_trg ON public.user_leaderboard_runs;
CREATE TRIGGER classic_rollover_on_run_trg
  AFTER INSERT ON public.user_leaderboard_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.classic_rollover_on_run();

-- Runs left waiting on the old choice are paid in full now.
DO $$
DECLARE
  r public.user_leaderboard_runs%ROWTYPE;
BEGIN
  FOR r IN
    SELECT lr.* FROM public.user_leaderboard_runs lr
    WHERE lr.verified_value > 1000000000
      AND lr.achieved_at >= public.surplus_launch_at()
      AND NOT EXISTS (SELECT 1 FROM public.surplus_decisions d WHERE d.run_id = lr.id)
  LOOP
    PERFORM public.classic_rollover_pay(r);
  END LOOP;
END;
$$;

-- Older app builds still call this; every choice now banks the full surplus.
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
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.user_leaderboard_runs
  WHERE user_id = v_uid AND client_run_id = p_client_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.classic_rollover_pay(r);
  RETURN public.surplus_state(r);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_surplus(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_surplus(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Bet on Yourself: retired
-- ---------------------------------------------------------------------------

UPDATE public.wager_catalog SET active = false;

DO $$
DECLARE
  s record;
BEGIN
  FOR s IN SELECT id, user_id, total_stake FROM public.wager_slips WHERE status = 'open' FOR UPDATE LOOP
    PERFORM public.bank_post(s.user_id, s.total_stake, 'cash_table_refund', s.id::text,
      jsonb_build_object('slip_id', s.id, 'reason', 'wagers_retired'));
    UPDATE public.wager_slips
    SET status = 'settled', total_return = s.total_stake, settled_at = now()
    WHERE id = s.id;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Run Bonuses
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.run_bonus_catalog (
  id text PRIMARY KEY,
  tier smallint NOT NULL CHECK (tier BETWEEN 1 AND 4),
  reward bigint NOT NULL CHECK (reward > 0),
  active boolean NOT NULL DEFAULT true
);

INSERT INTO public.run_bonus_catalog (id, tier, reward) VALUES
  ('elite_pull', 1, 2000000),
  ('triple_threat', 1, 3000000),
  ('club_920', 1, 3000000),
  ('perfect_fit', 1, 4000000),
  ('generation_gap', 1, 4000000),
  ('double_trouble', 2, 6000000),
  ('no_second_chances', 2, 7000000),
  ('no_weak_links', 2, 8000000),
  ('five_franchises', 2, 10000000),
  ('across_the_eras', 2, 10000000),
  ('superstar_duo', 3, 12000000),
  ('triple_elite', 3, 14000000),
  ('four_horsemen', 3, 15000000),
  ('almost_a_billion', 3, 12000000),
  ('flawless_draft', 3, 18000000),
  ('perfect_five', 4, 25000000),
  ('billion_dollar_run', 4, 25000000),
  ('untouchable', 4, 30000000),
  ('billion_without_mercy', 4, 35000000),
  ('goat_combination', 4, 40000000)
ON CONFLICT (id) DO UPDATE SET tier = EXCLUDED.tier, reward = EXCLUDED.reward;

CREATE TABLE IF NOT EXISTS public.run_bonus_tier_odds (
  tier smallint PRIMARY KEY CHECK (tier BETWEEN 1 AND 4),
  weight integer NOT NULL CHECK (weight >= 0)
);

INSERT INTO public.run_bonus_tier_odds (tier, weight) VALUES (1, 45), (2, 30), (3, 20), (4, 5)
ON CONFLICT (tier) DO UPDATE SET weight = EXCLUDED.weight;

CREATE TABLE IF NOT EXISTS public.run_bonus_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  bonus_id text NOT NULL REFERENCES public.run_bonus_catalog (id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'missed')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  run_id uuid UNIQUE REFERENCES public.user_leaderboard_runs (id) ON DELETE SET NULL,
  rerolls_used boolean,
  payout bigint NOT NULL DEFAULT 0 CHECK (payout >= 0),
  settled_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS run_bonus_one_open_uidx
  ON public.run_bonus_assignments (user_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS run_bonus_user_idx ON public.run_bonus_assignments (user_id, assigned_at DESC);

ALTER TABLE public.run_bonus_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_bonus_tier_odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_bonus_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.run_bonus_catalog, public.run_bonus_tier_odds, public.run_bonus_assignments
  FROM PUBLIC, anon, authenticated;

-- Server-side randomness: a uniform 32-bit roll from gen_random_uuid().
CREATE OR REPLACE FUNCTION public.run_bonus_roll()
RETURNS bigint
LANGUAGE sql
VOLATILE
AS $$ SELECT ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint; $$;

CREATE OR REPLACE FUNCTION public.run_bonus_pick()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_total bigint;
  v_pick bigint;
  v_tier smallint;
  o record;
  v_count integer;
BEGIN
  SELECT sum(weight) INTO v_total FROM public.run_bonus_tier_odds WHERE weight > 0;
  v_pick := public.run_bonus_roll() % v_total;
  FOR o IN SELECT tier, weight FROM public.run_bonus_tier_odds WHERE weight > 0 ORDER BY tier LOOP
    IF v_pick < o.weight THEN
      v_tier := o.tier;
      EXIT;
    END IF;
    v_pick := v_pick - o.weight;
  END LOOP;
  SELECT count(*) INTO v_count FROM public.run_bonus_catalog WHERE tier = v_tier AND active;
  RETURN (
    SELECT id FROM public.run_bonus_catalog WHERE tier = v_tier AND active
    ORDER BY id OFFSET (public.run_bonus_roll() % v_count) LIMIT 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_bonus_roll() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_bonus_pick() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_bonus_met(
  p_bonus text,
  p_values bigint[],
  p_total bigint,
  p_all_primary boolean,
  p_teams integer,
  p_eras integer,
  p_slugs text[],
  p_rerolls boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_bonus
    WHEN 'elite_pull' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 200000000) >= 1
    WHEN 'triple_threat' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 185000000) >= 3
    WHEN 'club_920' THEN p_total >= 920000000
    WHEN 'perfect_fit' THEN p_all_primary AND p_total >= 900000000
    WHEN 'generation_gap' THEN p_eras >= 3 AND p_total >= 920000000
    WHEN 'double_trouble' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 195000000) >= 2
    WHEN 'no_second_chances' THEN NOT p_rerolls AND p_total >= 930000000
    WHEN 'no_weak_links' THEN cardinality(p_values) = 5
      AND (SELECT count(*) FROM unnest(p_values) v WHERE v >= 185000000) = 5
    WHEN 'five_franchises' THEN p_teams >= 5 AND p_total >= 950000000
    WHEN 'across_the_eras' THEN p_eras >= 4 AND p_total >= 950000000
    WHEN 'superstar_duo' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 200000000) >= 2
    WHEN 'triple_elite' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 195000000) >= 3
    WHEN 'four_horsemen' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 190000000) >= 4
    WHEN 'almost_a_billion' THEN p_total >= 985000000
    WHEN 'flawless_draft' THEN NOT p_rerolls AND p_total >= 960000000
    WHEN 'perfect_five' THEN cardinality(p_values) = 5
      AND (SELECT count(*) FROM unnest(p_values) v WHERE v >= 195000000) = 5
    WHEN 'billion_dollar_run' THEN p_total >= 1000000000
    WHEN 'untouchable' THEN NOT p_rerolls AND p_all_primary AND p_total >= 975000000
    WHEN 'billion_without_mercy' THEN NOT p_rerolls AND p_total >= 1000000000
    WHEN 'goat_combination' THEN 'michael_jordan' = ANY (p_slugs) AND 'lebron_james' = ANY (p_slugs)
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.run_bonus_met(text, bigint[], bigint, boolean, integer, integer, text[], boolean)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_bonus_json(a public.run_bonus_assignments)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT jsonb_build_object(
    'assignment_id', a.id,
    'bonus_id', a.bonus_id,
    'tier', c.tier,
    'reward', c.reward,
    'status', a.status,
    'payout', a.payout,
    'assigned_at', a.assigned_at,
    'client_run_id', (SELECT client_run_id FROM public.user_leaderboard_runs WHERE id = a.run_id)
  )
  FROM public.run_bonus_catalog c WHERE c.id = a.bonus_id;
$$;

REVOKE ALL ON FUNCTION public.run_bonus_json(public.run_bonus_assignments) FROM PUBLIC, anon, authenticated;

-- Settle the open bonus against the first Classic run recorded after it was assigned.
-- Caller holds the user's run-bonus lock. Returns the assignment (still open if no run yet).
CREATE OR REPLACE FUNCTION public.run_bonus_settle_open(p_uid uuid, p_client_run_id text, p_rerolls_used boolean)
RETURNS public.run_bonus_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  a public.run_bonus_assignments%ROWTYPE;
  r public.user_leaderboard_runs%ROWTYPE;
  c public.run_bonus_catalog%ROWTYPE;
  v_values bigint[];
  v_all_primary boolean;
  v_teams integer;
  v_eras integer;
  v_slugs text[];
  v_rerolls boolean;
  v_met boolean;
BEGIN
  SELECT * INTO a FROM public.run_bonus_assignments WHERE user_id = p_uid AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO r FROM public.user_leaderboard_runs lr
  WHERE lr.user_id = p_uid
    AND lr.achieved_at >= a.assigned_at
    AND coalesce(lr.client_run_id, '') NOT LIKE 'circuit\_%'
    AND NOT EXISTS (SELECT 1 FROM public.run_bonus_assignments x WHERE x.run_id = lr.id)
  ORDER BY lr.achieved_at, lr.id
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN a;
  END IF;

  SELECT array_agg(public.classic_seat_value(s ->> 'player_id', s ->> 'slot')),
         bool_and(upper(s ->> 'slot') = upper(coalesce(v.primary_position, ''))),
         count(DISTINCT split_part(s ->> 'player_id', '_', 3))::integer,
         count(DISTINCT split_part(s ->> 'player_id', '_', 2))::integer,
         array_agg(regexp_replace(s ->> 'player_id', '^hist_[0-9]{4}s_[A-Za-z]+_', ''))
  INTO v_values, v_all_primary, v_teams, v_eras, v_slugs
  FROM jsonb_array_elements(r.lineup) s
  LEFT JOIN public.classic_player_seat_values v ON v.player_id = s ->> 'player_id';

  v_rerolls := CASE WHEN r.client_run_id = p_client_run_id THEN coalesce(p_rerolls_used, true) ELSE true END;
  SELECT * INTO c FROM public.run_bonus_catalog WHERE id = a.bonus_id;
  v_met := public.run_bonus_met(a.bonus_id, v_values, r.verified_value, coalesce(v_all_primary, false),
                                v_teams, v_eras, v_slugs, v_rerolls);

  UPDATE public.run_bonus_assignments
  SET status = CASE WHEN v_met THEN 'completed' ELSE 'missed' END,
      run_id = r.id,
      rerolls_used = v_rerolls,
      payout = CASE WHEN v_met THEN c.reward ELSE 0 END,
      settled_at = now()
  WHERE id = a.id
  RETURNING * INTO a;

  IF v_met THEN
    PERFORM public.bank_post(p_uid, c.reward, 'run_bonus', a.id::text,
      jsonb_build_object('bonus_id', a.bonus_id, 'run_id', r.id, 'tier', c.tier));
  END IF;
  RETURN a;
END;
$$;

REVOKE ALL ON FUNCTION public.run_bonus_settle_open(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- The bonus for the player's next (or unfinished) Classic run. Creates one when none is open.
CREATE OR REPLACE FUNCTION public.get_run_bonus()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  a public.run_bonus_assignments%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('run_bonus:' || v_uid::text));
  a := public.run_bonus_settle_open(v_uid, NULL, NULL);
  IF a.id IS NULL OR a.status <> 'open' THEN
    INSERT INTO public.run_bonus_assignments (user_id, bonus_id)
    VALUES (v_uid, public.run_bonus_pick())
    RETURNING * INTO a;
  END IF;
  RETURN public.run_bonus_json(a);
END;
$$;

REVOKE ALL ON FUNCTION public.get_run_bonus() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_run_bonus() TO authenticated;

-- Called after a Classic run is recorded. Returns that run's bonus result (pays once).
CREATE OR REPLACE FUNCTION public.settle_run_bonus(p_client_run_id text, p_rerolls_used boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  a public.run_bonus_assignments%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('run_bonus:' || v_uid::text));
  PERFORM public.run_bonus_settle_open(v_uid, p_client_run_id, p_rerolls_used);
  SELECT x.* INTO a FROM public.run_bonus_assignments x
  JOIN public.user_leaderboard_runs lr ON lr.id = x.run_id
  WHERE x.user_id = v_uid AND lr.client_run_id = p_client_run_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  RETURN public.run_bonus_json(a);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_run_bonus(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_run_bonus(text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Rank-up rewards (mirror lib/tradeup/rank/config.ts)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rank_up_rewards (
  rank_id text PRIMARY KEY,
  level smallint NOT NULL UNIQUE,
  min_bank bigint NOT NULL CHECK (min_bank > 0),
  reward bigint NOT NULL CHECK (reward > 0)
);

INSERT INTO public.rank_up_rewards (rank_id, level, min_bank, reward) VALUES
  ('pro', 2, 1000000, 5000000),
  ('allstar', 3, 10000000, 10000000),
  ('superstar', 4, 50000000, 20000000),
  ('legend', 5, 250000000, 30000000),
  ('goat', 6, 1000000000, 40000000)
ON CONFLICT (rank_id) DO UPDATE
  SET level = EXCLUDED.level, min_bank = EXCLUDED.min_bank, reward = EXCLUDED.reward;

ALTER TABLE public.rank_up_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rank_up_rewards FROM PUBLIC, anon, authenticated;

-- Pays every rank the player has reached and not been paid for. Returns what this call credited.
CREATE OR REPLACE FUNCTION public.claim_rank_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_items jsonb := '[]'::jsonb;
  v_paid boolean := true;
  rr record;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('rank_reward:' || v_uid::text));
  -- A reward raises the Bank, so look again until nothing new qualifies (never more than 5 passes).
  FOR i IN 1..5 LOOP
    EXIT WHEN NOT v_paid;
    v_paid := false;
    FOR rr IN
      SELECT * FROM public.rank_up_rewards WHERE min_bank <= public.bank_peak(v_uid) ORDER BY level
    LOOP
      IF public.bank_post(v_uid, rr.reward, 'rank_reward', 'bankrank:' || rr.rank_id,
           jsonb_build_object('rank_id', rr.rank_id, 'level', rr.level)) THEN
        v_paid := true;
        v_items := v_items || jsonb_build_object('rank_id', rr.rank_id, 'level', rr.level, 'reward', rr.reward);
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object(
    'items', v_items,
    'balance', coalesce((SELECT balance FROM public.bank_accounts WHERE user_id = v_uid), 0),
    'peak', public.bank_peak(v_uid),
    'claimed', coalesce((
      SELECT jsonb_agg(substr(source_ref, 10) ORDER BY id)
      FROM public.bank_ledger
      WHERE user_id = v_uid AND kind = 'rank_reward' AND source_ref LIKE 'bankrank:%'
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_rank_rewards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_rank_rewards() TO authenticated;
