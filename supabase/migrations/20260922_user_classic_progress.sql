-- Cloud Classic personal best + run history for permanent 1B Run accounts (additive).
-- Does NOT change profiles, achievements, 1v1 tables/RPCs, or anonymous auth.
-- Does NOT store email — private per-user progress only.
--
-- Apply manually via the Supabase SQL Editor when ready.
-- Safe to run once; uses IF NOT EXISTS / OR REPLACE where practical.

-- ---------------------------------------------------------------------------
-- Personal best (+ optional world-rank cache). Mirrors tradeup_best_roster_value_v1.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_classic_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  best_roster_value bigint NOT NULL DEFAULT 0
    CHECK (best_roster_value >= 0),
  -- Best (lowest) world rank ever; 0 = none. Not a public leaderboard.
  best_world_rank integer NOT NULL DEFAULT 0
    CHECK (best_world_rank >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_classic_progress IS
  'Private Classic personal best for permanent accounts. Owner-only RLS. No email.';

COMMENT ON COLUMN public.user_classic_progress.best_roster_value IS
  'Highest finished roster dollar value (mirrors tradeup_best_roster_value_v1).';

COMMENT ON COLUMN public.user_classic_progress.best_world_rank IS
  'Best (lowest) world rank cache; 0 means unset. Not a public ranking table.';

CREATE INDEX IF NOT EXISTS user_classic_progress_updated_at_idx
  ON public.user_classic_progress (updated_at);

CREATE OR REPLACE FUNCTION public.user_classic_progress_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_classic_progress_set_updated_at_trg
  ON public.user_classic_progress;

CREATE TRIGGER user_classic_progress_set_updated_at_trg
  BEFORE UPDATE ON public.user_classic_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.user_classic_progress_set_updated_at();

ALTER TABLE public.user_classic_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_classic_progress_select_own ON public.user_classic_progress;
CREATE POLICY user_classic_progress_select_own
  ON public.user_classic_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_classic_progress_insert_own ON public.user_classic_progress;
CREATE POLICY user_classic_progress_insert_own
  ON public.user_classic_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_classic_progress_update_own ON public.user_classic_progress;
CREATE POLICY user_classic_progress_update_own
  ON public.user_classic_progress
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_classic_progress_delete_own ON public.user_classic_progress;
CREATE POLICY user_classic_progress_delete_own
  ON public.user_classic_progress
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.user_classic_progress FROM PUBLIC;
REVOKE ALL ON TABLE public.user_classic_progress FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_classic_progress
  TO authenticated;

REVOKE ALL ON FUNCTION public.user_classic_progress_set_updated_at() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Classic ≥$1B run history. Mirrors oneb_billion_runs_v1 (jsonb array ≤ 40).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_classic_runs (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Array of BillionRun objects: id, completedAt, teamValue, players[5].
  runs jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(runs) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_classic_runs IS
  'Private Classic My Runs history (≥$1B). Owner-only RLS. Max 40 enforced client-side.';

COMMENT ON COLUMN public.user_classic_runs.runs IS
  'JSON array matching local BillionRun[] (id, completedAt, teamValue, players).';

CREATE INDEX IF NOT EXISTS user_classic_runs_updated_at_idx
  ON public.user_classic_runs (updated_at);

CREATE OR REPLACE FUNCTION public.user_classic_runs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_classic_runs_set_updated_at_trg
  ON public.user_classic_runs;

CREATE TRIGGER user_classic_runs_set_updated_at_trg
  BEFORE UPDATE ON public.user_classic_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.user_classic_runs_set_updated_at();

ALTER TABLE public.user_classic_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_classic_runs_select_own ON public.user_classic_runs;
CREATE POLICY user_classic_runs_select_own
  ON public.user_classic_runs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_classic_runs_insert_own ON public.user_classic_runs;
CREATE POLICY user_classic_runs_insert_own
  ON public.user_classic_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_classic_runs_update_own ON public.user_classic_runs;
CREATE POLICY user_classic_runs_update_own
  ON public.user_classic_runs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_classic_runs_delete_own ON public.user_classic_runs;
CREATE POLICY user_classic_runs_delete_own
  ON public.user_classic_runs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.user_classic_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.user_classic_runs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_classic_runs
  TO authenticated;

REVOKE ALL ON FUNCTION public.user_classic_runs_set_updated_at() FROM PUBLIC;
