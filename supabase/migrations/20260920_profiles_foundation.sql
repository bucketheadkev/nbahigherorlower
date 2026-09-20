-- Profiles foundation for permanent 1B Run accounts (additive only).
-- Does NOT change 1v1 tables/RPCs, anonymous auth, or gameplay.
-- Does NOT store email — email stays in auth.users / Supabase Auth only.
--
-- Apply manually via the Supabase SQL Editor when ready.
-- Safe to run once; uses IF NOT EXISTS / OR REPLACE where practical.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Display form (preserves chosen capitalization).
  username text NOT NULL,
  -- Case-folded form for uniqueness: Kevin / kevin / KEVIN collide.
  username_normalized text
    GENERATED ALWAYS AS (lower(username)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_format_chk CHECK (
    username ~ '^[A-Za-z0-9_]{3,20}$'
  )
);

COMMENT ON TABLE public.profiles IS
  'Public account profiles for permanent users. No email or private auth metadata.';

COMMENT ON COLUMN public.profiles.user_id IS
  'auth.users id; cascade-deleted when the Auth user is removed.';

COMMENT ON COLUMN public.profiles.username IS
  'Public leaderboard username (display capitalization preserved).';

COMMENT ON COLUMN public.profiles.username_normalized IS
  'lower(username); unique. Enforces case-insensitive username identity.';

-- Case-insensitive uniqueness (Kevin == kevin == KEVIN).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_normalized_uidx
  ON public.profiles (username_normalized);

CREATE INDEX IF NOT EXISTS profiles_created_at_idx
  ON public.profiles (created_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profiles_set_updated_at()
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

DROP TRIGGER IF EXISTS profiles_set_updated_at_trg ON public.profiles;

CREATE TRIGGER profiles_set_updated_at_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Public read: username (+ ids/timestamps) only — no email exists on this table.
DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
CREATE POLICY profiles_select_public
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Signed-in user creates only their own row (user_id must equal JWT subject).
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Signed-in user updates only their own row; cannot reassign user_id to another account.
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Own-row delete (optional for future account flows). Auth user delete still
-- cascades via FK regardless of this policy.
DROP POLICY IF EXISTS profiles_delete_own ON public.profiles;
CREATE POLICY profiles_delete_own
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Privileges (anon key / authenticated JWT only — no service-role in clients)
-- ---------------------------------------------------------------------------

GRANT SELECT ON TABLE public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;

REVOKE ALL ON FUNCTION public.profiles_set_updated_at() FROM PUBLIC;
