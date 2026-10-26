-- Franchise Ownership (2026-10-24). Requires the Bank ledger (20261017_1), the seat-price catalog
-- (20260927 + 20261019_2 resync), and 20261024_2_franchise_seed.sql for prices and the player pool.
--
-- Players spend Bank Cash to own a current NBA franchise (once each). Every owned franchise runs
-- 48-hour earning cycles: draft five players with server-rolled TEAM/ERA spins, lock the lineup,
-- then collect a fixed paycheck (base payout + lineup bonus) once the cycle ends.
--
-- Trust
--   * Everything is decided here: spins, pick eligibility, seat prices, paycheck, and timing
--     (server clock). Refreshing or closing the app resumes the same draft — a rolled spin is
--     stored and returned again, never re-rolled.
--   * Purchases and paychecks post once through bank_post() ('franchise_purchase' keyed by team,
--     'franchise_payout' keyed by cycle). bank_post rejects overdrafts.
--   * At most N franchises (franchise_settings.max_active) may have an unfinished cycle — drafting,
--     earning, or waiting to be collected. A per-user advisory lock serializes starts and purchases.
--   * Ownership is not an asset: it never counts toward Bank rank or the Wall of Fame threshold.
--     Existing Wall of Fame inductions are permanent and untouched.
--   * Franchise drafts never touch Classic runs, leaderboards, achievements, wagers or rerolls.
--
-- In-game Cash only. Apply manually in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Ledger kinds
-- ---------------------------------------------------------------------------

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
  'franchise_payout'
));

-- ---------------------------------------------------------------------------
-- Configuration (seeded by 20261024_2_franchise_seed.sql)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.franchise_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  cycle_hours integer NOT NULL CHECK (cycle_hours > 0),
  max_active integer NOT NULL CHECK (max_active > 0),
  bonus_max bigint NOT NULL CHECK (bonus_max >= 0),
  bonus_floor bigint NOT NULL,
  bonus_full bigint NOT NULL,
  bonus_step bigint NOT NULL CHECK (bonus_step > 0),
  CHECK (bonus_full > bonus_floor)
);

CREATE TABLE IF NOT EXISTS public.franchise_catalog (
  team_id text PRIMARY KEY,
  name text NOT NULL,
  championships integer NOT NULL CHECK (championships >= 0),
  price bigint NOT NULL CHECK (price > 0),
  base_payout bigint NOT NULL CHECK (base_payout > 0),
  sort integer NOT NULL DEFAULT 0
);

-- Every Classic player (era + team + eligible seats). Prices come from classic_player_seat_values.
CREATE TABLE IF NOT EXISTS public.franchise_player_pool (
  player_id text PRIMARY KEY,
  team_id text NOT NULL,
  era text NOT NULL,
  eligible text[] NOT NULL
);

CREATE INDEX IF NOT EXISTS franchise_player_pool_pair_idx ON public.franchise_player_pool (team_id, era);

-- ---------------------------------------------------------------------------
-- Ownership and cycles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.franchise_ownership (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES public.franchise_catalog (team_id),
  price_paid bigint NOT NULL CHECK (price_paid > 0),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.franchise_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  team_id text NOT NULL,
  status text NOT NULL DEFAULT 'drafting' CHECK (status IN ('drafting', 'earning', 'collected')),
  picks jsonb NOT NULL DEFAULT '[]'::jsonb,
  spin_team text,
  spin_era text,
  spins integer NOT NULL DEFAULT 0,
  lineup_value bigint,
  base_payout bigint,
  bonus bigint,
  payout bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  ends_at timestamptz,
  collected_at timestamptz,
  FOREIGN KEY (user_id, team_id) REFERENCES public.franchise_ownership (user_id, team_id) ON DELETE CASCADE
);

-- One unfinished cycle per franchise.
CREATE UNIQUE INDEX IF NOT EXISTS franchise_cycles_open_uidx
  ON public.franchise_cycles (user_id, team_id) WHERE status <> 'collected';

