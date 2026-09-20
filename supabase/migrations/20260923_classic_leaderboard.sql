-- Classic World leaderboard: verified scores + public RPCs (additive).
-- Does NOT make user_classic_progress / user_classic_runs public.
-- Does NOT store email. Private progress tables stay owner-only.
--
-- Apply manually via Supabase SQL Editor:
--   1) This file
--   2) 20260924_classic_player_seat_values_seed.sql
--
-- Score security: clients submit lineup player_ids + seats only.
-- Server looks up seat values from classic_player_seat_values and computes the total.

-- ---------------------------------------------------------------------------
-- Authoritative seat prices (seeded by 20260924_*.sql)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.classic_player_seat_values (
  player_id text PRIMARY KEY,
  primary_position text NOT NULL
    CHECK (primary_position IN ('PG', 'SG', 'SF', 'PF', 'C')),
  value_pg bigint NOT NULL CHECK (value_pg >= 0),
  value_sg bigint NOT NULL CHECK (value_sg >= 0),
  value_sf bigint NOT NULL CHECK (value_sf >= 0),
  value_pf bigint NOT NULL CHECK (value_pf >= 0),
  value_c bigint NOT NULL CHECK (value_c >= 0)
);

COMMENT ON TABLE public.classic_player_seat_values IS
  'Authoritative Classic seat values for leaderboard verification. Generated from game valuation.';

ALTER TABLE public.classic_player_seat_values ENABLE ROW LEVEL SECURITY;

