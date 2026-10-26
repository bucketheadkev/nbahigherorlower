-- Franchise Ownership v3: price tiers, fans and hourly paychecks (2026-10-25).
-- Paste after 20261024_3_franchise_v2_ranks.sql, 20261024_4_franchise_seed.sql and 20261025_1_bank_rank.sql.
--
--   * Franchises are bought with Bank Cash at a tier price (Small Market $20M · Established $40M ·
--     Popular $75M · Legendary $125M · Iconic $200M) and owned until sold. One per player.
--   * Selling returns resale_bps of the price paid (75%). Hours already earned are paid with the
--     sale; the rest of the roster's hours are forfeited.
--   * A locked five-player roster earns for exactly cycle_hours (48) by the server clock, also
--     while the app is closed. Each player brings fans = seat value / dollars_per_fan; the roster
--     pays fans / fans_per_dollar_hour dollars for every completed hour. The price paid never
--     changes income, and there is no completion bonus.
--   * Each hour is paid once (ledger key cycle:h<from>-<to>, guarded by hours_paid under a row
--     lock). Nothing accrues after the roster expires. Drafting a new roster first pays any
--     finished roster's unpaid hours, so an expired roster never blocks the next draft.
--   * Rosters locked under v2 keep the terms they were locked with until they finish.
--
-- In-game Cash only. Apply manually in the Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.franchise_settings ADD COLUMN IF NOT EXISTS dollars_per_fan integer NOT NULL DEFAULT 200;
ALTER TABLE public.franchise_settings ADD COLUMN IF NOT EXISTS fans_per_dollar_hour integer NOT NULL DEFAULT 10;
ALTER TABLE public.franchise_settings DROP CONSTRAINT IF EXISTS franchise_settings_v3_check;
ALTER TABLE public.franchise_settings ADD CONSTRAINT franchise_settings_v3_check
  CHECK (dollars_per_fan > 0 AND fans_per_dollar_hour > 0);

ALTER TABLE public.franchise_catalog ADD COLUMN IF NOT EXISTS tier text;
ALTER TABLE public.franchise_cycles ADD COLUMN IF NOT EXISTS fans bigint;

-- BEGIN GENERATED CATALOG (scripts/generate-franchise-seed.ts — do not edit by hand)
INSERT INTO public.franchise_settings (id, cycle_hours, resale_bps, dollars_per_fan, fans_per_dollar_hour)
VALUES (true, 48, 7500, 200, 10)
ON CONFLICT (id) DO UPDATE
  SET cycle_hours = EXCLUDED.cycle_hours,
      resale_bps = EXCLUDED.resale_bps,
      dollars_per_fan = EXCLUDED.dollars_per_fan,
      fans_per_dollar_hour = EXCLUDED.fans_per_dollar_hour;

