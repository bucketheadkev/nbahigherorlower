-- 1V1 lobby UX: 4-char codes, auto-start when both ready, play-again rematch.
-- Safe to run after prior h2h migrations. CREATE OR REPLACE / IF NOT EXISTS only.

-- ---------------------------------------------------------------------------
-- Room codes: exactly 4 letters/numbers
-- ---------------------------------------------------------------------------

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_room_code_format_chk;

CREATE OR REPLACE FUNCTION public._mp_generate_room_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
  attempt integer;
BEGIN
  FOR attempt IN 1..40 LOOP
    candidate := '';
    FOR i IN 1..4 LOOP
      candidate := candidate || substr(
        alphabet,
        1 + floor(random() * length(alphabet))::integer,
        1
      );
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.room_code = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'ROOM_CODE_GENERATION_FAILED' USING ERRCODE = 'P0001';
END;
$$;

DO $$
DECLARE
  v_room_id uuid;
  v_code text;
BEGIN
  FOR v_room_id IN
    SELECT r.id
    FROM public.rooms r
    WHERE r.room_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$'
    ORDER BY r.created_at, r.id
  LOOP
    LOOP
      v_code := public._mp_generate_room_code();
      BEGIN
        UPDATE public.rooms r
        SET room_code = v_code
        WHERE r.id = v_room_id;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
      END;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_room_code_format_chk CHECK (
    room_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$'
  );

CREATE OR REPLACE FUNCTION public.join_room(room_code text, display_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  name text := public._mp_normalize_display_name(display_name);
  code text := upper(btrim(coalesce(join_room.room_code, '')));
  target public.rooms%ROWTYPE;
  existing public.room_players%ROWTYPE;
  player_count integer;
  new_player public.room_players%ROWTYPE;
BEGIN
  IF code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$' THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO target
  FROM public.rooms r
  WHERE r.room_code = code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF target.expires_at <= now() THEN
    UPDATE public.rooms r SET status = 'abandoned' WHERE r.id = target.id AND r.status = 'waiting';
    RAISE EXCEPTION 'ROOM_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  IF target.status = 'abandoned' THEN
    RAISE EXCEPTION 'ROOM_ABANDONED' USING ERRCODE = 'P0001';
  END IF;

  IF target.status = 'finished' THEN
    RAISE EXCEPTION 'ROOM_FINISHED' USING ERRCODE = 'P0001';
  END IF;

  IF target.status = 'playing' THEN
    RAISE EXCEPTION 'ROOM_STARTED' USING ERRCODE = 'P0001';
  END IF;

  IF target.status <> 'waiting' THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO existing
  FROM public.room_players rp
  WHERE rp.room_id = target.id AND rp.user_id = uid;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'room_id', target.id,
      'room_code', target.room_code,
      'host_user_id', target.host_user_id,
      'status', target.status,
      'expires_at', target.expires_at,
      'player_id', existing.id,
      'player_number', existing.player_number,
      'display_name', existing.display_name,
      'rejoined', true
    );
  END IF;

  SELECT count(*)::integer INTO player_count
  FROM public.room_players rp
  WHERE rp.room_id = target.id;

  IF player_count >= 2 THEN
    RAISE EXCEPTION 'ROOM_FULL' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.room_players (
    room_id, user_id, display_name, player_number, is_ready
  )
  VALUES (
    target.id,
    uid,
    name,
    CASE WHEN player_count = 0 THEN 1 ELSE 2 END,
    false
  )
  RETURNING * INTO new_player;

  RETURN jsonb_build_object(
    'room_id', target.id,
    'room_code', target.room_code,
    'host_user_id', target.host_user_id,
    'status', target.status,
    'expires_at', target.expires_at,
    'player_id', new_player.id,
    'player_number', new_player.player_number,
    'display_name', new_player.display_name
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Rematch flags on h2h_matches
-- ---------------------------------------------------------------------------

ALTER TABLE public.h2h_matches
  ADD COLUMN IF NOT EXISTS p1_rematch boolean NOT NULL DEFAULT false;

ALTER TABLE public.h2h_matches
  ADD COLUMN IF NOT EXISTS p2_rematch boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Auto-start when both players are ready (no host START GAME tap)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._mp_try_start_h2h_if_ready(p_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  target public.rooms%ROWTYPE;
  player_count integer;
  ready_count integer;
BEGIN
  SELECT * INTO target FROM public.rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND OR target.status IS DISTINCT FROM 'waiting' THEN
    RETURN false;
  END IF;

  IF target.expires_at <= now() THEN
    UPDATE public.rooms r SET status = 'abandoned' WHERE r.id = target.id AND r.status = 'waiting';
    RETURN false;
  END IF;

  SELECT count(*)::integer, count(*) FILTER (WHERE rp.is_ready)::integer
  INTO player_count, ready_count
  FROM public.room_players rp
  WHERE rp.room_id = target.id;

  IF player_count <> 2 OR ready_count <> 2 THEN
    RETURN false;
  END IF;

  UPDATE public.rooms r
  SET status = 'playing', started_at = coalesce(r.started_at, now())
  WHERE r.id = target.id
  RETURNING * INTO target;

  PERFORM public.init_h2h_match(target.id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_player_ready(room_id uuid, ready boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := set_player_ready.room_id;
  target public.rooms%ROWTYPE;
  me public.room_players%ROWTYPE;
  started boolean;
BEGIN
  SELECT * INTO target
  FROM public.rooms r
  WHERE r.id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF target.expires_at <= now() THEN
    UPDATE public.rooms r SET status = 'abandoned' WHERE r.id = target.id AND r.status = 'waiting';
    RAISE EXCEPTION 'ROOM_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  IF target.status <> 'waiting' THEN
    RAISE EXCEPTION 'ROOM_STARTED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO me
  FROM public.room_players rp
  WHERE rp.room_id = target.id AND rp.user_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.room_players
  SET is_ready = coalesce(ready, false)
  WHERE id = me.id
  RETURNING * INTO me;

  started := public._mp_try_start_h2h_if_ready(target.id);

  RETURN jsonb_build_object(
    'room_id', target.id,
    'player_id', me.id,
    'player_number', me.player_number,
    'is_ready', me.is_ready,
    'started', started
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Play again — both players must ack; resets match in the same lobby
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._mp_reset_h2h_match(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slot text;
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
-- get_h2h_state — expose rematch acks on finished screen
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
  opp_rematch boolean;
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

  opp_rematch := CASE
    WHEN me_num = 1 THEN match_row.p2_rematch
    ELSE match_row.p1_rematch
  END;

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
    'p1_rematch', match_row.p1_rematch,
    'p2_rematch', match_row.p2_rematch,
    'my_player_number', me_num,
    'my_locked', my_pick.id IS NOT NULL,
    'opponent_locked', opp_locked,
    'opponent_rematch', opp_rematch,
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

GRANT EXECUTE ON FUNCTION public.set_player_ready(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ack_h2h_rematch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_h2h_state(uuid) TO authenticated;
