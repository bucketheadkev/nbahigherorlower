-- Bet on Yourself: multi-wager slips (1–3 wagers per Classic Run). Requires
-- 20261017_1_bank_ledger.sql and 20260927_classic_seat_lookup.sql. Replaces the single fixed
-- Cash Table bet (20261017_3_cash_table.sql), which is retired below.
--
-- Flow
--   place_wager_slip(run, picks)   at the first spin: validates 1–3 distinct wagers and stakes,
--                                  debits the total stake once ('cash_table_wager', slip id).
--   settle_wager_slip(run, ...)    after that run's verified submit: judges every wager from the
--                                  server-priced lineup and credits the total return once
--                                  ('cash_table_payout', slip id). Repeat calls return the stored result.
--   A slip whose run never lands is forfeited when the player locks a new slip (or after 6 hours).
--
-- Rules mirror lib/tradeup/wagers.ts. Seat values come from classic_seat_value(); team value is
-- the run's verified_value. Trust note: draft order (Clutch Pick) and rerolls (No Rerolls) are
-- reported by the client — the server checks the fifth pick is in the lineup but cannot see spins.
--
-- All Cash is fictional in-game currency. Apply manually in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Catalog (single source on the server; keep in step with lib/tradeup/wagers.ts)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wager_catalog (
  id text PRIMARY KEY,
  multiplier_x100 integer NOT NULL CHECK (multiplier_x100 > 100),
  max_stake bigint NOT NULL CHECK (max_stake > 0)
);

INSERT INTO public.wager_catalog (id, multiplier_x100, max_stake) VALUES
  ('billion_or_bust', 2000, 2500000),
  ('star_hunter', 115, 5000000),
  ('dynamic_duo', 105, 5000000),
  ('no_rerolls', 160, 5000000),
  ('clutch_pick', 270, 5000000),
  ('superteam', 145, 5000000),
  ('triple_threat', 105, 5000000),
  ('high_roller', 4000, 1000000)
ON CONFLICT (id) DO UPDATE
SET multiplier_x100 = EXCLUDED.multiplier_x100, max_stake = EXCLUDED.max_stake;

ALTER TABLE public.wager_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wager_catalog FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Slips
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wager_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_run_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'forfeited')),
  total_stake bigint NOT NULL CHECK (total_stake > 0),
  total_return bigint NOT NULL DEFAULT 0 CHECK (total_return >= 0),
  run_id uuid REFERENCES public.user_leaderboard_runs (id) ON DELETE SET NULL,
  placed_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (user_id, client_run_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS wager_slips_one_open_uidx ON public.wager_slips (user_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.wager_slip_items (
  slip_id uuid NOT NULL REFERENCES public.wager_slips (id) ON DELETE CASCADE,
  wager_id text NOT NULL REFERENCES public.wager_catalog (id),
  stake bigint NOT NULL CHECK (stake > 0),
  multiplier_x100 integer NOT NULL,
  won boolean,
  returned bigint NOT NULL DEFAULT 0 CHECK (returned >= 0),
  PRIMARY KEY (slip_id, wager_id)
);

ALTER TABLE public.wager_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wager_slip_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wager_slips, public.wager_slip_items FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wager_wins(
  p_wager text,
  p_total bigint,
  p_values bigint[],
  p_fifth bigint,
  p_rerolls_used boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_wager
    WHEN 'billion_or_bust' THEN p_total >= 1000000000
    WHEN 'high_roller' THEN p_total >= 1010000000
    WHEN 'star_hunter' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 200000000) >= 1
    WHEN 'dynamic_duo' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 190000000) >= 2
    WHEN 'triple_threat' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 185000000) >= 3
    WHEN 'superteam' THEN cardinality(p_values) = 5
      AND (SELECT count(*) FROM unnest(p_values) v WHERE v >= 170000000) = 5
    WHEN 'clutch_pick' THEN coalesce(p_fifth, 0) >= 190000000
    WHEN 'no_rerolls' THEN NOT coalesce(p_rerolls_used, true) AND p_total >= 900000000
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.wager_wins(text, bigint, bigint[], bigint, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.wager_slip_json(p_slip uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT jsonb_build_object(
    'slip_id', s.id,
    'client_run_id', s.client_run_id,
    'status', s.status,
    'total_stake', s.total_stake,
    'total_return', s.total_return,
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', i.wager_id, 'stake', i.stake,
        'multiplier_x100', i.multiplier_x100, 'won', i.won, 'returned', i.returned) ORDER BY i.wager_id)
      FROM public.wager_slip_items i WHERE i.slip_id = s.id
    ), '[]'::jsonb)
  )
  FROM public.wager_slips s WHERE s.id = p_slip;
$$;

