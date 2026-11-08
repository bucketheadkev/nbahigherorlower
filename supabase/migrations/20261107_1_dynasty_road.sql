-- Dynasty Road (Phase 1): permanent championship collections earned from $1B Classic runs.
--
-- Additive only. Franchises tables, functions and data are left exactly as they are.
-- Requires the Classic leaderboard migrations (public.user_leaderboard_runs, public.profiles).
-- Apply manually: Supabase → SQL Editor → paste this file → Run. Safe to re-run.
--
-- Trust model
--   • A signing is validated against public.user_leaderboard_runs, which only
--     submit_classic_leaderboard_lineup writes, with a value the server priced itself.
--   • One signing per run (dynasty_run_claims.run_id is the primary key).
--   • One copy of each collectible per account (unique user/collection/player).
--   • Retrying the same signing returns the same result; a different player from an
--     already-claimed run is refused.
--   • Only runs finished after this migration ran (dynasty_settings.launched_at) qualify.
--
-- Phase 2 hooks (not implemented): dynasty_inventory.source already accepts 'chest' and 'grant',
-- and dynasty_grant_player() is the single insert path a chest opening can call.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dynasty_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  launched_at timestamptz NOT NULL DEFAULT now(),
  min_run_value bigint NOT NULL DEFAULT 1000000000 CHECK (min_run_value > 0)
);

INSERT INTO public.dynasty_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.dynasty_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dynasty_settings FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Catalog (mirrors lib/tradeup/dynasty/catalog.ts)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dynasty_collections (
  id text PRIMARY KEY,
  sort_order integer NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('championship', 'final')),
  season integer,
  team_id text,
  era text,
  title text NOT NULL,
  -- Sealed collections are listed but can't be signed into or completed yet.
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.dynasty_collection_players (
  collection_id text NOT NULL REFERENCES public.dynasty_collections (id) ON DELETE CASCADE,
  player_id text NOT NULL,
  position text NOT NULL CHECK (position IN ('PG', 'SG', 'SF', 'PF', 'C')),
  sort_order integer NOT NULL,
  PRIMARY KEY (collection_id, player_id),
  UNIQUE (collection_id, sort_order)
);

CREATE INDEX IF NOT EXISTS dynasty_collection_players_player_idx
  ON public.dynasty_collection_players (player_id);

ALTER TABLE public.dynasty_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynasty_collection_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dynasty_collections_read ON public.dynasty_collections;
CREATE POLICY dynasty_collections_read ON public.dynasty_collections
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS dynasty_collection_players_read ON public.dynasty_collection_players;
CREATE POLICY dynasty_collection_players_read ON public.dynasty_collection_players
  FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON TABLE public.dynasty_collections FROM PUBLIC;
REVOKE ALL ON TABLE public.dynasty_collection_players FROM PUBLIC;
GRANT SELECT ON TABLE public.dynasty_collections TO anon, authenticated;
GRANT SELECT ON TABLE public.dynasty_collection_players TO anon, authenticated;

INSERT INTO public.dynasty_collections (id, sort_order, kind, season, team_id, era, title, active) VALUES
  ('dal-2011', 1, 'championship', 2011, 'DAL', '2010s', '2011 Dallas Mavericks', true),
  ('det-2004', 2, 'championship', 2004, 'DET', '2000s', '2004 Detroit Pistons', true),
  ('mia-2013', 3, 'championship', 2013, 'MIA', '2010s', '2013 Miami Heat', true),
  ('cle-2016', 4, 'championship', 2016, 'CLE', '2010s', '2016 Cleveland Cavaliers', true),
  ('gsw-2017', 5, 'championship', 2017, 'GSW', '2010s', '2017 Golden State Warriors', true),
  ('chi-1996', 6, 'championship', 1996, 'CHI', '1990s', '1996 Chicago Bulls', true),
  ('billion-five', 7, 'final', NULL, NULL, NULL, 'The Billion Five', false)
ON CONFLICT (id) DO UPDATE
  SET sort_order = EXCLUDED.sort_order,
      kind = EXCLUDED.kind,
      season = EXCLUDED.season,
      team_id = EXCLUDED.team_id,
      era = EXCLUDED.era,
      title = EXCLUDED.title,
      active = EXCLUDED.active;

