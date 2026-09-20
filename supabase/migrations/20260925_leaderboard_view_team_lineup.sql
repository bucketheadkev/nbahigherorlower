-- 1) Install View Team RPCs (force replace)
-- 2) Clear the current 1BRun public leaderboard spot so you can retest fresh
-- Run this entire file once in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- View Team / lineup RPCs
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_classic_leaderboard_top(integer);
DROP FUNCTION IF EXISTS public.get_my_classic_leaderboard_rank();
DROP FUNCTION IF EXISTS public.get_classic_leaderboard_team(text);

CREATE FUNCTION public.get_classic_leaderboard_top(p_limit integer DEFAULT 100)
RETURNS TABLE (
  rank bigint,
  username text,
  verified_best bigint,
  achieved_at timestamptz,
  lineup jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    row_number() OVER (
      ORDER BY lb.verified_best DESC, lb.achieved_at ASC, lb.user_id ASC
    ) AS rank,
    p.username,
    lb.verified_best,
    lb.achieved_at,
    coalesce(run.lineup, '[]'::jsonb) AS lineup
  FROM public.user_leaderboard_pb lb
  INNER JOIN public.profiles p ON p.user_id = lb.user_id
  LEFT JOIN public.user_leaderboard_runs run ON run.id = lb.best_run_id
  WHERE lb.verified_best > 0
  ORDER BY lb.verified_best DESC, lb.achieved_at ASC, lb.user_id ASC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 100), 200));
$$;

REVOKE ALL ON FUNCTION public.get_classic_leaderboard_top(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_classic_leaderboard_top(integer) TO anon, authenticated;

CREATE FUNCTION public.get_my_classic_leaderboard_rank()
RETURNS TABLE (
  rank bigint,
  username text,
  verified_best bigint,
  achieved_at timestamptz,
  lineup jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_best bigint;
  v_at timestamptz;
  v_username text;
  v_rank bigint;
  v_lineup jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RETURN;
  END IF;

  SELECT lb.verified_best, lb.achieved_at, p.username, coalesce(run.lineup, '[]'::jsonb)
  INTO v_best, v_at, v_username, v_lineup
  FROM public.user_leaderboard_pb lb
  INNER JOIN public.profiles p ON p.user_id = lb.user_id
  LEFT JOIN public.user_leaderboard_runs run ON run.id = lb.best_run_id
  WHERE lb.user_id = v_uid AND lb.verified_best > 0;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT 1 + count(*)::bigint INTO v_rank
  FROM public.user_leaderboard_pb other
  INNER JOIN public.profiles op ON op.user_id = other.user_id
  WHERE other.verified_best > 0
    AND (
      other.verified_best > v_best
      OR (other.verified_best = v_best AND other.achieved_at < v_at)
      OR (
        other.verified_best = v_best
        AND other.achieved_at = v_at
        AND other.user_id < v_uid
      )
    );

  rank := v_rank;
  username := v_username;
  verified_best := v_best;
  achieved_at := v_at;
  lineup := v_lineup;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_classic_leaderboard_rank() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_classic_leaderboard_rank() TO authenticated;

CREATE FUNCTION public.get_classic_leaderboard_team(p_username text)
RETURNS TABLE (
  username text,
  verified_best bigint,
  achieved_at timestamptz,
  lineup jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.username,
    lb.verified_best,
    lb.achieved_at,
    coalesce(run.lineup, '[]'::jsonb) AS lineup
  FROM public.profiles p
  INNER JOIN public.user_leaderboard_pb lb ON lb.user_id = p.user_id
  LEFT JOIN public.user_leaderboard_runs run ON run.id = lb.best_run_id
  WHERE lower(p.username) = lower(trim(p_username))
    AND lb.verified_best > 0
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_classic_leaderboard_team(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_classic_leaderboard_team(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Clear 1BRun public leaderboard spot (keeps private Classic PB / My Runs)
-- ---------------------------------------------------------------------------

DELETE FROM public.user_leaderboard_pb lb
USING public.profiles p
WHERE lb.user_id = p.user_id
  AND lower(p.username) = lower('1BRun');

DELETE FROM public.user_leaderboard_runs r
USING public.profiles p
WHERE r.user_id = p.user_id
  AND lower(p.username) = lower('1BRun');
