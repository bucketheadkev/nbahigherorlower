-- Clear one locked pick during full-roster draft (used by move fallback: clear + lock).

CREATE OR REPLACE FUNCTION public.clear_h2h_pick(
  room_id uuid,
  player_position text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := clear_h2h_pick.room_id;
  p_from text := clear_h2h_pick.player_position;
  target public.rooms%ROWTYPE;
  match_row public.h2h_matches%ROWTYPE;
  cleared_count integer;
BEGIN
  IF p_room_id IS NULL OR p_from IS NULL THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_from NOT IN ('PG', 'SG', 'SF', 'PF', 'C') THEN
    RAISE EXCEPTION 'INVALID_POSITION' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO target FROM public.rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF target.status IS DISTINCT FROM 'playing' THEN
    RAISE EXCEPTION 'ROOM_NOT_PLAYING' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_players rp
    WHERE rp.room_id = target.id AND rp.user_id = uid
  ) THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO match_row
  FROM public.h2h_matches m
  WHERE m.room_id = target.id
  FOR UPDATE;

  IF NOT FOUND OR match_row.phase IS DISTINCT FROM 'selecting' THEN
    RAISE EXCEPTION 'WRONG_PHASE' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.h2h_picks pk
  WHERE pk.room_id = target.id
    AND pk.user_id = uid
    AND pk.player_position = p_from;

  GET DIAGNOSTICS cleared_count = ROW_COUNT;
  IF cleared_count = 0 THEN
    RAISE EXCEPTION 'NO_PICK' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('ok', true, 'cleared', p_from);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_h2h_pick(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_h2h_pick(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.clear_h2h_pick(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.clear_h2h_pick(uuid, text) TO authenticated;
