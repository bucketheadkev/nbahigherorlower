-- 1V1 game modes: store selected mode on rooms + mode_config on h2h_matches.
-- Safe to run after prior h2h migrations. Host sets mode at create; guests inherit it.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS game_mode text NOT NULL DEFAULT 'classic';

ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS rooms_game_mode_chk;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_game_mode_chk CHECK (
    game_mode IN ('classic', 'bounty', 'tradeUp', 'knockout')
  );

ALTER TABLE public.h2h_matches
  ADD COLUMN IF NOT EXISTS game_mode text NOT NULL DEFAULT 'classic';

ALTER TABLE public.h2h_matches
  ADD COLUMN IF NOT EXISTS mode_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.h2h_matches
  DROP CONSTRAINT IF EXISTS h2h_matches_game_mode_chk;

ALTER TABLE public.h2h_matches
  ADD CONSTRAINT h2h_matches_game_mode_chk CHECK (
    game_mode IN ('classic', 'bounty', 'tradeUp', 'knockout')
  );

-- ---------------------------------------------------------------------------
-- create_room(display_name, game_mode default classic)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_room(display_name text, game_mode text DEFAULT 'classic')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := public._mp_require_auth();
  name text := public._mp_normalize_display_name(display_name);
  mode text := coalesce(nullif(btrim(create_room.game_mode), ''), 'classic');
  new_code text;
  new_room public.rooms%ROWTYPE;
  new_player public.room_players%ROWTYPE;
BEGIN
  IF mode NOT IN ('classic', 'bounty', 'tradeUp', 'knockout') THEN
    RAISE EXCEPTION 'INVALID_GAME_MODE' USING ERRCODE = 'P0001';
  END IF;

  new_code := public._mp_generate_room_code();

  INSERT INTO public.rooms (room_code, host_user_id, status, expires_at, game_mode)
  VALUES (new_code, uid, 'waiting', now() + interval '1 hour', mode)
  RETURNING * INTO new_room;

  INSERT INTO public.room_players (
    room_id, user_id, display_name, player_number, is_ready
  )
  VALUES (new_room.id, uid, name, 1, false)
  RETURNING * INTO new_player;

  RETURN jsonb_build_object(
    'room_id', new_room.id,
    'room_code', new_room.room_code,
    'host_user_id', new_room.host_user_id,
    'status', new_room.status,
    'expires_at', new_room.expires_at,
    'game_mode', new_room.game_mode,
    'player_id', new_player.id,
    'player_number', new_player.player_number,
    'display_name', new_player.display_name
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Helper: build initial mode_config for a room
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._mp_build_mode_config(p_room_id uuid, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  positions text[] := ARRAY['PG', 'SG', 'SF', 'PF', 'C'];
  bounty_pos text;
  seed text;
  seed_int int;
BEGIN
  -- Unique per match/rematch so rematches do not reuse bounty/starter.
  seed := abs(hashtext(p_room_id::text || clock_timestamp()::text))::text;
  seed_int := abs(hashtext(seed));

  IF p_mode = 'bounty' THEN
    bounty_pos := positions[1 + (seed_int % 5)];
    RETURN jsonb_build_object(
      'mode', 'bounty',
      'seed', seed,
      'bounty', jsonb_build_object(
        'bountyPosition', bounty_pos,
        'multiplier', 2,
        'revealed', false
      )
    );
  ELSIF p_mode = 'knockout' THEN
    RETURN jsonb_build_object(
      'mode', 'knockout',
      'seed', seed,
      'knockout', jsonb_build_object(
        'winsToFinish', 3,
        'p1Wins', 0,
        'p2Wins', 0
      )
    );
  ELSIF p_mode = 'tradeUp' THEN
    RETURN jsonb_build_object(
      'mode', 'tradeUp',
      'seed', seed,
      'tradeUp', jsonb_build_object(
        'attemptsTotal', 7,
        'starterMaxDollars', 25000000,
        'starter', NULL,
        'p1', jsonb_build_object('attemptsRemaining', 7, 'finished', false, 'current', NULL),
        'p2', jsonb_build_object('attemptsRemaining', 7, 'finished', false, 'current', NULL)
      )
    );
  END IF;

  RETURN jsonb_build_object('mode', 'classic', 'seed', seed);
END;
$$;

-- Patch init_h2h_match to copy rooms.game_mode + seed mode_config
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
  mode text;
  cfg jsonb;
BEGIN
  SELECT * INTO target FROM public.rooms r WHERE r.id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_room_member(target.id) THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  mode := coalesce(target.game_mode, 'classic');
  cfg := public._mp_build_mode_config(target.id, mode);

  SELECT * INTO match_row FROM public.h2h_matches m WHERE m.room_id = target.id;
  IF FOUND AND (
    match_row.phase = 'finished'
    OR target.status = 'finished'
  ) THEN
    DELETE FROM public.h2h_picks pk WHERE pk.room_id = target.id;
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
    WHERE rd.room_id = target.id;

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
      game_mode = mode,
      mode_config = public._mp_build_mode_config(target.id, mode),
      updated_at = now()
    WHERE m.room_id = target.id;

    UPDATE public.rooms r SET status = 'playing' WHERE r.id = target.id;
    RETURN jsonb_build_object('ok', true, 'room_id', target.id, 'rematched', true, 'game_mode', mode);
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
    room_id, p1_user_id, p2_user_id, current_position, phase, game_mode, mode_config
  )
  VALUES (target.id, host_id, guest_id, 'PG', 'selecting', mode, cfg)
  -- Alias `m` hides the bare table name; ON CONFLICT DO UPDATE must use `m`, not h2h_matches.
  ON CONFLICT ON CONSTRAINT h2h_matches_pkey DO UPDATE
  SET
    game_mode = EXCLUDED.game_mode,
    mode_config = CASE
      WHEN m.game_mode IS DISTINCT FROM EXCLUDED.game_mode
        OR m.mode_config = '{}'::jsonb
        OR m.mode_config IS NULL
      THEN EXCLUDED.mode_config
      ELSE m.mode_config
    END;

  FOREACH slot IN ARRAY ARRAY['PG', 'SG', 'SF', 'PF', 'C'] LOOP
    INSERT INTO public.h2h_rounds AS rd (room_id, player_position)
    VALUES (target.id, slot)
    ON CONFLICT ON CONSTRAINT h2h_rounds_pk DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'room_id', target.id, 'caller', uid, 'game_mode', mode);