-- Starters of each title-clinching Finals game (basketball-reference box scores).
INSERT INTO public.dynasty_collection_players (collection_id, player_id, position, sort_order) VALUES
  ('dal-2011', 'hist_2010s_DAL_jason_kidd', 'PG', 1),
  ('dal-2011', 'hist_2010s_DAL_j_j_barea', 'SG', 2),
  ('dal-2011', 'hist_2010s_DAL_shawn_marion', 'SF', 3),
  ('dal-2011', 'hist_2010s_DAL_dirk_nowitzki', 'PF', 4),
  ('dal-2011', 'hist_2010s_DAL_tyson_chandler', 'C', 5),
  ('det-2004', 'hist_2000s_DET_chauncey_billups', 'PG', 1),
  ('det-2004', 'hist_2000s_DET_richard_hamilton', 'SG', 2),
  ('det-2004', 'hist_2000s_DET_tayshaun_prince', 'SF', 3),
  ('det-2004', 'hist_2000s_DET_rasheed_wallace', 'PF', 4),
  ('det-2004', 'hist_2000s_DET_ben_wallace', 'C', 5),
  ('mia-2013', 'hist_2010s_MIA_mario_chalmers', 'PG', 1),
  ('mia-2013', 'hist_2010s_MIA_dwyane_wade', 'SG', 2),
  ('mia-2013', 'hist_2010s_MIA_mike_miller', 'SF', 3),
  ('mia-2013', 'hist_2010s_MIA_lebron_james', 'PF', 4),
  ('mia-2013', 'hist_2010s_MIA_chris_bosh', 'C', 5),
  ('cle-2016', 'hist_2010s_CLE_kyrie_irving', 'PG', 1),
  ('cle-2016', 'hist_2010s_CLE_j_r_smith', 'SG', 2),
  ('cle-2016', 'hist_2010s_CLE_lebron_james', 'SF', 3),
  ('cle-2016', 'hist_2010s_CLE_kevin_love', 'PF', 4),
  ('cle-2016', 'hist_2010s_CLE_tristan_thompson', 'C', 5),
  ('gsw-2017', 'hist_2010s_GSW_stephen_curry', 'PG', 1),
  ('gsw-2017', 'hist_2010s_GSW_klay_thompson', 'SG', 2),
  ('gsw-2017', 'hist_2010s_GSW_kevin_durant', 'SF', 3),
  ('gsw-2017', 'hist_2010s_GSW_draymond_green', 'PF', 4),
  ('gsw-2017', 'hist_2010s_GSW_zaza_pachulia', 'C', 5),
  ('chi-1996', 'hist_1990s_CHI_ron_harper', 'PG', 1),
  ('chi-1996', 'hist_1990s_CHI_michael_jordan', 'SG', 2),
  ('chi-1996', 'hist_1990s_CHI_scottie_pippen', 'SF', 3),
  ('chi-1996', 'hist_1990s_CHI_dennis_rodman', 'PF', 4),
  ('chi-1996', 'hist_1990s_CHI_luc_longley', 'C', 5)
ON CONFLICT (collection_id, player_id) DO UPDATE
  SET position = EXCLUDED.position,
      sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dynasty_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  collection_id text NOT NULL,
  player_id text NOT NULL,
  -- classic_run = signed from a verified $1B run; chest/grant reserved for Phase 2.
  source text NOT NULL CHECK (source IN ('classic_run', 'chest', 'grant')),
  source_ref text,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dynasty_inventory_one_copy UNIQUE (user_id, collection_id, player_id),
  CONSTRAINT dynasty_inventory_collectible
    FOREIGN KEY (collection_id, player_id)
    REFERENCES public.dynasty_collection_players (collection_id, player_id)
);

CREATE INDEX IF NOT EXISTS dynasty_inventory_user_idx ON public.dynasty_inventory (user_id, acquired_at DESC);

CREATE TABLE IF NOT EXISTS public.dynasty_run_claims (
  run_id uuid PRIMARY KEY REFERENCES public.user_leaderboard_runs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_run_id text,
  collection_id text NOT NULL,
  player_id text NOT NULL,
  inventory_id uuid REFERENCES public.dynasty_inventory (id) ON DELETE SET NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dynasty_run_claims_user_idx ON public.dynasty_run_claims (user_id, claimed_at DESC);

CREATE TABLE IF NOT EXISTS public.dynasty_completions (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  collection_id text NOT NULL REFERENCES public.dynasty_collections (id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, collection_id)
);

ALTER TABLE public.dynasty_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynasty_run_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynasty_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dynasty_inventory_own ON public.dynasty_inventory;
CREATE POLICY dynasty_inventory_own ON public.dynasty_inventory
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS dynasty_run_claims_own ON public.dynasty_run_claims;
CREATE POLICY dynasty_run_claims_own ON public.dynasty_run_claims
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS dynasty_completions_own ON public.dynasty_completions;
CREATE POLICY dynasty_completions_own ON public.dynasty_completions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Reads only; every write goes through the SECURITY DEFINER functions below.
REVOKE ALL ON TABLE public.dynasty_inventory FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.dynasty_run_claims FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.dynasty_completions FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.dynasty_inventory TO authenticated;
GRANT SELECT ON TABLE public.dynasty_run_claims TO authenticated;
GRANT SELECT ON TABLE public.dynasty_completions TO authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- Same rule as the Classic leaderboard: a signed-in, non-anonymous account with a profile.
CREATE OR REPLACE FUNCTION public.dynasty_require_user()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = v_uid) THEN
    RAISE EXCEPTION 'profile_required' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.dynasty_require_user() FROM PUBLIC;

