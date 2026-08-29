-- Position-based synchronized 1V1 (PG→C). Additive and rerunnable.
-- Safe after a partial apply that created tables/functions before lock_h2h_pick.
-- Never uses unquoted `position` as a SQL identifier (reserved).
-- Server is the source of truth for matchup results. No client-supplied winner.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.h2h_matches (
  room_id uuid PRIMARY KEY REFERENCES public.rooms (id) ON DELETE CASCADE,
  p1_user_id uuid NOT NULL REFERENCES auth.users (id),
  p2_user_id uuid NOT NULL REFERENCES auth.users (id),
  current_position text NOT NULL DEFAULT 'PG',
  phase text NOT NULL DEFAULT 'selecting',
  p1_total bigint NOT NULL DEFAULT 0,
  p2_total bigint NOT NULL DEFAULT 0,
  p1_continue boolean NOT NULL DEFAULT false,
  p2_continue boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT h2h_matches_position_chk CHECK (
    current_position IN ('PG', 'SG', 'SF', 'PF', 'C')
  ),
  CONSTRAINT h2h_matches_phase_chk CHECK (
    phase IN ('selecting', 'reveal', 'finished')
  )
);

CREATE TABLE IF NOT EXISTS public.h2h_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  player_position text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  player_number integer NOT NULL,
  selection jsonb NOT NULL,
  raw_value bigint NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT h2h_picks_player_position_chk CHECK (
    player_position IN ('PG', 'SG', 'SF', 'PF', 'C')
  ),
  CONSTRAINT h2h_picks_player_number_chk CHECK (player_number IN (1, 2)),
  CONSTRAINT h2h_picks_raw_nonneg_chk CHECK (raw_value >= 0),
  CONSTRAINT h2h_picks_room_pos_user_uidx UNIQUE (room_id, player_position, user_id)
);

CREATE TABLE IF NOT EXISTS public.h2h_rounds (
  room_id uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  player_position text NOT NULL,
  matchup_resolved boolean NOT NULL DEFAULT false,
  matchup_winner text,
  p1_raw_value bigint,
  p2_raw_value bigint,
  p1_adjusted_value bigint,
  p2_adjusted_value bigint,
  p1_total bigint,
  p2_total bigint,
  p1_selection jsonb,
  p2_selection jsonb,
  resolved_at timestamptz,
  CONSTRAINT h2h_rounds_pk PRIMARY KEY (room_id, player_position),
  CONSTRAINT h2h_rounds_player_position_chk CHECK (
    player_position IN ('PG', 'SG', 'SF', 'PF', 'C')
  ),
  CONSTRAINT h2h_rounds_winner_chk CHECK (
    matchup_winner IS NULL OR matchup_winner IN ('p1', 'p2', 'tie')
  )
);

-- Partial apply may have created these tables with reserved column name `position`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'h2h_picks' AND column_name = 'position'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'h2h_picks' AND column_name = 'player_position'
  ) THEN
    ALTER TABLE public.h2h_picks RENAME COLUMN "position" TO player_position;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'h2h_rounds' AND column_name = 'position'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'h2h_rounds' AND column_name = 'player_position'
  ) THEN
    ALTER TABLE public.h2h_rounds RENAME COLUMN "position" TO player_position;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS h2h_picks_room_pos_idx
  ON public.h2h_picks (room_id, player_position);

