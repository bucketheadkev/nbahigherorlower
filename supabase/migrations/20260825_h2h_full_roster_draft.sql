-- Full-roster 1v1 draft for classic / bounty / knockout.
-- Players may lock any open position in any order.
-- Matchups resolve only after BOTH players have all 5 picks, then phase → finished.
-- Safe to re-run.

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
  p1_count integer;
  p2_count integer;
  p1 public.h2h_picks%ROWTYPE;
  p2 public.h2h_picks%ROWTYPE;
  winner text;
  penalty bigint;
  p1_adj bigint;
  p2_adj bigint;
  next_p1_total bigint := 0;
  next_p2_total bigint := 0;
  sel_pos text;
  slot text := lock_h2h_pick.player_position;
  mode text;
  order_arr text[] := ARRAY['PG', 'SG', 'SF', 'PF', 'C'];
  pos text;
  p1_wins int := 0;
  p2_wins int := 0;
  cfg jsonb;
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

  mode := coalesce(match_row.game_mode, 'classic');

  -- classic / bounty / knockout: any open slot, resolve only when both have 5
  IF mode IN ('classic', 'bounty', 'knockout') THEN
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

    SELECT count(*)::integer INTO p1_count
    FROM public.h2h_picks pk
    WHERE pk.room_id = target.id AND pk.player_number = 1;

    SELECT count(*)::integer INTO p2_count
    FROM public.h2h_picks pk
    WHERE pk.room_id = target.id AND pk.player_number = 2;

    IF p1_count < 5 OR p2_count < 5 THEN
      RETURN jsonb_build_object(
        'ok', true,
        'locked', true,
        'waiting', true,
        'position', slot,
        'my_count', CASE WHEN me.player_number = 1 THEN p1_count ELSE p2_count END,
        'opp_count', CASE WHEN me.player_number = 1 THEN p2_count ELSE p1_count END
      );
    END IF;

    -- Both lineups complete — resolve every position, then finish.
    FOREACH pos IN ARRAY order_arr LOOP
      PERFORM 1
      FROM public.h2h_rounds rd
      WHERE rd.room_id = target.id AND rd.player_position = pos
      FOR UPDATE;

      IF EXISTS (
        SELECT 1 FROM public.h2h_rounds rd
        WHERE rd.room_id = target.id AND rd.player_position = pos AND rd.matchup_resolved
      ) THEN
        CONTINUE;
      END IF;

      SELECT * INTO p1
      FROM public.h2h_picks pk
      WHERE pk.room_id = target.id AND pk.player_position = pos AND pk.player_number = 1;

      SELECT * INTO p2
      FROM public.h2h_picks pk
      WHERE pk.room_id = target.id AND pk.player_position = pos AND pk.player_number = 2;

      IF p1.id IS NULL OR p2.id IS NULL THEN
        RAISE EXCEPTION 'NEED_TWO_PLAYERS' USING ERRCODE = 'P0001';
      END IF;

      IF p1.raw_value > p2.raw_value THEN
        winner := 'p1';
        penalty := public.calculate_head_to_head_penalty(p1.raw_value, p2.raw_value);
        p1_adj := p1.raw_value;
        p2_adj := GREATEST(0, p2.raw_value - penalty);
        p1_wins := p1_wins + 1;
      ELSIF p2.raw_value > p1.raw_value THEN
        winner := 'p2';
        penalty := public.calculate_head_to_head_penalty(p2.raw_value, p1.raw_value);
        p2_adj := p2.raw_value;
        p1_adj := GREATEST(0, p1.raw_value - penalty);
        p2_wins := p2_wins + 1;
      ELSE
        winner := 'tie';
        p1_adj := p1.raw_value;
        p2_adj := p2.raw_value;
      END IF;

      next_p1_total := next_p1_total + p1_adj;
      next_p2_total := next_p2_total + p2_adj;

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
      WHERE rd.room_id = target.id AND rd.player_position = pos;
    END LOOP;

    cfg := coalesce(match_row.mode_config, '{}'::jsonb);
    IF mode = 'knockout' THEN
      cfg := jsonb_set(cfg, '{knockout,p1Wins}', to_jsonb(p1_wins), true);
      cfg := jsonb_set(cfg, '{knockout,p2Wins}', to_jsonb(p2_wins), true);
      cfg := jsonb_set(cfg, '{knockout,startedAt}', to_jsonb(now()), true);
    END IF;

    UPDATE public.h2h_matches m
    SET
      phase = 'finished',
      current_position = 'C',
      p1_total = next_p1_total,
      p2_total = next_p2_total,
      p1_continue = false,
      p2_continue = false,
      mode_config = cfg,
      updated_at = now()
    WHERE m.room_id = target.id;

    UPDATE public.rooms r
    SET status = 'finished'
    WHERE r.id = target.id AND r.status = 'playing';

    RETURN jsonb_build_object(
      'ok', true,
      'locked', true,
      'resolved', true,
      'finished', true,
      'p1_total', next_p1_total,
      'p2_total', next_p2_total
    );
  END IF;

  -- Fallback (should not hit for known modes): legacy single-slot lock
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

  RETURN jsonb_build_object('ok', true, 'locked', true, 'waiting', true, 'position', slot);
END;
$$;

-- get_h2h_state: lineup draft fields + my_locked = full roster for lineup modes
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
  my_picks_json jsonb;
  opp_pick_count integer;
  my_pick_count integer;
  my_locked_flag boolean;
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

  SELECT count(*)::integer INTO my_pick_count
  FROM public.h2h_picks pk
  WHERE pk.room_id = match_row.room_id AND pk.user_id = uid;

  SELECT count(*)::integer INTO opp_pick_count
  FROM public.h2h_picks pk
  WHERE pk.room_id = match_row.room_id AND pk.user_id <> uid;

  IF mode IN ('classic', 'bounty', 'knockout') THEN
    my_locked_flag := my_pick_count >= 5;
    opp_locked := opp_pick_count >= 5;
  ELSE
    my_locked_flag := my_pick.id IS NOT NULL;
    SELECT EXISTS (
      SELECT 1 FROM public.h2h_picks pk
      WHERE pk.room_id = match_row.room_id
        AND pk.player_position = match_row.current_position
        AND pk.user_id <> uid
    ) INTO opp_locked;
  END IF;

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

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'position', pk.player_position,
    'player_position', pk.player_position,
    'selection', pk.selection,
    'raw_value', pk.raw_value
  ) ORDER BY CASE pk.player_position WHEN 'PG' THEN 1 WHEN 'SG' THEN 2 WHEN 'SF' THEN 3 WHEN 'PF' THEN 4 ELSE 5 END), '[]'::jsonb)
  INTO my_picks_json
  FROM public.h2h_picks pk
  WHERE pk.room_id = match_row.room_id AND pk.user_id = uid;

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
    'my_locked', my_locked_flag,
    'opponent_locked', opp_locked,
    'opponent_rematch', opp_rematch,
    'my_pick', CASE WHEN my_pick.id IS NULL THEN NULL ELSE to_jsonb(my_pick) END,
    'my_picks', my_picks_json,
    'opponent_pick_count', opp_pick_count,
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

GRANT EXECUTE ON FUNCTION public.lock_h2h_pick(uuid, text, jsonb, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_h2h_state(uuid) TO authenticated;