REVOKE ALL ON FUNCTION public.wager_slip_json(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

-- p_picks: [{ "id": "star_hunter", "stake": 500000 }, ...]
CREATE OR REPLACE FUNCTION public.place_wager_slip(p_client_run_id text, p_picks jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slip uuid;
  v_total bigint := 0;
  v_count integer;
  p record;
  c public.wager_catalog%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(length(trim(p_client_run_id)), 0) = 0 THEN
    RAISE EXCEPTION 'invalid_run' USING ERRCODE = '22023';
  END IF;

  -- Idempotent: the same run returns the slip already placed.
  SELECT id INTO v_slip FROM public.wager_slips WHERE user_id = v_uid AND client_run_id = p_client_run_id;
  IF v_slip IS NOT NULL THEN
    RETURN public.wager_slip_json(v_slip);
  END IF;

  IF jsonb_typeof(p_picks) <> 'array' THEN
    RAISE EXCEPTION 'invalid_slip' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_picks);
  IF v_count < 1 OR v_count > 3
     OR (SELECT count(DISTINCT x ->> 'id') FROM jsonb_array_elements(p_picks) x) <> v_count THEN
    RAISE EXCEPTION 'invalid_slip' USING ERRCODE = '22023';
  END IF;

  -- Any earlier slip whose run never landed is forfeited (its stake was already taken).
  UPDATE public.wager_slips SET status = 'forfeited', settled_at = now()
  WHERE user_id = v_uid AND status = 'open';

  FOR p IN SELECT x ->> 'id' AS id, (x ->> 'stake')::bigint AS stake FROM jsonb_array_elements(p_picks) x LOOP
    SELECT * INTO c FROM public.wager_catalog WHERE id = p.id;
    IF NOT FOUND OR p.stake IS NULL OR p.stake NOT IN (100000, 250000, 500000, 1000000, 2500000, 5000000)
       OR p.stake > c.max_stake THEN
      RAISE EXCEPTION 'invalid_slip' USING ERRCODE = '22023';
    END IF;
    v_total := v_total + p.stake;
  END LOOP;

  INSERT INTO public.wager_slips (user_id, client_run_id, total_stake)
  VALUES (v_uid, p_client_run_id, v_total)
  RETURNING id INTO v_slip;

  INSERT INTO public.wager_slip_items (slip_id, wager_id, stake, multiplier_x100)
  SELECT v_slip, x ->> 'id', (x ->> 'stake')::bigint, wc.multiplier_x100
  FROM jsonb_array_elements(p_picks) x
  INNER JOIN public.wager_catalog wc ON wc.id = x ->> 'id';

  -- Raises insufficient_funds (rolling everything back) when the Bank is short.
  PERFORM public.bank_post(v_uid, -v_total, 'cash_table_wager', v_slip::text,
    jsonb_build_object('slip_id', v_slip, 'client_run_id', p_client_run_id));

  RETURN public.wager_slip_json(v_slip);
END;
$$;

REVOKE ALL ON FUNCTION public.place_wager_slip(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_wager_slip(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.settle_wager_slip(
  p_client_run_id text,
  p_fifth_player_id text,
  p_rerolls_used boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  s public.wager_slips%ROWTYPE;
  r public.user_leaderboard_runs%ROWTYPE;
  v_values bigint[];
  v_fifth bigint;
  v_return bigint := 0;
  i record;
  v_won boolean;
  v_paid bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO s FROM public.wager_slips
  WHERE user_id = v_uid AND client_run_id = p_client_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  IF s.status <> 'open' THEN
    RETURN public.wager_slip_json(s.id);
  END IF;
  IF s.placed_at < now() - interval '6 hours' THEN
    UPDATE public.wager_slips SET status = 'forfeited', settled_at = now() WHERE id = s.id;
    RETURN public.wager_slip_json(s.id);
  END IF;

  SELECT * INTO r FROM public.user_leaderboard_runs
  WHERE user_id = v_uid AND client_run_id = p_client_run_id AND achieved_at >= s.placed_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT array_agg(public.classic_seat_value(seat ->> 'player_id', seat ->> 'slot'))
  INTO v_values
  FROM jsonb_array_elements(r.lineup) seat;

  SELECT public.classic_seat_value(seat ->> 'player_id', seat ->> 'slot')
  INTO v_fifth
  FROM jsonb_array_elements(r.lineup) seat
  WHERE seat ->> 'player_id' = p_fifth_player_id;

  FOR i IN SELECT * FROM public.wager_slip_items WHERE slip_id = s.id LOOP
    v_won := public.wager_wins(i.wager_id, r.verified_value, v_values, v_fifth, p_rerolls_used);
    v_paid := CASE WHEN v_won THEN (i.stake * i.multiplier_x100) / 100 ELSE 0 END;
    UPDATE public.wager_slip_items SET won = v_won, returned = v_paid
    WHERE slip_id = s.id AND wager_id = i.wager_id;
    v_return := v_return + v_paid;
  END LOOP;

  UPDATE public.wager_slips
  SET status = 'settled', total_return = v_return, run_id = r.id, settled_at = now()
  WHERE id = s.id;

  IF v_return > 0 THEN
    PERFORM public.bank_post(v_uid, v_return, 'cash_table_payout', s.id::text,
      jsonb_build_object('slip_id', s.id, 'run_id', r.id));
  END IF;

  RETURN public.wager_slip_json(s.id);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_wager_slip(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_wager_slip(text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Retire the single fixed Cash Table bet (if 20261017_3 was applied)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  w record;
BEGIN
  IF to_regclass('public.cash_table_wagers') IS NULL THEN
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS cash_table_settle_on_run_trg ON public.user_leaderboard_runs;
  ALTER TABLE public.cash_table_wagers DROP CONSTRAINT IF EXISTS cash_table_wagers_status_check;
  ALTER TABLE public.cash_table_wagers
    ADD CONSTRAINT cash_table_wagers_status_check CHECK (status IN ('open', 'won', 'lost', 'refunded'));

  -- Open old bets get their stake back once.
  FOR w IN SELECT id, user_id, stake FROM public.cash_table_wagers WHERE status = 'open' LOOP
    PERFORM public.bank_post(w.user_id, w.stake, 'cash_table_refund', w.id::text,
      jsonb_build_object('wager_id', w.id, 'reason', 'retired'));
    UPDATE public.cash_table_wagers SET status = 'refunded', settled_at = now() WHERE id = w.id;
  END LOOP;

  REVOKE EXECUTE ON FUNCTION public.place_cash_table_wager() FROM authenticated;
END;
$$;
