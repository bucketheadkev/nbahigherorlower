-- Phase 1: private online 1V1 lobbies (rooms + room_players)
-- Safe to run once on a fresh Supabase project via the SQL Editor.
-- Does not expose service-role keys. Uses auth.uid() only.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text NOT NULL,
  host_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT rooms_room_code_format_chk CHECK (
    room_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'
  ),
  CONSTRAINT rooms_status_chk CHECK (
    status IN ('waiting', 'playing', 'finished', 'abandoned')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS rooms_room_code_uidx
  ON public.rooms (room_code);

CREATE INDEX IF NOT EXISTS rooms_host_user_id_idx
  ON public.rooms (host_user_id);

CREATE INDEX IF NOT EXISTS rooms_status_expires_idx
  ON public.rooms (status, expires_at);

CREATE TABLE IF NOT EXISTS public.room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  player_number integer NOT NULL,
  is_ready boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_players_display_name_chk CHECK (
    char_length(btrim(display_name)) BETWEEN 2 AND 16
  ),
  CONSTRAINT room_players_player_number_chk CHECK (player_number IN (1, 2)),
  CONSTRAINT room_players_room_user_uidx UNIQUE (room_id, user_id),
  CONSTRAINT room_players_room_number_uidx UNIQUE (room_id, player_number)
);

CREATE INDEX IF NOT EXISTS room_players_user_id_idx
  ON public.room_players (user_id);

CREATE INDEX IF NOT EXISTS room_players_room_id_idx
  ON public.room_players (room_id);

-- ---------------------------------------------------------------------------
-- Helpers (security definer)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._mp_require_auth()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;
  RETURN uid;
END;
$$;

CREATE OR REPLACE FUNCTION public._mp_normalize_display_name(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned text;
BEGIN
  cleaned := btrim(regexp_replace(coalesce(raw, ''), '\s+', ' ', 'g'));
  IF char_length(cleaned) < 2 OR char_length(cleaned) > 16 THEN
    RAISE EXCEPTION 'INVALID_DISPLAY_NAME' USING ERRCODE = 'P0001';
  END IF;
  IF cleaned !~ '^[A-Za-z0-9][A-Za-z0-9 ._''-]*$' THEN
    RAISE EXCEPTION 'INVALID_DISPLAY_NAME' USING ERRCODE = 'P0001';
  END IF;
  RETURN cleaned;
END;
$$;

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
    FOR i IN 1..6 LOOP
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

-- ---------------------------------------------------------------------------
-- Secure RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_room(display_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := public._mp_require_auth();
  name text := public._mp_normalize_display_name(display_name);
  new_code text;
  new_room public.rooms%ROWTYPE;
  new_player public.room_players%ROWTYPE;
BEGIN
  new_code := public._mp_generate_room_code();

  INSERT INTO public.rooms (room_code, host_user_id, status, expires_at)
  VALUES (new_code, uid, 'waiting', now() + interval '1 hour')
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
    'player_id', new_player.id,
    'player_number', new_player.player_number,
    'display_name', new_player.display_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.join_room(room_code text, display_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := public._mp_require_auth();
  name text := public._mp_normalize_display_name(display_name);
  code text := upper(btrim(coalesce(room_code, '')));
  target public.rooms%ROWTYPE;
  existing public.room_players%ROWTYPE;
  player_count integer;
  new_player public.room_players%ROWTYPE;
BEGIN
  IF code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' THEN
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
    UPDATE public.rooms SET status = 'abandoned' WHERE id = target.id AND status = 'waiting';
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
  VALUES (target.id, uid, name, 2, false)
  RETURNING * INTO new_player;

  RETURN jsonb_build_object(
    'room_id', target.id,
    'room_code', target.room_code,
    'host_user_id', target.host_user_id,
    'status', target.status,
    'expires_at', target.expires_at,
    'player_id', new_player.id,
    'player_number', new_player.player_number,
    'display_name', new_player.display_name,
    'rejoined', false
  );
END;
$$;

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

  IF remaining = 0 OR me.user_id = target.host_user_id THEN
    UPDATE public.rooms
    SET status = 'abandoned'
    WHERE id = target.id
      AND status IN ('waiting', 'playing');
  ELSE
    -- Guest left: reset ready flags so the host waits cleanly for a new opponent.
    UPDATE public.room_players
    SET is_ready = false
    WHERE room_id = target.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'room_id', target.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_player_ready(room_id uuid, ready boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := public._mp_require_auth();
  target public.rooms%ROWTYPE;
  me public.room_players%ROWTYPE;
BEGIN
  SELECT * INTO target
  FROM public.rooms r
  WHERE r.id = set_player_ready.room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF target.expires_at <= now() THEN
    UPDATE public.rooms SET status = 'abandoned' WHERE id = target.id AND status = 'waiting';
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

  RETURN jsonb_build_object(
    'room_id', target.id,
    'player_id', me.id,
    'player_number', me.player_number,
    'is_ready', me.is_ready
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rooms_select_member ON public.rooms;
CREATE POLICY rooms_select_member
  ON public.rooms
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.room_players rp
      WHERE rp.room_id = rooms.id
        AND rp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS room_players_select_member ON public.room_players;
CREATE POLICY room_players_select_member
  ON public.room_players
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.room_players me
      WHERE me.room_id = room_players.room_id
        AND me.user_id = auth.uid()
    )
  );

-- No direct INSERT/UPDATE/DELETE policies — mutations go through RPCs only.

REVOKE ALL ON TABLE public.rooms FROM PUBLIC;
REVOKE ALL ON TABLE public.room_players FROM PUBLIC;
REVOKE ALL ON TABLE public.rooms FROM anon;
REVOKE ALL ON TABLE public.room_players FROM anon;
REVOKE ALL ON TABLE public.rooms FROM authenticated;
REVOKE ALL ON TABLE public.room_players FROM authenticated;

GRANT SELECT ON TABLE public.rooms TO authenticated;
GRANT SELECT ON TABLE public.room_players TO authenticated;

REVOKE ALL ON FUNCTION public._mp_require_auth() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._mp_normalize_display_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._mp_generate_room_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_room(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_room(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_room(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_player_ready(uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_room(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_player_ready(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'room_players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
  END IF;
END $$;