END;
$$;

-- Expose game_mode + mode_config from get_h2h_state (append fields via replace of return object
-- by wrapping: we redefine a thin overlay using existing function body if present is too large —
-- instead provide set_h2h_mode_config for trade-up updates.

CREATE OR REPLACE FUNCTION public.set_h2h_mode_config(room_id uuid, mode_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := set_h2h_mode_config.room_id;
  match_row public.h2h_matches%ROWTYPE;
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

  UPDATE public.h2h_matches m
  SET mode_config = coalesce(set_h2h_mode_config.mode_config, '{}'::jsonb),
      updated_at = now()
  WHERE m.room_id = match_row.room_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- get_h2h_state — include game_mode + mode_config
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
  mode text;
  cfg jsonb;
BEGIN
  SELECT * INTO match_row FROM public.h2h_matches m WHERE m.room_id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF uid IS DISTINCT FROM match_row.p1_user_id AND uid IS DISTINCT FROM match_row.p2_user_id THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  me_num := CASE WHEN uid = match_row.p1_user_id THEN 1 ELSE 2 END;
  mode := coalesce(match_row.game_mode, 'classic');
  cfg := coalesce(match_row.mode_config, '{}'::jsonb);

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
    'game_mode', mode,
    'mode_config', cfg,
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

-- ---------------------------------------------------------------------------
-- Seed Trade Up starter once (idempotent)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_h2h_tradeup_starter(room_id uuid, starter jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := seed_h2h_tradeup_starter.room_id;
  match_row public.h2h_matches%ROWTYPE;
  cfg jsonb;
  tu jsonb;
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

  IF coalesce(match_row.game_mode, 'classic') IS DISTINCT FROM 'tradeUp' THEN
    RAISE EXCEPTION 'WRONG_MODE' USING ERRCODE = 'P0001';
  END IF;

  cfg := coalesce(match_row.mode_config, '{}'::jsonb);
  tu := coalesce(cfg->'tradeUp', '{}'::jsonb);

  IF tu->'starter' IS NOT NULL AND tu->'starter' <> 'null'::jsonb THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'mode_config', cfg);
  END IF;

  tu := tu || jsonb_build_object(
    'starter', starter,
    'p1', jsonb_build_object(
      'attemptsRemaining', coalesce((tu->'p1'->>'attemptsRemaining')::int, 7),
      'finished', false,
      'current', starter
    ),
    'p2', jsonb_build_object(
      'attemptsRemaining', coalesce((tu->'p2'->>'attemptsRemaining')::int, 7),
      'finished', false,
      'current', starter
    )
  );
  cfg := cfg || jsonb_build_object('mode', 'tradeUp', 'tradeUp', tu);

  UPDATE public.h2h_matches m
  SET mode_config = cfg, updated_at = now()
  WHERE m.room_id = match_row.room_id;

  RETURN jsonb_build_object('ok', true, 'mode_config', cfg);
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic Trade / Pass for Trade Up
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_h2h_tradeup_decision(
  room_id uuid,
  did_trade boolean,
  new_player jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := apply_h2h_tradeup_decision.room_id;
  match_row public.h2h_matches%ROWTYPE;
  cfg jsonb;
  tu jsonb;
  slot_key text;
  slot jsonb;
  remaining int;
  current_player jsonb;
  next_current jsonb;
  p1_done boolean;
  p2_done boolean;
  p1_val bigint;
  p2_val bigint;
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

  IF coalesce(match_row.game_mode, 'classic') IS DISTINCT FROM 'tradeUp' THEN
    RAISE EXCEPTION 'WRONG_MODE' USING ERRCODE = 'P0001';
  END IF;

  IF match_row.phase = 'finished' THEN
    RETURN jsonb_build_object('ok', true, 'finished', true, 'mode_config', match_row.mode_config);
  END IF;

  cfg := coalesce(match_row.mode_config, '{}'::jsonb);
  tu := coalesce(cfg->'tradeUp', '{}'::jsonb);
  slot_key := CASE WHEN uid = match_row.p1_user_id THEN 'p1' ELSE 'p2' END;
  slot := coalesce(tu->slot_key, '{}'::jsonb);

  IF coalesce((slot->>'finished')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'already_finished', true, 'mode_config', cfg);
  END IF;

  remaining := coalesce((slot->>'attemptsRemaining')::int, 0);
  IF remaining <= 0 THEN
    RAISE EXCEPTION 'NO_ATTEMPTS' USING ERRCODE = 'P0001';
  END IF;

  current_player := slot->'current';
  IF current_player IS NULL OR current_player = 'null'::jsonb THEN
    current_player := tu->'starter';
  END IF;

  IF did_trade THEN
    IF new_player IS NULL OR new_player = 'null'::jsonb THEN
      RAISE EXCEPTION 'NEED_PLAYER' USING ERRCODE = 'P0001';
    END IF;
    next_current := new_player;
  ELSE
    next_current := current_player;
  END IF;

  remaining := remaining - 1;
  slot := jsonb_build_object(
    'attemptsRemaining', remaining,
    'finished', remaining <= 0,
    'current', next_current
  );
  tu := tu || jsonb_build_object(slot_key, slot);
  cfg := cfg || jsonb_build_object('mode', 'tradeUp', 'tradeUp', tu);

  p1_done := coalesce((tu->'p1'->>'finished')::boolean, false);
  p2_done := coalesce((tu->'p2'->>'finished')::boolean, false);
  p1_val := coalesce((tu->'p1'->'current'->>'dollarValue')::bigint, 0);
  p2_val := coalesce((tu->'p2'->'current'->>'dollarValue')::bigint, 0);

  IF p1_done AND p2_done THEN
    UPDATE public.h2h_matches m
    SET
      mode_config = cfg,
      phase = 'finished',
      p1_total = p1_val,
      p2_total = p2_val,
      updated_at = now()
    WHERE m.room_id = match_row.room_id;

    UPDATE public.rooms r
    SET status = 'finished'
    WHERE r.id = match_row.room_id AND r.status = 'playing';

    RETURN jsonb_build_object('ok', true, 'finished', true, 'mode_config', cfg);
  END IF;

  UPDATE public.h2h_matches m
  SET mode_config = cfg, updated_at = now()
  WHERE m.room_id = match_row.room_id;

  RETURN jsonb_build_object('ok', true, 'mode_config', cfg);
END;
$$;

-- ---------------------------------------------------------------------------
-- Knockout: host continue finishes early at first-to-3
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
  p1_wins int;
  p2_wins int;
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

  SELECT
    count(*) FILTER (WHERE rd.matchup_winner = 'p1'),
    count(*) FILTER (WHERE rd.matchup_winner = 'p2')
  INTO p1_wins, p2_wins
  FROM public.h2h_rounds rd
  WHERE rd.room_id = match_row.room_id AND rd.matchup_resolved;

  idx := array_position(order_arr, match_row.current_position);
  IF idx IS NULL OR idx >= 5
     OR (
       coalesce(match_row.game_mode, 'classic') = 'knockout'
       AND (p1_wins >= 3 OR p2_wins >= 3)
     )
  THEN
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

GRANT EXECUTE ON FUNCTION public.create_room(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.init_h2h_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_h2h_mode_config(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_h2h_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_h2h_tradeup_starter(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_h2h_tradeup_decision(uuid, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ack_h2h_continue(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_h2h_mode_config(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_h2h_tradeup_starter(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_h2h_tradeup_decision(uuid, boolean, jsonb) FROM PUBLIC;
