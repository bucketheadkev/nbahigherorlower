-- Fix 1V1 game_mode sticking on classic (idempotent / safe to re-run).
-- Root cause of prior failure:
--   INSERT INTO public.h2h_matches AS m ... ON CONFLICT DO UPDATE
--   referenced public.h2h_matches.col. With an alias, Postgres hides the
--   bare table name, which raises:
--   "invalid reference to FROM-clause entry for table h2h_matches"
--   Fix: qualify existing-row columns as m.col (not public.h2h_matches.col).
--
-- 1) Remove overloaded create_room(text) that ignores mode
-- 2) Recreate create_room(display_name, game_mode)
-- 3) Host can set mode on a waiting room (safety net)
-- 4) Re-apply mode_config helper + init_h2h_match + get_h2h_state
-- Does NOT drop/recreate tables. Preserves existing multiplayer rows.

-- Drop both overloads if present
DROP FUNCTION IF EXISTS public.create_room(text);
DROP FUNCTION IF EXISTS public.create_room(text, text);

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS game_mode text NOT NULL DEFAULT 'classic';

ALTER TABLE public.h2h_matches
  ADD COLUMN IF NOT EXISTS game_mode text NOT NULL DEFAULT 'classic';

ALTER TABLE public.h2h_matches
  ADD COLUMN IF NOT EXISTS mode_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_game_mode_chk;
ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_game_mode_chk CHECK (
    game_mode IN ('classic', 'bounty', 'tradeUp', 'knockout')
  );

ALTER TABLE public.h2h_matches DROP CONSTRAINT IF EXISTS h2h_matches_game_mode_chk;
ALTER TABLE public.h2h_matches
  ADD CONSTRAINT h2h_matches_game_mode_chk CHECK (
    game_mode IN ('classic', 'bounty', 'tradeUp', 'knockout')
  );

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

-- Host-only safety net: force mode on a waiting lobby
CREATE OR REPLACE FUNCTION public.set_room_game_mode(room_id uuid, game_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := set_room_game_mode.room_id;
  mode text := coalesce(nullif(btrim(set_room_game_mode.game_mode), ''), 'classic');
  target public.rooms%ROWTYPE;
BEGIN
  IF mode NOT IN ('classic', 'bounty', 'tradeUp', 'knockout') THEN
    RAISE EXCEPTION 'INVALID_GAME_MODE' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO target FROM public.rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF target.host_user_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'NOT_HOST' USING ERRCODE = 'P0001';
  END IF;

  IF target.status IS DISTINCT FROM 'waiting' THEN
    RAISE EXCEPTION 'ROOM_STARTED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.rooms r
  SET game_mode = mode
  WHERE r.id = target.id
  RETURNING * INTO target;

  RETURN jsonb_build_object(
    'ok', true,
    'room_id', target.id,
    'game_mode', target.game_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_room(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_room_game_mode(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_room_game_mode(uuid, text) FROM PUBLIC;

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


GRANT EXECUTE ON FUNCTION public.init_h2h_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_h2h_state(uuid) TO authenticated;
