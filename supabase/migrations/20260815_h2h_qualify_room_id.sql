-- Repair: qualify/rename identifiers so PL/pgSQL does not treat
-- function parameters as colliding with table columns (42702 ambiguous room_id).
-- Safe to run after 20260814_h2h_position_match.sql. CREATE OR REPLACE only.
-- PostgREST argument names stay room_id / player_position / selection / raw_value
-- so the already-built client does not need a rebuild.

-- ---------------------------------------------------------------------------
-- init_h2h_match — called from start_room (START GAME)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- lock_h2h_pick
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lock_h2h_pick(
  room_id uuid,
  player_position text,
  selection jsonb,
  raw_value bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := lock_h2h_pick.room_id;
  p_selection jsonb := lock_h2h_pick.selection;
  p_raw_value bigint := lock_h2h_pick.raw_value;
  target public.rooms%ROWTYPE;
  match_row public.h2h_matches%ROWTYPE;
  me public.room_players%ROWTYPE;
  pick_count integer;
  p1 public.h2h_picks%ROWTYPE;
  p2 public.h2h_picks%ROWTYPE;
  winner text;
  penalty bigint;
  p1_adj bigint;
  p2_adj bigint;
  next_p1_total bigint;
  next_p2_total bigint;
  sel_pos text;
  slot text := lock_h2h_pick.player_position;
BEGIN
  IF p_room_id IS NULL OR slot IS NULL THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF slot NOT IN ('PG', 'SG', 'SF', 'PF', 'C') THEN
    RAISE EXCEPTION 'INVALID_POSITION' USING ERRCODE = 'P0001';
  END IF;

  IF p_selection IS NULL OR jsonb_typeof(p_selection) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_SELECTION' USING ERRCODE = 'P0001';
  END IF;

  IF p_raw_value IS NULL OR p_raw_value < 0 THEN
    RAISE EXCEPTION 'INVALID_TOTAL' USING ERRCODE = 'P0001';
  END IF;

  sel_pos := upper(btrim(coalesce(p_selection->>'position', '')));
  IF sel_pos IS DISTINCT FROM slot THEN
    RAISE EXCEPTION 'INVALID_POSITION' USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(btrim(p_selection->>'name'), '') = '' THEN
    RAISE EXCEPTION 'INVALID_SELECTION' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO target FROM public.rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF target.status IS DISTINCT FROM 'playing' THEN
    RAISE EXCEPTION 'ROOM_NOT_PLAYING' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO me
  FROM public.room_players rp
  WHERE rp.room_id = target.id AND rp.user_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO match_row
  FROM public.h2h_matches m
  WHERE m.room_id = target.id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.init_h2h_match(target.id);
    SELECT * INTO match_row FROM public.h2h_matches m WHERE m.room_id = target.id FOR UPDATE;
  END IF;

  IF match_row.phase IS DISTINCT FROM 'selecting' THEN
    RAISE EXCEPTION 'WRONG_PHASE' USING ERRCODE = 'P0001';
  END IF;

  IF match_row.current_position IS DISTINCT FROM slot THEN
    RAISE EXCEPTION 'WRONG_POSITION' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.h2h_picks AS pk (
    room_id, player_position, user_id, player_number, selection, raw_value
  )
  VALUES (
    target.id,
    slot,
    uid,
    me.player_number,
    p_selection,
    p_raw_value
  )
  ON CONFLICT ON CONSTRAINT h2h_picks_room_pos_user_uidx DO NOTHING;

  GET DIAGNOSTICS pick_count = ROW_COUNT;
  IF pick_count = 0 THEN
    RAISE EXCEPTION 'ALREADY_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer INTO pick_count
  FROM public.h2h_picks pk
  WHERE pk.room_id = target.id AND pk.player_position = slot;

  IF pick_count < 2 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'locked', true,
      'waiting', true,
      'position', slot
    );
  END IF;

  PERFORM 1
  FROM public.h2h_rounds rd
  WHERE rd.room_id = target.id AND rd.player_position = slot
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.h2h_rounds rd
    WHERE rd.room_id = target.id AND rd.player_position = slot AND rd.matchup_resolved
  ) THEN
    RETURN jsonb_build_object('ok', true, 'locked', true, 'resolved', true, 'position', slot);
  END IF;

  SELECT * INTO p1
  FROM public.h2h_picks pk
  WHERE pk.room_id = target.id AND pk.player_position = slot AND pk.player_number = 1;

  SELECT * INTO p2
  FROM public.h2h_picks pk
  WHERE pk.room_id = target.id AND pk.player_position = slot AND pk.player_number = 2;

  IF p1.id IS NULL OR p2.id IS NULL THEN
    RAISE EXCEPTION 'NEED_TWO_PLAYERS' USING ERRCODE = 'P0001';
  END IF;

  IF p1.raw_value > p2.raw_value THEN
    winner := 'p1';
    penalty := public.calculate_head_to_head_penalty(p1.raw_value, p2.raw_value);
    p1_adj := p1.raw_value;
    p2_adj := GREATEST(0, p2.raw_value - penalty);
  ELSIF p2.raw_value > p1.raw_value THEN
    winner := 'p2';
    penalty := public.calculate_head_to_head_penalty(p2.raw_value, p1.raw_value);
    p2_adj := p2.raw_value;
    p1_adj := GREATEST(0, p1.raw_value - penalty);
  ELSE
    winner := 'tie';
    p1_adj := p1.raw_value;
    p2_adj := p2.raw_value;
  END IF;

  next_p1_total := match_row.p1_total + p1_adj;
  next_p2_total := match_row.p2_total + p2_adj;

  UPDATE public.h2h_rounds rd
  SET
    matchup_resolved = true,
    matchup_winner = winner,
    p1_raw_value = p1.raw_value,
    p2_raw_value = p2.raw_value,
    p1_adjusted_value = p1_adj,
    p2_adjusted_value = p2_adj,
    p1_total = next_p1_total,
    p2_total = next_p2_total,
    p1_selection = p1.selection,
    p2_selection = p2.selection,
    resolved_at = now()
  WHERE rd.room_id = target.id AND rd.player_position = slot;

  UPDATE public.h2h_matches m
  SET
    phase = 'reveal',
    p1_total = next_p1_total,
    p2_total = next_p2_total,
    p1_continue = false,
    p2_continue = false,
    updated_at = now()
  WHERE m.room_id = target.id;

  RETURN jsonb_build_object(
    'ok', true,
    'locked', true,
    'resolved', true,
    'position', slot,
    'winner', winner
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- ack_h2h_continue
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
  me_is_p1 boolean;
  both_ready boolean;
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

  IF uid IS DISTINCT FROM match_row.p1_user_id AND uid IS DISTINCT FROM match_row.p2_user_id THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
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

  me_is_p1 := uid = match_row.p1_user_id;

  IF me_is_p1 THEN
    UPDATE public.h2h_matches m
    SET p1_continue = true, updated_at = now()
    WHERE m.room_id = match_row.room_id;
  ELSE
    UPDATE public.h2h_matches m
    SET p2_continue = true, updated_at = now()
    WHERE m.room_id = match_row.room_id;
  END IF;

  SELECT (m.p1_continue AND m.p2_continue) INTO both_ready
  FROM public.h2h_matches m
  WHERE m.room_id = match_row.room_id;

  IF NOT both_ready THEN
    RETURN jsonb_build_object('ok', true, 'waiting', true, 'position', match_row.current_position);
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

-- ---------------------------------------------------------------------------
-- get_h2h_state
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_h2h_state(room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := get_h2h_state.room_id;
  match_row public.h2h_matches%ROWTYPE;
  me_num integer;
  my_pick public.h2h_picks%ROWTYPE;
  opp_locked boolean;
  current_round public.h2h_rounds%ROWTYPE;
  rounds jsonb;
BEGIN
  SELECT * INTO match_row FROM public.h2h_matches m WHERE m.room_id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF uid IS DISTINCT FROM match_row.p1_user_id AND uid IS DISTINCT FROM match_row.p2_user_id THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  me_num := CASE WHEN uid = match_row.p1_user_id THEN 1 ELSE 2 END;

  SELECT * INTO my_pick
  FROM public.h2h_picks pk
  WHERE pk.room_id = match_row.room_id
    AND pk.player_position = match_row.current_position
    AND pk.user_id = uid;

  SELECT EXISTS (
    SELECT 1 FROM public.h2h_picks pk
    WHERE pk.room_id = match_row.room_id
      AND pk.player_position = match_row.current_position
      AND pk.user_id <> uid
  ) INTO opp_locked;

  SELECT * INTO current_round
  FROM public.h2h_rounds rd
  WHERE rd.room_id = match_row.room_id AND rd.player_position = match_row.current_position;

  SELECT coalesce(jsonb_agg(to_jsonb(rd) ORDER BY
    CASE rd.player_position WHEN 'PG' THEN 1 WHEN 'SG' THEN 2 WHEN 'SF' THEN 3 WHEN 'PF' THEN 4 ELSE 5 END
  ), '[]'::jsonb)
  INTO rounds
  FROM public.h2h_rounds rd
  WHERE rd.room_id = match_row.room_id AND rd.matchup_resolved;

  RETURN jsonb_build_object(
    'room_id', match_row.room_id,
    'current_position', match_row.current_position,
    'phase', match_row.phase,
    'p1_user_id', match_row.p1_user_id,
    'p2_user_id', match_row.p2_user_id,
    'p1_total', match_row.p1_total,
    'p2_total', match_row.p2_total,
    'p1_continue', match_row.p1_continue,
    'p2_continue', match_row.p2_continue,
    'my_player_number', me_num,
    'my_locked', my_pick.id IS NOT NULL,
    'opponent_locked', opp_locked,
    'my_pick', CASE WHEN my_pick.id IS NULL THEN NULL ELSE to_jsonb(my_pick) END,
    'current_round', CASE
      WHEN current_round.matchup_resolved THEN to_jsonb(current_round)
      ELSE jsonb_build_object(
        'position', match_row.current_position,
        'player_position', match_row.current_position,
        'matchup_resolved', false
      )
    END,
    'resolved_rounds', rounds
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- start_room — host START GAME
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_room(room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := start_room.room_id;
  target public.rooms%ROWTYPE;
  player_count integer;
  ready_count integer;
BEGIN
  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO target FROM public.rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF target.host_user_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'NOT_HOST' USING ERRCODE = 'P0001';
  END IF;

  IF target.expires_at <= now() THEN
    UPDATE public.rooms r SET status = 'abandoned' WHERE r.id = target.id AND r.status = 'waiting';
    RAISE EXCEPTION 'ROOM_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  IF target.status = 'playing' THEN
    RAISE EXCEPTION 'ROOM_STARTED' USING ERRCODE = 'P0001';
  END IF;

  IF target.status = 'finished' THEN
    RAISE EXCEPTION 'ROOM_FINISHED' USING ERRCODE = 'P0001';
  END IF;

  IF target.status = 'abandoned' THEN
    RAISE EXCEPTION 'ROOM_ABANDONED' USING ERRCODE = 'P0001';
  END IF;

  IF target.status IS DISTINCT FROM 'waiting' THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer, count(*) FILTER (WHERE rp.is_ready)::integer
  INTO player_count, ready_count
  FROM public.room_players rp
  WHERE rp.room_id = target.id;

  IF player_count <> 2 THEN
    RAISE EXCEPTION 'NEED_TWO_PLAYERS' USING ERRCODE = 'P0001';
  END IF;

  IF ready_count <> 2 THEN
    RAISE EXCEPTION 'PLAYERS_NOT_READY' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.rooms r
  SET status = 'playing', started_at = coalesce(r.started_at, now())
  WHERE r.id = target.id
  RETURNING * INTO target;

  PERFORM public.init_h2h_match(target.id);

  RETURN jsonb_build_object(
    'room_id', target.id,
    'room_code', target.room_code,
    'host_user_id', target.host_user_id,
    'status', target.status,
    'expires_at', target.expires_at,
    'started_at', target.started_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.init_h2h_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_h2h_pick(uuid, text, jsonb, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ack_h2h_continue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_h2h_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_room(uuid) TO authenticated;
