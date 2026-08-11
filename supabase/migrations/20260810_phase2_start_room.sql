-- Phase 2: secure host-only start_room RPC + started_at column.
-- Additive patch. Safe against a DB that already applied Phase 1 (+ RLS fix).
-- Does not modify prior migration files. Does not disable RLS.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- ---------------------------------------------------------------------------
-- start_room(room_id)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_room(room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := public._mp_require_auth();
  target public.rooms%ROWTYPE;
  player_count integer;
  ready_count integer;
BEGIN
  IF room_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO target
  FROM public.rooms r
  WHERE r.id = start_room.room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF target.host_user_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'NOT_HOST' USING ERRCODE = 'P0001';
  END IF;

  IF target.expires_at <= now() THEN
    UPDATE public.rooms
    SET status = 'abandoned'
    WHERE id = target.id
      AND status = 'waiting';
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

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE rp.is_ready)::integer
  INTO player_count, ready_count
  FROM public.room_players rp
  WHERE rp.room_id = target.id;

  IF player_count <> 2 THEN
    RAISE EXCEPTION 'NEED_TWO_PLAYERS' USING ERRCODE = 'P0001';
  END IF;

  IF ready_count <> 2 THEN
    RAISE EXCEPTION 'PLAYERS_NOT_READY' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.rooms
  SET
    status = 'playing',
    started_at = coalesce(started_at, now())
  WHERE id = target.id
  RETURNING * INTO target;

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

REVOKE ALL ON FUNCTION public.start_room(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_room(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_room(uuid) TO authenticated;
