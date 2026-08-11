-- Phase 3A: private 1V1 match progress + results (MVP).
-- Additive only. Safe on a DB that already applied Phase 1–2 patches.
-- Does not disable RLS. Does not grant anon/public table access.
--
-- ANTI-CHEAT LIMITATION (MVP):
-- Clients submit lineup JSON and total_value. The server verifies membership,
-- room status, one-shot submit, five-entry shape, and that total_value matches
-- the sum of lineup dollarValue fields. A malicious client can still inflate
-- both the lineup values and the total together. Winner is always derived from
-- the two stored totals (no client-supplied winner_user_id).

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.room_players
  ADD COLUMN IF NOT EXISTS match_progress integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'room_players_match_progress_chk'
  ) THEN
    ALTER TABLE public.room_players
      ADD CONSTRAINT room_players_match_progress_chk
      CHECK (match_progress BETWEEN 0 AND 5);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  lineup jsonb NOT NULL,
  total_value bigint NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_results_lineup_array_chk CHECK (jsonb_typeof(lineup) = 'array'),
  CONSTRAINT match_results_lineup_len_chk CHECK (jsonb_array_length(lineup) = 5),
  CONSTRAINT match_results_total_nonneg_chk CHECK (total_value >= 0),
  CONSTRAINT match_results_room_user_uidx UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS match_results_room_id_idx
  ON public.match_results (room_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_results_select_member ON public.match_results;
CREATE POLICY match_results_select_member
  ON public.match_results
  FOR SELECT
  TO authenticated
  USING (public.is_room_member(room_id));

REVOKE ALL ON TABLE public.match_results FROM PUBLIC;
REVOKE ALL ON TABLE public.match_results FROM anon;
REVOKE ALL ON TABLE public.match_results FROM authenticated;
GRANT SELECT ON TABLE public.match_results TO authenticated;

-- ---------------------------------------------------------------------------
-- update_match_progress(room_id, player_count)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_match_progress(
  room_id uuid,
  player_count integer
)
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
  IF room_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF player_count IS NULL OR player_count < 0 OR player_count > 5 THEN
    RAISE EXCEPTION 'INVALID_PROGRESS' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO target
  FROM public.rooms r
  WHERE r.id = update_match_progress.room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF target.status IS DISTINCT FROM 'playing' THEN
    RAISE EXCEPTION 'ROOM_NOT_PLAYING' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO me
  FROM public.room_players rp
  WHERE rp.room_id = target.id
    AND rp.user_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  IF player_count < me.match_progress THEN
    RAISE EXCEPTION 'PROGRESS_DECREASE' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.room_players
  SET match_progress = player_count
  WHERE id = me.id
  RETURNING * INTO me;

  RETURN jsonb_build_object(
    'room_id', target.id,
    'user_id', me.user_id,
    'match_progress', me.match_progress
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- submit_match_result(room_id, lineup, total_value)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_match_result(
  room_id uuid,
  lineup jsonb,
  total_value bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := public._mp_require_auth();
  target public.rooms%ROWTYPE;
  me public.room_players%ROWTYPE;
  existing public.match_results%ROWTYPE;
  inserted public.match_results%ROWTYPE;
  lineup_sum numeric;
  result_count integer;
BEGIN
  IF room_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF lineup IS NULL
     OR jsonb_typeof(lineup) <> 'array'
     OR jsonb_array_length(lineup) <> 5 THEN
    RAISE EXCEPTION 'INVALID_LINEUP' USING ERRCODE = 'P0001';
  END IF;

  IF total_value IS NULL OR total_value < 0 THEN
    RAISE EXCEPTION 'INVALID_TOTAL' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(sum((elem->>'dollarValue')::numeric), 0)
  INTO lineup_sum
  FROM jsonb_array_elements(lineup) AS elem;

  IF abs(lineup_sum - total_value::numeric) > 0.51 THEN
    RAISE EXCEPTION 'INVALID_TOTAL' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO target
  FROM public.rooms r
  WHERE r.id = submit_match_result.room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF target.status IS DISTINCT FROM 'playing' THEN
    RAISE EXCEPTION 'ROOM_NOT_PLAYING' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO existing
  FROM public.match_results mr
  WHERE mr.room_id = target.id
    AND mr.user_id = uid;

  IF FOUND THEN
    RAISE EXCEPTION 'ALREADY_SUBMITTED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO me
  FROM public.room_players rp
  WHERE rp.room_id = target.id
    AND rp.user_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.match_results (room_id, user_id, lineup, total_value)
  VALUES (target.id, uid, lineup, total_value)
  RETURNING * INTO inserted;

  UPDATE public.room_players
  SET match_progress = 5
  WHERE id = me.id;

  SELECT count(*)::integer INTO result_count
  FROM public.match_results mr
  WHERE mr.room_id = target.id;

  IF result_count >= 2 THEN
    UPDATE public.rooms
    SET status = 'finished'
    WHERE id = target.id
      AND status = 'playing';
  END IF;

  RETURN jsonb_build_object(
    'id', inserted.id,
    'room_id', inserted.room_id,
    'user_id', inserted.user_id,
    'total_value', inserted.total_value,
    'submitted_at', inserted.submitted_at,
    'result_count', result_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_match_progress(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_match_progress(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.submit_match_result(uuid, jsonb, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_match_result(uuid, jsonb, bigint) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_match_progress(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_match_result(uuid, jsonb, bigint) TO authenticated;

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
      AND tablename = 'match_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_results;
  END IF;
END $$;
