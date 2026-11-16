-- Classic $1B wins leaderboard (weekly + all-time).
-- A win = a verified Classic run with verified_value >= 1_000_000_000.
-- Source table: user_leaderboard_runs (written by submit_classic_leaderboard_lineup).
-- Apply manually in the Supabase SQL Editor after 20260923_classic_leaderboard.sql.
-- Exposes username + win count only (never email / user_id).

CREATE INDEX IF NOT EXISTS user_leaderboard_runs_win_achieved_idx
  ON public.user_leaderboard_runs (achieved_at DESC)
  WHERE verified_value >= 1000000000;

CREATE INDEX IF NOT EXISTS user_leaderboard_runs_win_user_idx
  ON public.user_leaderboard_runs (user_id)
  WHERE verified_value >= 1000000000;

-- ---------------------------------------------------------------------------
-- All-time wins (top N)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_classic_wins_all_time(p_limit integer DEFAULT 100)
RETURNS TABLE (
  rank bigint,
  username text,
  wins bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH tallies AS (
    SELECT
      r.user_id,
      count(*)::bigint AS win_count
    FROM public.user_leaderboard_runs r
    WHERE r.verified_value >= 1000000000
    GROUP BY r.user_id
  )
  SELECT
    row_number() OVER (ORDER BY t.win_count DESC, p.username_normalized ASC) AS rank,
    p.username,
    t.win_count AS wins
  FROM tallies t
  INNER JOIN public.profiles p ON p.user_id = t.user_id
  WHERE t.win_count > 0
  ORDER BY t.win_count DESC, p.username_normalized ASC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 100), 200));
$$;

REVOKE ALL ON FUNCTION public.get_classic_wins_all_time(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_classic_wins_all_time(integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Weekly wins — ISO week in UTC (Monday 00:00 UTC → next Monday)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_classic_wins_weekly(p_limit integer DEFAULT 100)
RETURNS TABLE (
  rank bigint,
  username text,
  wins bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH tallies AS (
    SELECT
      r.user_id,
      count(*)::bigint AS win_count
    FROM public.user_leaderboard_runs r
    WHERE r.verified_value >= 1000000000
      AND r.achieved_at >= (date_trunc('week', timezone('utc', now())) AT TIME ZONE 'UTC')
    GROUP BY r.user_id
  )
  SELECT
    row_number() OVER (ORDER BY t.win_count DESC, p.username_normalized ASC) AS rank,
    p.username,
    t.win_count AS wins
  FROM tallies t
  INNER JOIN public.profiles p ON p.user_id = t.user_id
  WHERE t.win_count > 0
  ORDER BY t.win_count DESC, p.username_normalized ASC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 100), 200));
$$;

REVOKE ALL ON FUNCTION public.get_classic_wins_weekly(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_classic_wins_weekly(integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signed-in player's all-time wins + rank
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_classic_wins_all_time()
RETURNS TABLE (
  rank bigint,
  username text,
  wins bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wins bigint;
  v_username text;
  v_normalized text;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RETURN;
  END IF;

  SELECT p.username, p.username_normalized
  INTO v_username, v_normalized
  FROM public.profiles p
  WHERE p.user_id = v_uid;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*)::bigint
  INTO v_wins
  FROM public.user_leaderboard_runs r
  WHERE r.user_id = v_uid
    AND r.verified_value >= 1000000000;

  IF coalesce(v_wins, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT 1 + count(*)::bigint INTO rank
  FROM (
    SELECT
      r.user_id,
      count(*)::bigint AS win_count,
      min(op.username_normalized) AS uname
    FROM public.user_leaderboard_runs r
    INNER JOIN public.profiles op ON op.user_id = r.user_id
    WHERE r.verified_value >= 1000000000
    GROUP BY r.user_id
  ) ahead
  WHERE ahead.win_count > v_wins
     OR (ahead.win_count = v_wins AND ahead.uname < v_normalized);

  username := v_username;
  wins := v_wins;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_classic_wins_all_time() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_classic_wins_all_time() TO authenticated;

-- ---------------------------------------------------------------------------
-- Signed-in player's weekly wins + rank
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_classic_wins_weekly()
RETURNS TABLE (
  rank bigint,
  username text,
  wins bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wins bigint;
  v_username text;
  v_normalized text;
  v_week_start timestamptz := (date_trunc('week', timezone('utc', now())) AT TIME ZONE 'UTC');
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RETURN;
  END IF;

  SELECT p.username, p.username_normalized
  INTO v_username, v_normalized
  FROM public.profiles p
  WHERE p.user_id = v_uid;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*)::bigint
  INTO v_wins
  FROM public.user_leaderboard_runs r
  WHERE r.user_id = v_uid
    AND r.verified_value >= 1000000000
    AND r.achieved_at >= v_week_start;

  IF coalesce(v_wins, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT 1 + count(*)::bigint INTO rank
  FROM (
    SELECT
      r.user_id,
      count(*)::bigint AS win_count,
      min(op.username_normalized) AS uname
    FROM public.user_leaderboard_runs r
    INNER JOIN public.profiles op ON op.user_id = r.user_id
    WHERE r.verified_value >= 1000000000
      AND r.achieved_at >= v_week_start
    GROUP BY r.user_id
  ) ahead
  WHERE ahead.win_count > v_wins
     OR (ahead.win_count = v_wins AND ahead.uname < v_normalized);

  username := v_username;
  wins := v_wins;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_classic_wins_weekly() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_classic_wins_weekly() TO authenticated;