CREATE INDEX IF NOT EXISTS franchise_cycles_user_idx ON public.franchise_cycles (user_id, status);

ALTER TABLE public.franchise_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_player_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_cycles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.franchise_settings, public.franchise_catalog, public.franchise_player_pool,
  public.franchise_ownership, public.franchise_cycles FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.franchise_require_user()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

-- Lineup bonus: $0 at/below the floor, straight line to bonus_max at bonus_full, rounded down.
CREATE OR REPLACE FUNCTION public.franchise_lineup_bonus(p_value bigint)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ((s.bonus_max * least(greatest(p_value - s.bonus_floor, 0), s.bonus_full - s.bonus_floor))
           / (s.bonus_full - s.bonus_floor)) / s.bonus_step * s.bonus_step
  FROM public.franchise_settings s
  WHERE s.id;
$$;

CREATE OR REPLACE FUNCTION public.franchise_cycle_json(c public.franchise_cycles)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'team_id', c.team_id,
    'status', CASE WHEN c.status = 'earning' AND now() >= c.ends_at THEN 'ready' ELSE c.status END,
    'picks', c.picks,
    'spin', CASE WHEN c.spin_team IS NULL THEN NULL
                 ELSE jsonb_build_object('team_id', c.spin_team, 'era', c.spin_era) END,
    'spins', c.spins,
    'lineup_value', c.lineup_value,
    'base_payout', c.base_payout,
    'bonus', c.bonus,
    'payout', c.payout,
    'locked_at', c.locked_at,
    'ends_at', c.ends_at,
    'collected_at', c.collected_at
  );
$$;

CREATE OR REPLACE FUNCTION public.franchise_lock_user(p_uid uuid)
RETURNS void
LANGUAGE sql
AS $$ SELECT pg_advisory_xact_lock(hashtext('franchise:' || p_uid::text)); $$;