-- The one insert path into a collection, for every source. Marks the collection complete the
-- moment its last required player lands. Owning the player already is a no-op.
CREATE OR REPLACE FUNCTION public.dynasty_grant_player(
  p_uid uuid,
  p_collection_id text,
  p_player_id text,
  p_source text,
  p_source_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_id uuid;
  v_need integer;
  v_have integer;
  v_completed boolean := false;
BEGIN
  INSERT INTO public.dynasty_inventory (user_id, collection_id, player_id, source, source_ref)
  VALUES (p_uid, p_collection_id, p_player_id, p_source, p_source_ref)
  ON CONFLICT ON CONSTRAINT dynasty_inventory_one_copy DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.dynasty_inventory
    WHERE user_id = p_uid AND collection_id = p_collection_id AND player_id = p_player_id;
    RETURN jsonb_build_object('inventory_id', v_id, 'created', false, 'completed', false);
  END IF;

  SELECT count(*) INTO v_need
  FROM public.dynasty_collection_players cp
  JOIN public.dynasty_collections c ON c.id = cp.collection_id AND c.active
  WHERE cp.collection_id = p_collection_id;

  SELECT count(*) INTO v_have
  FROM public.dynasty_inventory i
  JOIN public.dynasty_collection_players cp
    ON cp.collection_id = i.collection_id AND cp.player_id = i.player_id
  WHERE i.user_id = p_uid AND i.collection_id = p_collection_id;

  IF v_need > 0 AND v_have >= v_need THEN
    INSERT INTO public.dynasty_completions (user_id, collection_id)
    VALUES (p_uid, p_collection_id)
    ON CONFLICT (user_id, collection_id) DO NOTHING;
    v_completed := FOUND;
  END IF;

  RETURN jsonb_build_object('inventory_id', v_id, 'created', true, 'completed', v_completed);
END;
$$;

REVOKE ALL ON FUNCTION public.dynasty_grant_player(uuid, text, text, text, text) FROM PUBLIC;

-- Collectible players in a verified lineup, and whether this account already owns each one.
CREATE OR REPLACE FUNCTION public.dynasty_run_options(p_uid uuid, p_lineup jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'collection_id', cp.collection_id,
        'player_id', cp.player_id,
        'owned', i.id IS NOT NULL
      )
      ORDER BY c.sort_order, cp.sort_order
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lineup) = 'array' THEN p_lineup ELSE '[]'::jsonb END) e
  JOIN public.dynasty_collection_players cp ON cp.player_id = e ->> 'player_id'
  JOIN public.dynasty_collections c ON c.id = cp.collection_id AND c.active
  LEFT JOIN public.dynasty_inventory i
    ON i.user_id = p_uid AND i.collection_id = cp.collection_id AND i.player_id = cp.player_id;
$$;