-- team, name, championships (verified Oct 2026), tier, price, sort
INSERT INTO public.franchise_catalog (team_id, name, championships, tier, price, sort) VALUES
  ('BOS', 'Boston Celtics', 18, 'iconic', 200000000, 1),
  ('LAL', 'Los Angeles Lakers', 17, 'iconic', 200000000, 2),
  ('GSW', 'Golden State Warriors', 7, 'iconic', 200000000, 3),
  ('CHI', 'Chicago Bulls', 6, 'iconic', 200000000, 4),
  ('SAS', 'San Antonio Spurs', 5, 'legendary', 125000000, 5),
  ('DET', 'Detroit Pistons', 3, 'legendary', 125000000, 6),
  ('MIA', 'Miami Heat', 3, 'legendary', 125000000, 7),
  ('NYK', 'New York Knicks', 3, 'legendary', 125000000, 8),
  ('PHI', 'Philadelphia 76ers', 3, 'legendary', 125000000, 9),
  ('HOU', 'Houston Rockets', 2, 'popular', 75000000, 10),
  ('MIL', 'Milwaukee Bucks', 2, 'popular', 75000000, 11),
  ('OKC', 'Oklahoma City Thunder', 2, 'popular', 75000000, 12),
  ('CLE', 'Cleveland Cavaliers', 1, 'popular', 75000000, 13),
  ('DAL', 'Dallas Mavericks', 1, 'popular', 75000000, 14),
  ('DEN', 'Denver Nuggets', 1, 'popular', 75000000, 15),
  ('TOR', 'Toronto Raptors', 1, 'popular', 75000000, 16),
  ('PHX', 'Phoenix Suns', 0, 'popular', 75000000, 17),
  ('ATL', 'Atlanta Hawks', 1, 'established', 40000000, 18),
  ('POR', 'Portland Trail Blazers', 1, 'established', 40000000, 19),
  ('SAC', 'Sacramento Kings', 1, 'established', 40000000, 20),
  ('WAS', 'Washington Wizards', 1, 'established', 40000000, 21),
  ('BKN', 'Brooklyn Nets', 0, 'established', 40000000, 22),
  ('IND', 'Indiana Pacers', 0, 'established', 40000000, 23),
  ('LAC', 'LA Clippers', 0, 'established', 40000000, 24),
  ('ORL', 'Orlando Magic', 0, 'established', 40000000, 25),
  ('UTA', 'Utah Jazz', 0, 'established', 40000000, 26),
  ('CHA', 'Charlotte Hornets', 0, 'small', 20000000, 27),
  ('MEM', 'Memphis Grizzlies', 0, 'small', 20000000, 28),
  ('MIN', 'Minnesota Timberwolves', 0, 'small', 20000000, 29),
  ('NOP', 'New Orleans Pelicans', 0, 'small', 20000000, 30)
ON CONFLICT (team_id) DO UPDATE
  SET name = EXCLUDED.name,
      championships = EXCLUDED.championships,
      tier = EXCLUDED.tier,
      price = EXCLUDED.price,
      sort = EXCLUDED.sort;
-- END GENERATED CATALOG

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.franchise_fans(p_value bigint)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(coalesce(p_value, 0), 0) / s.dollars_per_fan
  FROM public.franchise_settings s
  WHERE s.id;
$$;

REVOKE ALL ON FUNCTION public.franchise_fans(bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.franchise_cycle_json(c public.franchise_cycles)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'team_id', c.team_id,
    'status', CASE
                WHEN c.status = 'earning' AND now() >= c.ends_at THEN 'complete'
                ELSE c.status
              END,
    'picks', c.picks,
    'spin', CASE WHEN c.spin_team IS NULL THEN NULL
                 ELSE jsonb_build_object('team_id', c.spin_team, 'era', c.spin_era) END,
    'spins', c.spins,
    'lineup_value', c.lineup_value,
    'fans', c.fans,
    'price_basis', c.price_basis,
    'cycle_total', c.cycle_total,
    'hourly_rate', c.hourly_rate,
    'hours_total', c.hours_total,
    'hours_earned', public.franchise_hours_earned(c),
    'hours_paid', c.hours_paid,
    'completion_bonus', c.completion_bonus,
    'bonus_earned', public.franchise_bonus_earned(c),
    'bonus_paid', c.bonus_paid,
    'unpaid', CASE WHEN c.status <> 'earning' THEN 0 ELSE
      greatest(public.franchise_hours_earned(c) - c.hours_paid, 0)::bigint * coalesce(c.hourly_rate, 0)
      + CASE WHEN NOT c.bonus_paid AND public.franchise_bonus_earned(c) THEN coalesce(c.completion_bonus, 0) ELSE 0 END
    END,
    'locked_at', c.locked_at,
    'ends_at', c.ends_at
  );
$$;

