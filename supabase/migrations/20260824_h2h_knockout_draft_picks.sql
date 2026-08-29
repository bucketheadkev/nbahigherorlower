-- Expose my_picks array + opponent_pick_count for Knockout draft mode.
-- Also expose resolved_rounds even during 'selecting' phase for Knockout.
-- Safe to re-run (CREATE OR REPLACE).

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

  -- Current position pick (for classic/bounty compat)
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

  -- Resolved rounds (always, so Knockout can show them after finish)
  SELECT coalesce(jsonb_agg(to_jsonb(rd) ORDER BY
    CASE rd.player_position WHEN 'PG' THEN 1 WHEN 'SG' THEN 2 WHEN 'SF' THEN 3 WHEN 'PF' THEN 4 ELSE 5 END
  ), '[]'::jsonb)
  INTO rounds
  FROM public.h2h_rounds rd
  WHERE rd.room_id = match_row.room_id AND rd.matchup_resolved;

  -- All my picks across all positions (for Knockout draft view)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'position', pk.player_position,
    'player_position', pk.player_position,
    'selection', pk.selection,
    'raw_value', pk.raw_value
  ) ORDER BY CASE pk.player_position WHEN 'PG' THEN 1 WHEN 'SG' THEN 2 WHEN 'SF' THEN 3 WHEN 'PF' THEN 4 ELSE 5 END), '[]'::jsonb)
  INTO my_picks_json
  FROM public.h2h_picks pk
  WHERE pk.room_id = match_row.room_id AND pk.user_id = uid;

  -- Opponent's total pick count (so both sides can show opponent progress)
  SELECT count(*)::integer INTO opp_pick_count
  FROM public.h2h_picks pk
  WHERE pk.room_id = match_row.room_id AND pk.user_id <> uid;

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

GRANT EXECUTE ON FUNCTION public.get_h2h_state(uuid) TO authenticated;
