-- Live fix for [leaderboard] submit failed | unknown_player (22023).
-- The deployed submit function looked players up through a security-invoker helper,
-- which can miss rows the client can already read. This reads the seat table directly.
-- Also adds 2020s Raptors Kawhi Leonard, who is on the roster but not in the seat catalog.
--
-- Paste into Supabase → SQL Editor and run once.

CREATE OR REPLACE FUNCTION public.classic_seat_value(p_player_id text, p_slot text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
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

CREATE OR REPLACE FUNCTION public.submit_classic_leaderboard_lineup(
  p_lineup jsonb,
  p_client_run_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
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

    SELECT CASE v_slot
      WHEN 'PG' THEN v.value_pg
      WHEN 'SG' THEN v.value_sg
      WHEN 'SF' THEN v.value_sf
      WHEN 'PF' THEN v.value_pf
      WHEN 'C' THEN v.value_c
      ELSE NULL
    END
    INTO v_value
    FROM public.classic_player_seat_values v
    WHERE v.player_id = v_player_id;

    IF v_value IS NULL THEN
      RAISE EXCEPTION 'unknown_player:%:%', v_player_id, v_slot USING ERRCODE = '22023';
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

INSERT INTO public.classic_player_seat_values (
  player_id, primary_position, value_pg, value_sg, value_sf, value_pf, value_c
) VALUES
  ('hist_2020s_TOR_kawhi_leonard', 'SF', 193000000, 193000000, 199000000, 193000000, 193000000)
ON CONFLICT (player_id) DO UPDATE
  SET primary_position = EXCLUDED.primary_position,
      value_pg = EXCLUDED.value_pg,
      value_sg = EXCLUDED.value_sg,
      value_sf = EXCLUDED.value_sf,
      value_pf = EXCLUDED.value_pf,
      value_c = EXCLUDED.value_c;