REVOKE ALL ON FUNCTION public.dynasty_run_options(uuid, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.dynasty_snapshot(p_uid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'min_run_value', (SELECT min_run_value FROM public.dynasty_settings WHERE id),
    'owned', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'collection_id', i.collection_id,
        'player_id', i.player_id,
        'source', i.source,
        'acquired_at', i.acquired_at
      ) ORDER BY i.acquired_at)
      FROM public.dynasty_inventory i WHERE i.user_id = p_uid
    ), '[]'::jsonb),
    'completed', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'collection_id', d.collection_id,
        'completed_at', d.completed_at
      ) ORDER BY d.completed_at)
      FROM public.dynasty_completions d WHERE d.user_id = p_uid
    ), '[]'::jsonb),
    'claims', coalesce((
      SELECT jsonb_agg(x ORDER BY x ->> 'claimed_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'client_run_id', cl.client_run_id,
          'collection_id', cl.collection_id,
          'player_id', cl.player_id,
          'claimed_at', cl.claimed_at
        ) AS x
        FROM public.dynasty_run_claims cl
        WHERE cl.user_id = p_uid
        ORDER BY cl.claimed_at DESC
        LIMIT 20
      ) recent
    ), '[]'::jsonb),
    -- Qualifying runs with no signing yet that still have an unowned player to offer.
    'pending', coalesce((
      SELECT jsonb_agg(p ORDER BY p ->> 'achieved_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'client_run_id', r.client_run_id,
          'verified_value', r.verified_value,
          'achieved_at', r.achieved_at,
          'options', public.dynasty_run_options(p_uid, r.lineup)
        ) AS p
        FROM public.user_leaderboard_runs r
        CROSS JOIN public.dynasty_settings s
        WHERE s.id
          AND r.user_id = p_uid
          AND r.client_run_id IS NOT NULL
          AND r.achieved_at >= s.launched_at
          AND r.verified_value >= s.min_run_value
          AND NOT EXISTS (SELECT 1 FROM public.dynasty_run_claims cl WHERE cl.run_id = r.id)
        ORDER BY r.achieved_at DESC
        LIMIT 20
      ) candidates
      WHERE (p -> 'options') @> '[{"owned": false}]'::jsonb
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.dynasty_snapshot(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dynasty_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  RETURN public.dynasty_snapshot(public.dynasty_require_user());
END;
$$;

REVOKE ALL ON FUNCTION public.dynasty_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dynasty_state() TO authenticated;

-- Sign one player from a verified $1B run. The run is looked up by the client run id the Classic
-- submit already recorded; its lineup and value come from the server's row, not from the caller.
CREATE OR REPLACE FUNCTION public.dynasty_sign_from_run(
  p_client_run_id text,
  p_collection_id text,
  p_player_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.dynasty_require_user();
  v_run public.user_leaderboard_runs%ROWTYPE;
  v_claim public.dynasty_run_claims%ROWTYPE;
  v_settings public.dynasty_settings%ROWTYPE;
  v_grant jsonb;
BEGIN
  -- Serialize one account's signings so two taps or two devices can't race.
  PERFORM pg_advisory_xact_lock(hashtextextended('dynasty:' || v_uid::text, 0));

  IF p_client_run_id IS NULL OR length(trim(p_client_run_id)) = 0 THEN
    RAISE EXCEPTION 'invalid_run' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run
  FROM public.user_leaderboard_runs
  WHERE user_id = v_uid AND client_run_id = trim(p_client_run_id);
  IF NOT FOUND THEN
    -- The Classic submit may still be in flight; the client retries.
    RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_claim FROM public.dynasty_run_claims WHERE run_id = v_run.id;
  IF FOUND THEN
    IF v_claim.collection_id = p_collection_id AND v_claim.player_id = p_player_id THEN
      RETURN public.dynasty_snapshot(v_uid) || jsonb_build_object(
        'already_signed', true,
        'signed', jsonb_build_object('collection_id', v_claim.collection_id, 'player_id', v_claim.player_id),
        'completed_now', false
      );
    END IF;
    RAISE EXCEPTION 'run_already_claimed' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_settings FROM public.dynasty_settings WHERE id;
  IF v_run.achieved_at < v_settings.launched_at THEN
    RAISE EXCEPTION 'run_before_launch' USING ERRCODE = '22023';
  END IF;
  IF v_run.verified_value < v_settings.min_run_value THEN
    RAISE EXCEPTION 'run_not_qualified' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_run.lineup) e WHERE e ->> 'player_id' = p_player_id
  ) THEN
    RAISE EXCEPTION 'player_not_in_run' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.dynasty_collection_players cp
    JOIN public.dynasty_collections c ON c.id = cp.collection_id AND c.active
    WHERE cp.collection_id = p_collection_id AND cp.player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'player_not_eligible' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dynasty_inventory
    WHERE user_id = v_uid AND collection_id = p_collection_id AND player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'already_owned' USING ERRCODE = '23505';
  END IF;

  v_grant := public.dynasty_grant_player(v_uid, p_collection_id, p_player_id, 'classic_run', v_run.id::text);

  INSERT INTO public.dynasty_run_claims (run_id, user_id, client_run_id, collection_id, player_id, inventory_id)
  VALUES (v_run.id, v_uid, v_run.client_run_id, p_collection_id, p_player_id, (v_grant ->> 'inventory_id')::uuid);

  RETURN public.dynasty_snapshot(v_uid) || jsonb_build_object(
    'already_signed', false,
    'signed', jsonb_build_object('collection_id', p_collection_id, 'player_id', p_player_id),
    'completed_now', coalesce((v_grant ->> 'completed')::boolean, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dynasty_sign_from_run(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dynasty_sign_from_run(text, text, text) TO authenticated;
