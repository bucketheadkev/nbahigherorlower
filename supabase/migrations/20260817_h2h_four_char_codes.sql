-- Repair: convert the full 1V1 room-code flow to exactly 4 characters.
-- Run this in the Supabase SQL Editor on existing projects.

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