-- ---------------------------------------------------------------------------
-- Penalty (SQL mirror of calculateHeadToHeadPenalty)
-- Temporary default: 37.5% of the value gap. Isolated for later tuning.
-- ---------------------------------------------------------------------------

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
  IF winner_value IS NULL OR loser_value IS NULL THEN
    RETURN 0;
  END IF;
  IF winner_value <= loser_value THEN
    RETURN 0;
  END IF;
  RETURN round((winner_value - loser_value)::numeric * 0.375)::bigint;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_head_to_head_penalty(bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_head_to_head_penalty(bigint, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.calculate_head_to_head_penalty(bigint, bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- init_h2h_match
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.init_h2h_match(room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := public._mp_require_auth();
  target public.rooms%ROWTYPE;
  host_id uuid;
  guest_id uuid;
  slot text;
BEGIN
  SELECT * INTO target FROM public.rooms r WHERE r.id = init_h2h_match.room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_room_member(target.id) THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  SELECT rp.user_id INTO host_id
  FROM public.room_players rp
  WHERE rp.room_id = target.id AND rp.player_number = 1;

  SELECT rp.user_id INTO guest_id
  FROM public.room_players rp
  WHERE rp.room_id = target.id AND rp.player_number = 2;

  IF host_id IS NULL OR guest_id IS NULL THEN
    RAISE EXCEPTION 'NEED_TWO_PLAYERS' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.h2h_matches (
    room_id, p1_user_id, p2_user_id, current_position, phase
  )
  VALUES (target.id, host_id, guest_id, 'PG', 'selecting')
  ON CONFLICT (room_id) DO NOTHING;

  FOREACH slot IN ARRAY ARRAY['PG', 'SG', 'SF', 'PF', 'C'] LOOP
    INSERT INTO public.h2h_rounds (room_id, player_position)
    VALUES (target.id, slot)
    ON CONFLICT (room_id, player_position) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'room_id', target.id, 'caller', uid);
END;
$$;

-- ---------------------------------------------------------------------------
-- lock_h2h_pick — private lock; resolves once when both are locked
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.lock_h2h_pick(uuid, text, jsonb, bigint);

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
DECLARE
  uid uuid := public._mp_require_auth();
  target public.rooms%ROWTYPE;
  match public.h2h_matches%ROWTYPE;
  me public.room_players%ROWTYPE;
  pick_count integer;
  p1 public.h2h_picks%ROWTYPE;
  p2 public.h2h_picks%ROWTYPE;
  winner text;
  penalty bigint;
  p1_adj bigint;
  p2_adj bigint;
  next_p1_total bigint;
  next_p2_total bigint;
  sel_pos text;
  slot text := player_position;
BEGIN
  IF room_id IS NULL OR slot IS NULL THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF slot NOT IN ('PG', 'SG', 'SF', 'PF', 'C') THEN
    RAISE EXCEPTION 'INVALID_POSITION' USING ERRCODE = 'P0001';
  END IF;

  IF selection IS NULL OR jsonb_typeof(selection) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_SELECTION' USING ERRCODE = 'P0001';
  END IF;

  IF raw_value IS NULL OR raw_value < 0 THEN
    RAISE EXCEPTION 'INVALID_TOTAL' USING ERRCODE = 'P0001';
  END IF;

  sel_pos := upper(btrim(coalesce(selection->>'position', '')));
  IF sel_pos IS DISTINCT FROM slot THEN
    RAISE EXCEPTION 'INVALID_POSITION' USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(btrim(selection->>'name'), '') = '' THEN
    RAISE EXCEPTION 'INVALID_SELECTION' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO target FROM public.rooms r WHERE r.id = lock_h2h_pick.room_id FOR UPDATE;
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

  SELECT * INTO match
  FROM public.h2h_matches m
  WHERE m.room_id = target.id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.init_h2h_match(target.id);
    SELECT * INTO match FROM public.h2h_matches m WHERE m.room_id = target.id FOR UPDATE;
  END IF;

  IF match.phase IS DISTINCT FROM 'selecting' THEN
    RAISE EXCEPTION 'WRONG_PHASE' USING ERRCODE = 'P0001';
  END IF;

  IF match.current_position IS DISTINCT FROM slot THEN
    RAISE EXCEPTION 'WRONG_POSITION' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.h2h_picks (
    room_id, player_position, user_id, player_number, selection, raw_value
  )
  VALUES (
    target.id,
    slot,
    uid,
    me.player_number,
    selection,
    raw_value
  )
  ON CONFLICT (room_id, player_position, user_id) DO NOTHING;

  GET DIAGNOSTICS pick_count = ROW_COUNT;
  IF pick_count = 0 THEN
    RAISE EXCEPTION 'ALREADY_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer INTO pick_count
  FROM public.h2h_picks pk
  WHERE pk.room_id = target.id AND pk.player_position = slot;

  IF pick_count < 2 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'locked', true,
      'waiting', true,
      'position', slot
    );
  END IF;

  -- Both locked: resolve exactly once.
  PERFORM 1
  FROM public.h2h_rounds rd
  WHERE rd.room_id = target.id AND rd.player_position = slot
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.h2h_rounds rd
    WHERE rd.room_id = target.id AND rd.player_position = slot AND rd.matchup_resolved
  ) THEN
    RETURN jsonb_build_object('ok', true, 'locked', true, 'resolved', true, 'position', slot);
  END IF;

  SELECT * INTO p1
  FROM public.h2h_picks pk
  WHERE pk.room_id = target.id AND pk.player_position = slot AND pk.player_number = 1;

  SELECT * INTO p2
  FROM public.h2h_picks pk
  WHERE pk.room_id = target.id AND pk.player_position = slot AND pk.player_number = 2;

  IF p1.id IS NULL OR p2.id IS NULL THEN
    RAISE EXCEPTION 'NEED_TWO_PLAYERS' USING ERRCODE = 'P0001';
  END IF;

  IF p1.raw_value > p2.raw_value THEN
    winner := 'p1';
    penalty := public.calculate_head_to_head_penalty(p1.raw_value, p2.raw_value);
    p1_adj := p1.raw_value;
    p2_adj := GREATEST(0, p2.raw_value - penalty);
  ELSIF p2.raw_value > p1.raw_value THEN
    winner := 'p2';
    penalty := public.calculate_head_to_head_penalty(p2.raw_value, p1.raw_value);
    p2_adj := p2.raw_value;
    p1_adj := GREATEST(0, p1.raw_value - penalty);
  ELSE
    winner := 'tie';
    p1_adj := p1.raw_value;
    p2_adj := p2.raw_value;
  END IF;

  next_p1_total := match.p1_total + p1_adj;
  next_p2_total := match.p2_total + p2_adj;

  UPDATE public.h2h_rounds
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
  WHERE room_id = target.id AND player_position = slot;

  UPDATE public.h2h_matches
  SET
    phase = 'reveal',
    p1_total = next_p1_total,
    p2_total = next_p2_total,
    p1_continue = false,
    p2_continue = false,
    updated_at = now()
  WHERE room_id = target.id;

  RETURN jsonb_build_object(
    'ok', true,
    'locked', true,
    'resolved', true,
    'position', slot,
    'winner', winner
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- ack_h2h_continue — both clients must ack before advancing
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ack_h2h_continue(room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := public._mp_require_auth();
  match public.h2h_matches%ROWTYPE;
  me_is_p1 boolean;
  both_ready boolean;
  next_pos text;
  order_arr text[] := ARRAY['PG', 'SG', 'SF', 'PF', 'C'];
  idx integer;
BEGIN
  SELECT * INTO match FROM public.h2h_matches m WHERE m.room_id = ack_h2h_continue.room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF uid IS DISTINCT FROM match.p1_user_id AND uid IS DISTINCT FROM match.p2_user_id THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  IF match.phase IS DISTINCT FROM 'reveal' THEN
    RAISE EXCEPTION 'WRONG_PHASE' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.h2h_rounds rd
    WHERE rd.room_id = match.room_id
      AND rd.player_position = match.current_position
      AND rd.matchup_resolved
  ) THEN
    RAISE EXCEPTION 'ROUND_NOT_RESOLVED' USING ERRCODE = 'P0001';
  END IF;

  me_is_p1 := uid = match.p1_user_id;

  IF me_is_p1 THEN
    UPDATE public.h2h_matches SET p1_continue = true, updated_at = now() WHERE room_id = match.room_id;
  ELSE
    UPDATE public.h2h_matches SET p2_continue = true, updated_at = now() WHERE room_id = match.room_id;
  END IF;

  SELECT (p1_continue AND p2_continue) INTO both_ready
  FROM public.h2h_matches WHERE room_id = match.room_id;

  IF NOT both_ready THEN
    RETURN jsonb_build_object('ok', true, 'waiting', true, 'position', match.current_position);
  END IF;

  idx := array_position(order_arr, match.current_position);
  IF idx IS NULL OR idx >= 5 THEN
    UPDATE public.h2h_matches
    SET phase = 'finished', updated_at = now()
    WHERE room_id = match.room_id;

    UPDATE public.rooms
    SET status = 'finished'
    WHERE id = match.room_id AND status = 'playing';

    RETURN jsonb_build_object('ok', true, 'finished', true);
  END IF;

  next_pos := order_arr[idx + 1];

  UPDATE public.h2h_matches
  SET
    current_position = next_pos,
    phase = 'selecting',
    p1_continue = false,
    p2_continue = false,
    updated_at = now()
  WHERE room_id = match.room_id;

  RETURN jsonb_build_object('ok', true, 'advanced', true, 'position', next_pos);
END;
$$;

-- ---------------------------------------------------------------------------
-- get_h2h_state — privacy: opponent selection hidden until resolved
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_h2h_state(room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := public._mp_require_auth();
  match public.h2h_matches%ROWTYPE;
  me_num integer;
  my_pick public.h2h_picks%ROWTYPE;
  opp_locked boolean;
  current_round public.h2h_rounds%ROWTYPE;
  rounds jsonb;
BEGIN
  SELECT * INTO match FROM public.h2h_matches m WHERE m.room_id = get_h2h_state.room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF uid IS DISTINCT FROM match.p1_user_id AND uid IS DISTINCT FROM match.p2_user_id THEN
    RAISE EXCEPTION 'NOT_IN_ROOM' USING ERRCODE = 'P0001';
  END IF;

  me_num := CASE WHEN uid = match.p1_user_id THEN 1 ELSE 2 END;

  SELECT * INTO my_pick
  FROM public.h2h_picks pk
  WHERE pk.room_id = match.room_id
    AND pk.player_position = match.current_position
    AND pk.user_id = uid;

  SELECT EXISTS (
    SELECT 1 FROM public.h2h_picks pk
    WHERE pk.room_id = match.room_id
      AND pk.player_position = match.current_position
      AND pk.user_id <> uid
  ) INTO opp_locked;

  SELECT * INTO current_round
  FROM public.h2h_rounds rd
  WHERE rd.room_id = match.room_id AND rd.player_position = match.current_position;

  SELECT coalesce(jsonb_agg(to_jsonb(rd) ORDER BY
    CASE rd.player_position WHEN 'PG' THEN 1 WHEN 'SG' THEN 2 WHEN 'SF' THEN 3 WHEN 'PF' THEN 4 ELSE 5 END
  ), '[]'::jsonb)
  INTO rounds
  FROM public.h2h_rounds rd
  WHERE rd.room_id = match.room_id AND rd.matchup_resolved;

  RETURN jsonb_build_object(
    'room_id', match.room_id,
    'current_position', match.current_position,
    'phase', match.phase,
    'p1_user_id', match.p1_user_id,
    'p2_user_id', match.p2_user_id,
    'p1_total', match.p1_total,
    'p2_total', match.p2_total,
    'p1_continue', match.p1_continue,
    'p2_continue', match.p2_continue,
    'my_player_number', me_num,
    'my_locked', my_pick.id IS NOT NULL,
    'opponent_locked', opp_locked,
    'my_pick', CASE WHEN my_pick.id IS NULL THEN NULL ELSE to_jsonb(my_pick) END,
    'current_round', CASE
      WHEN current_round.matchup_resolved THEN to_jsonb(current_round)
      ELSE jsonb_build_object(
        'position', match.current_position,
        'player_position', match.current_position,
        'matchup_resolved', false
      )
    END,
    'resolved_rounds', rounds
  );
END;
$$;

-- Hook start_room so a new match always initializes lineup-slot state.
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

  SELECT * INTO target FROM public.rooms r WHERE r.id = start_room.room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF target.host_user_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'NOT_HOST' USING ERRCODE = 'P0001';
  END IF;

  IF target.expires_at <= now() THEN
    UPDATE public.rooms SET status = 'abandoned' WHERE id = target.id AND status = 'waiting';
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

  SELECT count(*)::integer, count(*) FILTER (WHERE rp.is_ready)::integer
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
  SET status = 'playing', started_at = coalesce(started_at, now())
  WHERE id = target.id
  RETURNING * INTO target;

  PERFORM public.init_h2h_match(target.id);

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

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.h2h_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.h2h_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.h2h_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS h2h_matches_select_member ON public.h2h_matches;
CREATE POLICY h2h_matches_select_member
  ON public.h2h_matches FOR SELECT TO authenticated
  USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS h2h_picks_select_private ON public.h2h_picks;
CREATE POLICY h2h_picks_select_private
  ON public.h2h_picks FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.h2h_rounds rd
      WHERE rd.room_id = h2h_picks.room_id
        AND rd.player_position = h2h_picks.player_position
        AND rd.matchup_resolved
        AND public.is_room_member(h2h_picks.room_id)
    )
  );

DROP POLICY IF EXISTS h2h_rounds_select_member ON public.h2h_rounds;
CREATE POLICY h2h_rounds_select_member
  ON public.h2h_rounds FOR SELECT TO authenticated
  USING (public.is_room_member(room_id));

REVOKE ALL ON TABLE public.h2h_matches FROM PUBLIC;
REVOKE ALL ON TABLE public.h2h_matches FROM anon;
REVOKE ALL ON TABLE public.h2h_matches FROM authenticated;
REVOKE ALL ON TABLE public.h2h_picks FROM PUBLIC;
REVOKE ALL ON TABLE public.h2h_picks FROM anon;
REVOKE ALL ON TABLE public.h2h_picks FROM authenticated;
REVOKE ALL ON TABLE public.h2h_rounds FROM PUBLIC;
REVOKE ALL ON TABLE public.h2h_rounds FROM anon;
REVOKE ALL ON TABLE public.h2h_rounds FROM authenticated;
GRANT SELECT ON TABLE public.h2h_matches TO authenticated;
GRANT SELECT ON TABLE public.h2h_picks TO authenticated;
GRANT SELECT ON TABLE public.h2h_rounds TO authenticated;

REVOKE ALL ON FUNCTION public.init_h2h_match(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.init_h2h_match(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.lock_h2h_pick(uuid, text, jsonb, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_h2h_pick(uuid, text, jsonb, bigint) FROM anon;
REVOKE ALL ON FUNCTION public.ack_h2h_continue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ack_h2h_continue(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_h2h_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_h2h_state(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.init_h2h_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_h2h_pick(uuid, text, jsonb, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ack_h2h_continue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_h2h_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_room(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'h2h_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.h2h_matches;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'h2h_picks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.h2h_picks;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'h2h_rounds'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.h2h_rounds;
  END IF;
END $$;
