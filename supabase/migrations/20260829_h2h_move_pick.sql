-- Move a locked pick to another open slot during full-roster draft (classic / bounty / knockout).

CREATE OR REPLACE FUNCTION public.move_h2h_pick(
  room_id uuid,
  from_position text,
  to_position text,
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
  p_room_id uuid := move_h2h_pick.room_id;
  p_from text := move_h2h_pick.from_position;
  p_to text := move_h2h_pick.to_position;
  p_selection jsonb := move_h2h_pick.selection;
  p_raw_value bigint := move_h2h_pick.raw_value;
  target public.rooms%ROWTYPE;
  match_row public.h2h_matches%ROWTYPE;
  me public.room_players%ROWTYPE;
  sel_pos text;
BEGIN
  IF p_room_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_from NOT IN ('PG', 'SG', 'SF', 'PF', 'C')
     OR p_to NOT IN ('PG', 'SG', 'SF', 'PF', 'C') THEN
    RAISE EXCEPTION 'INVALID_POSITION' USING ERRCODE = 'P0001';
  END IF;

  IF p_from = p_to THEN
    RAISE EXCEPTION 'INVALID_POSITION' USING ERRCODE = 'P0001';
  END IF;

  IF p_selection IS NULL OR jsonb_typeof(p_selection) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_SELECTION' USING ERRCODE = 'P0001';
  END IF;

  IF p_raw_value IS NULL OR p_raw_value < 0 THEN
    RAISE EXCEPTION 'INVALID_TOTAL' USING ERRCODE = 'P0001';
  END IF;

  sel_pos := upper(btrim(coalesce(p_selection->>'position', '')));
  IF sel_pos IS DISTINCT FROM p_to THEN
    RAISE EXCEPTION 'INVALID_POSITION' USING ERRCODE = 'P0001';
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

  IF NOT FOUND OR match_row.phase IS DISTINCT FROM 'selecting' THEN
    RAISE EXCEPTION 'WRONG_PHASE' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.h2h_picks pk
    WHERE pk.room_id = target.id AND pk.user_id = uid AND pk.player_position = p_from
  ) THEN
    RAISE EXCEPTION 'NO_PICK' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.h2h_picks pk
    WHERE pk.room_id = target.id AND pk.user_id = uid AND pk.player_position = p_to
  ) THEN
    RAISE EXCEPTION 'ALREADY_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.h2h_picks pk
  SET
    player_position = p_to,
    selection = p_selection,
    raw_value = p_raw_value
  WHERE pk.room_id = target.id
    AND pk.user_id = uid
    AND pk.player_position = p_from;

  RETURN jsonb_build_object('ok', true, 'from', p_from, 'to', p_to);
END;
$$;

REVOKE ALL ON FUNCTION public.move_h2h_pick(uuid, text, text, jsonb, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_h2h_pick(uuid, text, text, jsonb, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_h2h_pick(uuid, text, text, jsonb, bigint) TO authenticated;
