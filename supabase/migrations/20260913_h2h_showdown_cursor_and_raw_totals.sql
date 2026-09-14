-- Persist the host showdown cursor and stop matchup penalties from
-- making stored totals differ from the five displayed player values.
-- Apply in the Supabase SQL editor before testing 1v1 showdown. Do not deploy from CI yet.

-- The 20260828 numeric overload did not replace the original bigint function,
-- so lock/resolve still subtracted 37.5% of the gap.
CREATE OR REPLACE FUNCTION public.calculate_head_to_head_penalty(
  winner_value bigint,
  loser_value bigint
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 0;
END;
$$;

DROP FUNCTION IF EXISTS public.calculate_head_to_head_penalty(numeric, numeric);

CREATE OR REPLACE FUNCTION public.set_h2h_showdown_cursor(
  room_id uuid,
  started boolean,
  step_index integer,
  finished boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := public._mp_require_auth();
  p_room_id uuid := set_h2h_showdown_cursor.room_id;
  match_row public.h2h_matches%ROWTYPE;
  host_id uuid;
  cfg jsonb;
  current jsonb;
  cur_started boolean;
  cur_index integer;
  cur_finished boolean;
  cur_revision integer;
  next_revision integer;
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

  SELECT r.host_user_id INTO host_id
  FROM public.rooms r
  WHERE r.id = match_row.room_id;

  IF uid IS DISTINCT FROM host_id THEN
    RAISE EXCEPTION 'NOT_HOST' USING ERRCODE = 'P0001';
  END IF;

  IF match_row.phase IS DISTINCT FROM 'finished' THEN
    RAISE EXCEPTION 'WRONG_PHASE' USING ERRCODE = 'P0001';
  END IF;

  IF step_index IS NULL OR step_index < 0 OR step_index > 4 THEN
    RAISE EXCEPTION 'SHOWDOWN_SKIP' USING ERRCODE = 'P0001';
  END IF;

  cfg := coalesce(match_row.mode_config, '{}'::jsonb);
  current := coalesce(cfg->'showdown', '{}'::jsonb);
  cur_started := coalesce((current->>'started')::boolean, false);
  cur_index := coalesce((current->>'index')::integer, 0);
  cur_finished := coalesce((current->>'finished')::boolean, false);
  cur_revision := coalesce((current->>'revision')::integer, 0);

  IF cur_started
     AND cur_started IS NOT DISTINCT FROM started
     AND cur_index = step_index
     AND cur_finished IS NOT DISTINCT FROM finished THEN
    RETURN jsonb_build_object(
      'started', cur_started,
      'index', cur_index,
      'finished', cur_finished,
      'revision', cur_revision
    );
  END IF;

  IF cur_finished THEN
    RAISE EXCEPTION 'SHOWDOWN_STALE' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    (NOT cur_started AND started AND step_index = 0 AND NOT finished)
    OR (
      cur_started
      AND started
      AND NOT finished
      AND NOT cur_finished
      AND step_index = cur_index + 1
    )
    OR (
      cur_started
      AND started
      AND finished
      AND NOT cur_finished
      AND step_index = cur_index
    )
  ) THEN
    RAISE EXCEPTION 'SHOWDOWN_SKIP' USING ERRCODE = 'P0001';
  END IF;

  next_revision := cur_revision + 1;
  cfg := jsonb_set(
    cfg,
    '{showdown}',
    jsonb_build_object(
      'started', true,
      'index', step_index,
      'finished', finished,
      'revision', next_revision
    ),
    true
  );

  UPDATE public.h2h_matches m
  SET mode_config = cfg, updated_at = now()
  WHERE m.room_id = match_row.room_id;

  RETURN jsonb_build_object(
    'started', true,
    'index', step_index,
    'finished', finished,
    'revision', next_revision
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_h2h_showdown_cursor(uuid, boolean, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_h2h_showdown_cursor(uuid, boolean, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_h2h_showdown_cursor(uuid, boolean, integer, boolean) TO authenticated;

-- PostgREST keeps serving the old schema until this runs. Without it,
-- the host start call returns PGRST202 and both players stay on the gate.
NOTIFY pgrst, 'reload schema';
