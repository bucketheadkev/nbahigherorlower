-- 1V1 rematch repair: host-only play-again, reset via init_h2h_match fallback.
-- Run in Supabase SQL Editor if play-again fails with missing ack_h2h_rematch.

ALTER TABLE public.h2h_matches
  ADD COLUMN IF NOT EXISTS p1_rematch boolean NOT NULL DEFAULT false;

ALTER TABLE public.h2h_matches
  ADD COLUMN IF NOT EXISTS p2_rematch boolean NOT NULL DEFAULT false;

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
  WHERE r.id = p_room_id;
END;
$$;

-- init_h2h_match: also resets finished matches (fallback when ack_h2h_rematch is missing)
CREATE OR REPLACE FUNCTION public.init_h2h_match(room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := init_h2h_match.room_id;
  target public.rooms%ROWTYPE;
  match_row public.h2h_matches%ROWTYPE;
  host_id uuid;
  guest_id uuid;
  slot text;
BEGIN
  SELECT * INTO target FROM public.rooms r WHERE r.id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_room_member(target.id) THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO match_row FROM public.h2h_matches m WHERE m.room_id = target.id;
  IF FOUND AND (
    match_row.phase = 'finished'
    OR target.status = 'finished'
  ) THEN
    PERFORM public._mp_reset_h2h_match(target.id);
    SELECT * INTO target FROM public.rooms r WHERE r.id = p_room_id;
    RETURN jsonb_build_object('ok', true, 'room_id', target.id, 'rematched', true, 'caller', uid);
  END IF;

  SELECT rp.user_id INTO host_id
  FROM public.room_players rp
  WHERE rp.room_id = target.id AND rp.player_number = 1;

  SELECT rp.user_id INTO guest_id
  FROM public.room_players rp
  WHERE rp.room_id = target.id AND rp.player_number = 2;

  IF host_id IS NULL OR guest_id IS NULL THEN
    RAISE EXCEPTION 'NEED_TWO_PLAYERS' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.h2h_matches AS m (
    room_id, p1_user_id, p2_user_id, current_position, phase
  )
  VALUES (target.id, host_id, guest_id, 'PG', 'selecting')
  ON CONFLICT ON CONSTRAINT h2h_matches_pkey DO NOTHING;

  FOREACH slot IN ARRAY ARRAY['PG', 'SG', 'SF', 'PF', 'C'] LOOP
    INSERT INTO public.h2h_rounds AS rd (room_id, player_position)
    VALUES (target.id, slot)
    ON CONFLICT ON CONSTRAINT h2h_rounds_pk DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'room_id', target.id, 'caller', uid);
END;
$$;

-- Host-only play again — resets immediately, guest syncs via polling/realtime.
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

  IF match_row.phase IS DISTINCT FROM 'finished' THEN
    RAISE EXCEPTION 'WRONG_PHASE' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public._mp_reset_h2h_match(match_row.room_id);

  RETURN jsonb_build_object('ok', true, 'rematched', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ack_h2h_rematch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.init_h2h_match(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.ack_h2h_rematch(uuid) FROM PUBLIC;