REVOKE ALL ON FUNCTION public.franchise_require_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_lineup_bonus(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_cycle_json(public.franchise_cycles) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_lock_user(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_franchises()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  s public.franchise_settings%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.franchise_settings WHERE id;
  RETURN jsonb_build_object(
    'server_time', now(),
    'settings', jsonb_build_object(
      'cycle_hours', s.cycle_hours,
      'max_active', s.max_active,
      'bonus_max', s.bonus_max,
      'bonus_floor', s.bonus_floor,
      'bonus_full', s.bonus_full,
      'bonus_step', s.bonus_step
    ),
    'active_cycles', CASE WHEN v_uid IS NULL THEN 0 ELSE (
      SELECT count(*) FROM public.franchise_cycles WHERE user_id = v_uid AND status <> 'collected'
    ) END,
    'franchises', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'team_id', cat.team_id,
        'name', cat.name,
        'championships', cat.championships,
        'price', cat.price,
        'base_payout', cat.base_payout,
        'owned', o.user_id IS NOT NULL,
        'purchased_at', o.purchased_at,
        'cycle', (
          SELECT public.franchise_cycle_json(c) FROM public.franchise_cycles c
          WHERE c.user_id = v_uid AND c.team_id = cat.team_id AND c.status <> 'collected'
        )
      ) ORDER BY cat.sort, cat.team_id)
      FROM public.franchise_catalog cat
      LEFT JOIN public.franchise_ownership o ON o.team_id = cat.team_id AND o.user_id = v_uid
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_franchises() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_franchises() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Purchase (once per franchise; debits the Bank immediately)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.buy_franchise(p_team text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  cat public.franchise_catalog%ROWTYPE;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);
  SELECT * INTO cat FROM public.franchise_catalog WHERE team_id = p_team;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_franchise' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.franchise_ownership WHERE user_id = v_uid AND team_id = p_team) THEN
    PERFORM public.bank_post(v_uid, -cat.price, 'franchise_purchase', p_team,
      jsonb_build_object('team_id', p_team, 'price', cat.price));
    INSERT INTO public.franchise_ownership (user_id, team_id, price_paid) VALUES (v_uid, p_team, cat.price);
  END IF;
  RETURN public.get_franchises();
END;
$$;

REVOKE ALL ON FUNCTION public.buy_franchise(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buy_franchise(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Cycle lifecycle
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_franchise_draft(p_team text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  v_max integer;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);
  IF NOT EXISTS (SELECT 1 FROM public.franchise_ownership WHERE user_id = v_uid AND team_id = p_team) THEN
    RAISE EXCEPTION 'not_owned' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.franchise_cycles WHERE user_id = v_uid AND team_id = p_team AND status <> 'collected'
  ) THEN
    SELECT max_active INTO v_max FROM public.franchise_settings WHERE id;
    IF (SELECT count(*) FROM public.franchise_cycles WHERE user_id = v_uid AND status <> 'collected') >= v_max THEN
      RAISE EXCEPTION 'cycle_limit' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.franchise_cycles (user_id, team_id) VALUES (v_uid, p_team);
  END IF;
  RETURN public.get_franchises();
END;
$$;

REVOKE ALL ON FUNCTION public.start_franchise_draft(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_franchise_draft(text) TO authenticated;

-- Roll the next TEAM/ERA for a draft. A stored spin is returned unchanged (no rerolls, ever).
CREATE OR REPLACE FUNCTION public.franchise_spin(p_cycle uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  c public.franchise_cycles%ROWTYPE;
  v_open text[];
  v_picked text[];
  v_team text;
  v_era text;
BEGIN
  SELECT * INTO c FROM public.franchise_cycles WHERE id = p_cycle AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF c.status <> 'drafting' THEN
    RAISE EXCEPTION 'not_drafting' USING ERRCODE = 'P0001';
  END IF;
  IF c.spin_team IS NOT NULL THEN
    RETURN public.franchise_cycle_json(c);
  END IF;
  IF jsonb_array_length(c.picks) >= 5 THEN
    RAISE EXCEPTION 'lineup_full' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(p ->> 'player_id'), ARRAY[]::text[]) INTO v_picked FROM jsonb_array_elements(c.picks) p;
  SELECT coalesce(array_agg(s), ARRAY[]::text[]) INTO v_open
  FROM unnest(ARRAY['PG', 'SG', 'SF', 'PF', 'C']) s
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.picks) p WHERE p ->> 'slot' = s);

  SELECT pairs.team_id, pairs.era INTO v_team, v_era
  FROM (
    SELECT DISTINCT pool.team_id, pool.era
    FROM public.franchise_player_pool pool
    WHERE pool.eligible && v_open AND NOT (pool.player_id = ANY (v_picked))
  ) pairs
  ORDER BY gen_random_uuid()
  LIMIT 1;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'pool_unavailable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.franchise_cycles
  SET spin_team = v_team, spin_era = v_era, spins = spins + 1
  WHERE id = c.id
  RETURNING * INTO c;
  RETURN public.franchise_cycle_json(c);
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_spin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.franchise_spin(uuid) TO authenticated;

-- Seat one player from the current spin. Same rules as Classic: eligible seats only, 3% off an
-- alternate seat (priced by classic_seat_value).
CREATE OR REPLACE FUNCTION public.franchise_pick(p_cycle uuid, p_player_id text, p_slot text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  c public.franchise_cycles%ROWTYPE;
  pool public.franchise_player_pool%ROWTYPE;
  v_slot text := upper(coalesce(p_slot, ''));
  v_value bigint;
BEGIN
  SELECT * INTO c FROM public.franchise_cycles WHERE id = p_cycle AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF c.status <> 'drafting' THEN
    RAISE EXCEPTION 'not_drafting' USING ERRCODE = 'P0001';
  END IF;
  IF c.spin_team IS NULL THEN
    RAISE EXCEPTION 'no_spin' USING ERRCODE = 'P0001';
  END IF;
  IF v_slot NOT IN ('PG', 'SG', 'SF', 'PF', 'C')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(c.picks) p WHERE p ->> 'slot' = v_slot)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(c.picks) p WHERE p ->> 'player_id' = p_player_id) THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO pool FROM public.franchise_player_pool WHERE player_id = p_player_id;
  IF NOT FOUND OR pool.team_id <> c.spin_team OR pool.era <> c.spin_era OR NOT (v_slot = ANY (pool.eligible)) THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = '22023';
  END IF;

  v_value := public.classic_seat_value(p_player_id, v_slot);
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = '22023';
  END IF;

  UPDATE public.franchise_cycles
  SET picks = picks || jsonb_build_array(jsonb_build_object('slot', v_slot, 'player_id', p_player_id, 'value', v_value)),
      spin_team = NULL,
      spin_era = NULL
  WHERE id = c.id
  RETURNING * INTO c;
  RETURN public.franchise_cycle_json(c);
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_pick(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.franchise_pick(uuid, text, text) TO authenticated;

-- Lock all five and start the clock (server time). The paycheck is fixed here.
CREATE OR REPLACE FUNCTION public.confirm_franchise_lineup(p_cycle uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  c public.franchise_cycles%ROWTYPE;
  v_total bigint;
  v_base bigint;
  v_bonus bigint;
  v_hours integer;
BEGIN
  SELECT * INTO c FROM public.franchise_cycles WHERE id = p_cycle AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF c.status <> 'drafting' THEN
    RETURN public.franchise_cycle_json(c);
  END IF;
  IF jsonb_array_length(c.picks) <> 5 THEN
    RAISE EXCEPTION 'lineup_incomplete' USING ERRCODE = 'P0001';
  END IF;

  SELECT sum(public.classic_seat_value(p ->> 'player_id', p ->> 'slot'))::bigint INTO v_total
  FROM jsonb_array_elements(c.picks) p;
  SELECT base_payout INTO v_base FROM public.franchise_catalog WHERE team_id = c.team_id;
  v_bonus := public.franchise_lineup_bonus(v_total);
  SELECT cycle_hours INTO v_hours FROM public.franchise_settings WHERE id;

  UPDATE public.franchise_cycles
  SET status = 'earning',
      lineup_value = v_total,
      base_payout = v_base,
      bonus = v_bonus,
      payout = v_base + v_bonus,
      locked_at = now(),
      ends_at = now() + make_interval(hours => v_hours)
  WHERE id = c.id
  RETURNING * INTO c;
  RETURN public.franchise_cycle_json(c);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_franchise_lineup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_franchise_lineup(uuid) TO authenticated;

-- Deposit a finished cycle's paycheck exactly once.
CREATE OR REPLACE FUNCTION public.collect_franchise_paycheck(p_cycle uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  c public.franchise_cycles%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.franchise_cycles WHERE id = p_cycle AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF c.status = 'earning' THEN
    IF now() < c.ends_at THEN
      RAISE EXCEPTION 'not_ready' USING ERRCODE = 'P0001';
    END IF;
    PERFORM public.bank_post(v_uid, c.payout, 'franchise_payout', c.id::text,
      jsonb_build_object('team_id', c.team_id, 'cycle_id', c.id, 'lineup_value', c.lineup_value,
        'base_payout', c.base_payout, 'bonus', c.bonus));
    UPDATE public.franchise_cycles SET status = 'collected', collected_at = now() WHERE id = c.id;
  ELSIF c.status = 'drafting' THEN
    RAISE EXCEPTION 'not_ready' USING ERRCODE = 'P0001';
  END IF;
  RETURN public.get_franchises();
END;
$$;

REVOKE ALL ON FUNCTION public.collect_franchise_paycheck(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.collect_franchise_paycheck(uuid) TO authenticated;
