-- When either player leaves a waiting/playing lobby, mark the room abandoned
-- so the remaining player always gets a disconnect signal (host or guest).

CREATE OR REPLACE FUNCTION public.leave_room(room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := public._mp_require_auth();
  target public.rooms%ROWTYPE;
  me public.room_players%ROWTYPE;
  remaining integer;
BEGIN
  SELECT * INTO target
  FROM public.rooms r
  WHERE r.id = leave_room.room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already_left', true);
  END IF;

  SELECT * INTO me
  FROM public.room_players rp
  WHERE rp.room_id = target.id AND rp.user_id = uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already_left', true);
  END IF;

  DELETE FROM public.room_players
  WHERE id = me.id;

  SELECT count(*)::integer INTO remaining
  FROM public.room_players rp
  WHERE rp.room_id = target.id;

  -- Anyone leaving a live lobby ends the session for the other player too.
  IF remaining < 2 AND target.status IN ('waiting', 'playing') THEN
    UPDATE public.rooms
    SET status = 'abandoned'
    WHERE id = target.id
      AND status IN ('waiting', 'playing');
  END IF;

  RETURN jsonb_build_object('ok', true, 'room_id', target.id);
END;
$$;
