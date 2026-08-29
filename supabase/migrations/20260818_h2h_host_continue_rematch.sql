-- 1V1: ensure rematch RPC exists; host-only advance after each position reveal.
-- Run in Supabase SQL Editor on existing projects.

-- ---------------------------------------------------------------------------
-- ack_h2h_rematch (play again)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._mp_reset_h2h_match(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.h2h_picks pk WHERE pk.room_id = p_room_id;

  UPDATE public.h2h_rounds rd
  SET
    matchup_resolved = false,
    matchup_winner = NULL,
    p1_raw_value = NULL,
    p2_raw_value = NULL,
    p1_adjusted_value = NULL,
    p2_adjusted_value = NULL,
    p1_total = NULL,
    p2_total = NULL,
    p1_selection = NULL,
    p2_selection = NULL,
    resolved_at = NULL
  WHERE rd.room_id = p_room_id;

  UPDATE public.h2h_matches m
  SET
    current_position = 'PG',
    phase = 'selecting',
    p1_total = 0,
    p2_total = 0,
    p1_continue = false,
    p2_continue = false,
    p1_rematch = false,
    p2_rematch = false,
    updated_at = now()
  WHERE m.room_id = p_room_id;

  UPDATE public.rooms r
  SET status = 'playing'
  WHERE r.id = p_room_id AND r.status = 'finished';
END;
$$;

CREATE OR REPLACE FUNCTION public.ack_h2h_rematch(room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := ack_h2h_rematch.room_id;
  match_row public.h2h_matches%ROWTYPE;
  me_is_p1 boolean;
  both_ready boolean;
BEGIN
  SELECT * INTO match_row
  FROM public.h2h_matches m
  WHERE m.room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF uid IS DISTINCT FROM match_row.p1_user_id AND uid IS DISTINCT FROM match_row.p2_user_id THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  IF match_row.phase IS DISTINCT FROM 'finished' THEN
    RAISE EXCEPTION 'WRONG_PHASE' USING ERRCODE = 'P0001';
  END IF;

  me_is_p1 := uid = match_row.p1_user_id;

  IF me_is_p1 THEN
    UPDATE public.h2h_matches m
    SET p1_rematch = true, updated_at = now()
    WHERE m.room_id = match_row.room_id;
  ELSE
    UPDATE public.h2h_matches m
    SET p2_rematch = true, updated_at = now()
    WHERE m.room_id = match_row.room_id;
  END IF;

  SELECT (m.p1_rematch AND m.p2_rematch) INTO both_ready
  FROM public.h2h_matches m
  WHERE m.room_id = match_row.room_id;

  IF NOT both_ready THEN
    RETURN jsonb_build_object('ok', true, 'waiting', true);
  END IF;

  PERFORM public._mp_reset_h2h_match(match_row.room_id);

  RETURN jsonb_build_object('ok', true, 'rematched', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- ack_h2h_continue — only host (player 1) advances; no guest ack required
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ack_h2h_continue(room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := ack_h2h_continue.room_id;
  match_row public.h2h_matches%ROWTYPE;
  next_pos text;
  order_arr text[] := ARRAY['PG', 'SG', 'SF', 'PF', 'C'];
  idx integer;
BEGIN
  SELECT * INTO match_row
  FROM public.h2h_matches m
  WHERE m.room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF uid IS DISTINCT FROM match_row.p1_user_id THEN
    RAISE EXCEPTION 'NOT_HOST' USING ERRCODE = 'P0001';
  END IF;

  IF match_row.phase IS DISTINCT FROM 'reveal' THEN
    RAISE EXCEPTION 'WRONG_PHASE' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.h2h_rounds rd
    WHERE rd.room_id = match_row.room_id
      AND rd.player_position = match_row.current_position
      AND rd.matchup_resolved
  ) THEN
    RAISE EXCEPTION 'ROUND_NOT_RESOLVED' USING ERRCODE = 'P0001';
  END IF;

  idx := array_position(order_arr, match_row.current_position);
  IF idx IS NULL OR idx >= 5 THEN
    UPDATE public.h2h_matches m
    SET phase = 'finished', updated_at = now()
    WHERE m.room_id = match_row.room_id;

    UPDATE public.rooms r
    SET status = 'finished'
    WHERE r.id = match_row.room_id AND r.status = 'playing';

    RETURN jsonb_build_object('ok', true, 'finished', true);
  END IF;

  next_pos := order_arr[idx + 1];

  UPDATE public.h2h_matches m
  SET
    current_position = next_pos,
    phase = 'selecting',
    p1_continue = false,
    p2_continue = false,
    updated_at = now()
  WHERE m.room_id = match_row.room_id;

  RETURN jsonb_build_object('ok', true, 'advanced', true, 'position', next_pos);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ack_h2h_rematch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ack_h2h_continue(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.ack_h2h_rematch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ack_h2h_continue(uuid) FROM PUBLIC;