REVOKE ALL ON FUNCTION public.franchise_cycle_json(public.franchise_cycles) FROM PUBLIC, anon, authenticated;

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
  o public.franchise_ownership%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.franchise_settings WHERE id;
  IF v_uid IS NOT NULL THEN
    SELECT * INTO o FROM public.franchise_ownership WHERE user_id = v_uid;
  END IF;
  RETURN jsonb_build_object(
    'server_time', now(),
    'settings', jsonb_build_object(
      'version', 3,
      'cycle_hours', s.cycle_hours,
      'resale_bps', s.resale_bps,
      'dollars_per_fan', s.dollars_per_fan,
      'fans_per_dollar_hour', s.fans_per_dollar_hour
    ),
    'owned', CASE WHEN o.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'team_id', o.team_id,
      'price_paid', o.price_paid,
      'purchased_at', o.purchased_at,
      'resale_value', o.price_paid * s.resale_bps / 10000
    ) END,
    'cycle', CASE WHEN v_uid IS NULL THEN NULL ELSE (
      SELECT public.franchise_cycle_json(c) FROM public.franchise_cycles c
      WHERE c.user_id = v_uid AND c.status IN ('drafting', 'earning')
      LIMIT 1
    ) END,
    'franchises', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'team_id', cat.team_id,
        'name', cat.name,
        'championships', cat.championships,
        'tier', cat.tier,
        'price', cat.price
      ) ORDER BY cat.sort, cat.team_id)
      FROM public.franchise_catalog cat
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_franchises() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_franchises() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Draft: a finished roster is paid out and closed before the next one starts
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
  o public.franchise_ownership%ROWTYPE;
  c public.franchise_cycles%ROWTYPE;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);
  SELECT * INTO o FROM public.franchise_ownership WHERE user_id = v_uid AND team_id = p_team;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_owned' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.franchise_cycles WHERE user_id = v_uid AND status IN ('drafting', 'earning');
  IF FOUND THEN
    IF c.status = 'drafting' THEN
      RETURN public.get_franchises();
    END IF;
    IF now() < c.ends_at THEN
      RAISE EXCEPTION 'cycle_active' USING ERRCODE = 'P0001';
    END IF;
    PERFORM public.franchise_settle(c.id);
    UPDATE public.franchise_cycles
    SET status = 'collected',
        collected_at = coalesce(collected_at, now()),
        end_reason = coalesce(end_reason, 'completed')
    WHERE id = c.id AND status = 'earning';
  END IF;
  INSERT INTO public.franchise_cycles (user_id, team_id, ownership_id) VALUES (v_uid, p_team, o.id);
  RETURN public.get_franchises();
END;
$$;

REVOKE ALL ON FUNCTION public.start_franchise_draft(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_franchise_draft(text) TO authenticated;

-- Lock all five and start the 48 hours (server time). Fans and the hourly rate are fixed here.
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
  s public.franchise_settings%ROWTYPE;
  v_price bigint;
  v_total bigint;
  v_fans bigint;
  v_hourly bigint;
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
  SELECT price_paid INTO v_price FROM public.franchise_ownership WHERE user_id = v_uid AND team_id = c.team_id;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'not_owned' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO s FROM public.franchise_settings WHERE id;
  SELECT sum(v)::bigint, sum(public.franchise_fans(v))::bigint INTO v_total, v_fans
  FROM (
    SELECT public.classic_seat_value(p ->> 'player_id', p ->> 'slot') AS v
    FROM jsonb_array_elements(c.picks) p
  ) seats;
  v_hourly := v_fans / s.fans_per_dollar_hour;

  UPDATE public.franchise_cycles
  SET status = 'earning',
      lineup_value = v_total,
      fans = v_fans,
      price_basis = v_price,
      payout_bps = NULL,
      cycle_total = v_hourly * s.cycle_hours,
      hourly_rate = v_hourly,
      hours_total = s.cycle_hours,
      completion_bonus = 0,
      payout = v_hourly * s.cycle_hours,
      hours_paid = 0,
      bonus_paid = false,
      locked_at = now(),
      ends_at = now() + make_interval(hours => s.cycle_hours)
  WHERE id = c.id
  RETURNING * INTO c;
  RETURN public.franchise_cycle_json(c);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_franchise_lineup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_franchise_lineup(uuid) TO authenticated;
