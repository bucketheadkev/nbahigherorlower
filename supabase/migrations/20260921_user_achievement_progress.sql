-- Cloud achievement progress for permanent 1B Run accounts (additive only).
-- Does NOT change profiles, 1v1 tables/RPCs, anonymous auth, or gameplay.
-- Does NOT store email — private per-user progress only.
--
-- Apply manually via the Supabase SQL Editor when ready.
-- Safe to run once; uses IF NOT EXISTS / OR REPLACE where practical.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_achievement_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Mirrors oneb_challenges_v1.completedIds (monotonic unlock ledger).
  completed_ids text[] NOT NULL DEFAULT '{}'::text[],
  -- Live consecutive Classic $1B streak (resets on a miss locally; merged with max).
  billion_streak integer NOT NULL DEFAULT 0
    CHECK (billion_streak >= 0),
  -- Lifetime counted 1v1 wins (deduped by room via counted_h2h_rooms).
  h2h_wins integer NOT NULL DEFAULT 0
    CHECK (h2h_wins >= 0),
  -- Room IDs already counted toward h2h_wins (client keeps last 40).
  counted_h2h_rooms text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_achievement_progress IS
  'Private achievement progress for permanent 1B Run accounts. Owner-only RLS. No email.';

COMMENT ON COLUMN public.user_achievement_progress.user_id IS
  'auth.users id; cascade-deleted when the Auth user is removed.';

COMMENT ON COLUMN public.user_achievement_progress.completed_ids IS
  'Unlocked challenge IDs (union-merged). Includes materialized money/run-count IDs.';

COMMENT ON COLUMN public.user_achievement_progress.billion_streak IS
  'Consecutive Classic $1B finishes; unlocks also stored in completed_ids.';

COMMENT ON COLUMN public.user_achievement_progress.h2h_wins IS
  'Lifetime H2H wins counted once per room.';

COMMENT ON COLUMN public.user_achievement_progress.counted_h2h_rooms IS
  'H2H room IDs already counted (bounded client-side to 40).';

CREATE INDEX IF NOT EXISTS user_achievement_progress_updated_at_idx
  ON public.user_achievement_progress (updated_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_achievement_progress_set_updated_at()
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

DROP TRIGGER IF EXISTS user_achievement_progress_set_updated_at_trg
  ON public.user_achievement_progress;

CREATE TRIGGER user_achievement_progress_set_updated_at_trg
  BEFORE UPDATE ON public.user_achievement_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.user_achievement_progress_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — PRIVATE (owner only). Not publicly selectable.
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_achievement_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_achievement_progress_select_own
  ON public.user_achievement_progress;
CREATE POLICY user_achievement_progress_select_own
  ON public.user_achievement_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_achievement_progress_insert_own
  ON public.user_achievement_progress;
CREATE POLICY user_achievement_progress_insert_own
  ON public.user_achievement_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_achievement_progress_update_own
  ON public.user_achievement_progress;
CREATE POLICY user_achievement_progress_update_own
  ON public.user_achievement_progress
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_achievement_progress_delete_own
  ON public.user_achievement_progress;
CREATE POLICY user_achievement_progress_delete_own
  ON public.user_achievement_progress
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Privileges (anon / publishable key only — no service-role in clients)
-- ---------------------------------------------------------------------------

-- No GRANT to anon — guests never read/write this table.
REVOKE ALL ON TABLE public.user_achievement_progress FROM PUBLIC;
REVOKE ALL ON TABLE public.user_achievement_progress FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_achievement_progress
  TO authenticated;

REVOKE ALL ON FUNCTION public.user_achievement_progress_set_updated_at() FROM PUBLIC;