-- Readable so clients can optionally sanity-check; writes only via migration/service.
DROP POLICY IF EXISTS classic_player_seat_values_select ON public.classic_player_seat_values;
CREATE POLICY classic_player_seat_values_select
  ON public.classic_player_seat_values
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.classic_player_seat_values FROM PUBLIC;
GRANT SELECT ON TABLE public.classic_player_seat_values TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verified runs (preserve individual completed lineups for future boards)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_leaderboard_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  verified_value bigint NOT NULL CHECK (verified_value >= 0),
  -- [{ "player_id": "hist_…", "slot": "PG" }, …] exactly 5 seats
  lineup jsonb NOT NULL,
  client_run_id text,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_leaderboard_runs_lineup_is_array
    CHECK (jsonb_typeof(lineup) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS user_leaderboard_runs_user_client_uidx
  ON public.user_leaderboard_runs (user_id, client_run_id)
  WHERE client_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_leaderboard_runs_user_achieved_idx
  ON public.user_leaderboard_runs (user_id, achieved_at DESC);

COMMENT ON TABLE public.user_leaderboard_runs IS
  'Server-verified Classic lineups. Private to owner; used to update public PB.';

ALTER TABLE public.user_leaderboard_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_leaderboard_runs_select_own ON public.user_leaderboard_runs;
CREATE POLICY user_leaderboard_runs_select_own
  ON public.user_leaderboard_runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE for clients — only SECURITY DEFINER RPC.

REVOKE ALL ON TABLE public.user_leaderboard_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.user_leaderboard_runs FROM anon;
GRANT SELECT ON TABLE public.user_leaderboard_runs TO authenticated;

-- ---------------------------------------------------------------------------
-- Verified personal best (public ranking source — not client-writable)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_leaderboard_pb (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  verified_best bigint NOT NULL CHECK (verified_best >= 0),
  best_run_id uuid REFERENCES public.user_leaderboard_runs (id) ON DELETE SET NULL,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_leaderboard_pb_rank_idx
  ON public.user_leaderboard_pb (verified_best DESC, achieved_at ASC, user_id ASC);

COMMENT ON TABLE public.user_leaderboard_pb IS
  'Server-verified Classic PB for World leaderboard. Updated only by submit RPC.';

ALTER TABLE public.user_leaderboard_pb ENABLE ROW LEVEL SECURITY;

-- No direct client SELECT — public data only via get_classic_leaderboard_top / get_my_classic_leaderboard_rank.
-- Prevents scraping user_id from the ranking table.

REVOKE ALL ON TABLE public.user_leaderboard_pb FROM PUBLIC;
REVOKE ALL ON TABLE public.user_leaderboard_pb FROM anon;
REVOKE ALL ON TABLE public.user_leaderboard_pb FROM authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.classic_seat_value(p_player_id text, p_slot text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE upper(p_slot)
    WHEN 'PG' THEN v.value_pg
    WHEN 'SG' THEN v.value_sg
    WHEN 'SF' THEN v.value_sf
    WHEN 'PF' THEN v.value_pf
    WHEN 'C' THEN v.value_c
    ELSE NULL
  END
  FROM public.classic_player_seat_values v
  WHERE v.player_id = p_player_id;
$$;

REVOKE ALL ON FUNCTION public.classic_seat_value(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classic_seat_value(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_permanent_profile_user(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = p_uid
  )
  AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

REVOKE ALL ON FUNCTION public.is_permanent_profile_user(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Submit verified lineup (SECURITY DEFINER — computes value server-side)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_classic_leaderboard_lineup(
  p_lineup jsonb,
  p_client_run_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_slot text;
  v_player_id text;
  v_value bigint;
  v_total bigint := 0;
  v_seen_slots text[] := ARRAY[]::text[];
  v_seen_players text[] := ARRAY[]::text[];
  v_run_id uuid;
  v_prev_best bigint;
  v_is_new_best boolean := false;
  v_achieved_at timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = v_uid) THEN
    RAISE EXCEPTION 'profile_required' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_lineup) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lineup) <> 5 THEN
    RAISE EXCEPTION 'invalid_lineup' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_lineup)
  LOOP
    v_player_id := v_item ->> 'player_id';
    v_slot := upper(coalesce(v_item ->> 'slot', ''));

    IF v_player_id IS NULL OR length(v_player_id) < 8 THEN
      RAISE EXCEPTION 'invalid_player' USING ERRCODE = '22023';
    END IF;
    IF v_slot NOT IN ('PG', 'SG', 'SF', 'PF', 'C') THEN
      RAISE EXCEPTION 'invalid_slot' USING ERRCODE = '22023';
    END IF;
    IF v_slot = ANY (v_seen_slots) THEN
      RAISE EXCEPTION 'duplicate_slot' USING ERRCODE = '22023';
    END IF;
    IF v_player_id = ANY (v_seen_players) THEN
      RAISE EXCEPTION 'duplicate_player' USING ERRCODE = '22023';
    END IF;

    v_value := public.classic_seat_value(v_player_id, v_slot);
    IF v_value IS NULL THEN
      RAISE EXCEPTION 'unknown_player' USING ERRCODE = '22023';
    END IF;

    v_seen_slots := array_append(v_seen_slots, v_slot);
    v_seen_players := array_append(v_seen_players, v_player_id);
    v_total := v_total + v_value;
  END LOOP;

  IF array_length(v_seen_slots, 1) <> 5 THEN
    RAISE EXCEPTION 'invalid_lineup' USING ERRCODE = '22023';
  END IF;

  -- Idempotent client run id (optional)
  IF p_client_run_id IS NOT NULL AND length(trim(p_client_run_id)) > 0 THEN
    SELECT id, verified_value INTO v_run_id, v_value
    FROM public.user_leaderboard_runs
    WHERE user_id = v_uid AND client_run_id = p_client_run_id;
    IF FOUND THEN
      SELECT verified_best INTO v_prev_best
      FROM public.user_leaderboard_pb WHERE user_id = v_uid;
      RETURN jsonb_build_object(
        'ok', true,
        'verified_value', v_value,
        'is_new_best', false,
        'run_id', v_run_id,
        'verified_best', coalesce(v_prev_best, 0)
      );
    END IF;
  END IF;

  INSERT INTO public.user_leaderboard_runs (user_id, verified_value, lineup, client_run_id, achieved_at)
  VALUES (
    v_uid,
    v_total,
    p_lineup,
    NULLIF(trim(coalesce(p_client_run_id, '')), ''),
    v_achieved_at
  )
  RETURNING id INTO v_run_id;

  SELECT verified_best INTO v_prev_best
  FROM public.user_leaderboard_pb
  WHERE user_id = v_uid;

  IF v_prev_best IS NULL OR v_total > v_prev_best THEN
    v_is_new_best := true;
    INSERT INTO public.user_leaderboard_pb (user_id, verified_best, best_run_id, achieved_at, updated_at)
    VALUES (v_uid, v_total, v_run_id, v_achieved_at, v_achieved_at)
    ON CONFLICT (user_id) DO UPDATE
      SET verified_best = EXCLUDED.verified_best,
          best_run_id = EXCLUDED.best_run_id,
          achieved_at = EXCLUDED.achieved_at,
          updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'verified_value', v_total,
    'is_new_best', v_is_new_best,
    'run_id', v_run_id,
    'verified_best', CASE
      WHEN v_is_new_best THEN v_total
      ELSE coalesce(v_prev_best, 0)
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_classic_leaderboard_lineup(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_classic_leaderboard_lineup(jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public Top N (username + verified PB only)
-- Tie-break: higher PB first; earlier achieved_at wins; then user_id
-- Rank = ROW_NUMBER for unique deterministic places
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_classic_leaderboard_top(p_limit integer DEFAULT 100)
RETURNS TABLE (
  rank bigint,
  username text,
  verified_best bigint,
  achieved_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    row_number() OVER (
      ORDER BY lb.verified_best DESC, lb.achieved_at ASC, lb.user_id ASC
    ) AS rank,
    p.username,
    lb.verified_best,
    lb.achieved_at
  FROM public.user_leaderboard_pb lb
  INNER JOIN public.profiles p ON p.user_id = lb.user_id
  WHERE lb.verified_best > 0
  ORDER BY lb.verified_best DESC, lb.achieved_at ASC, lb.user_id ASC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 100), 200));
$$;

REVOKE ALL ON FUNCTION public.get_classic_leaderboard_top(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_classic_leaderboard_top(integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Current user's rank (permanent accounts only; empty if none)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_classic_leaderboard_rank()
RETURNS TABLE (
  rank bigint,
  username text,
  verified_best bigint,
  achieved_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_best bigint;
  v_at timestamptz;
  v_username text;
  v_rank bigint;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RETURN;
  END IF;

  SELECT lb.verified_best, lb.achieved_at, p.username
  INTO v_best, v_at, v_username
  FROM public.user_leaderboard_pb lb
  INNER JOIN public.profiles p ON p.user_id = lb.user_id
  WHERE lb.user_id = v_uid AND lb.verified_best > 0;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Count players strictly ahead (same tie order as top-N). Uses rank index.
  SELECT 1 + count(*)::bigint INTO v_rank
  FROM public.user_leaderboard_pb other
  INNER JOIN public.profiles op ON op.user_id = other.user_id
  WHERE other.verified_best > 0
    AND (
      other.verified_best > v_best
      OR (other.verified_best = v_best AND other.achieved_at < v_at)
      OR (
        other.verified_best = v_best
        AND other.achieved_at = v_at
        AND other.user_id < v_uid
      )
    );

  rank := v_rank;
  username := v_username;
  verified_best := v_best;
  achieved_at := v_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_classic_leaderboard_rank() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_classic_leaderboard_rank() TO authenticated;
