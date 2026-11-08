-- Dynasty Road (Phase 2): chests earned by playing Classic, three-hour unlocks, one-player rewards,
-- Focus Dynasty, duplicate protection, and instant-unlock keys.
--
-- Requires 20261107_1_dynasty_road.sql. Additive; safe to re-run.
-- Apply manually: Supabase → SQL Editor → paste this file → Run.
--
-- Rules
--   • Chests come only from Classic runs the server verified (user_leaderboard_runs). A trigger on
--     that table awards progress once per run; it can never block the run itself.
--   • Unlock timers are server timestamps. Changing the device clock changes nothing.
--   • Every chest reveals exactly one collectible, written to the Phase 1 inventory
--     (dynasty_inventory, source 'chest') through dynasty_grant_player.
--   • Keys only finish an earned chest's timer. They never create chests or rewards, never change
--     odds, and are never bought with Bank money. A key is spent in the same transaction as the
--     unlock it pays for, once per request id.
--   • Purchased keys are granted only by the server-side Apple validator (service role).
--
-- Balance values (all in tables below, all PENDING APPROVAL): points per run, chest tier odds,
-- player rarity, chest × rarity weights, new-player bias, Focus multiplier, duplicate protection
-- threshold, and the anti-farming minimum gap between counted runs.

-- ---------------------------------------------------------------------------
-- Rules (one row)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dynasty_chest_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Runs finished before this never earn chest progress.
  launched_at timestamptz NOT NULL DEFAULT now(),
  points_per_run integer NOT NULL DEFAULT 1 CHECK (points_per_run >= 0),
  points_billion_bonus integer NOT NULL DEFAULT 1 CHECK (points_billion_bonus >= 0),
  billion_value bigint NOT NULL DEFAULT 1000000000 CHECK (billion_value > 0),
  points_per_chest integer NOT NULL DEFAULT 4 CHECK (points_per_chest > 0),
  unlock_seconds integer NOT NULL DEFAULT 10800 CHECK (unlock_seconds > 0),
  max_unlocking integer NOT NULL DEFAULT 1 CHECK (max_unlocking > 0),
  -- A real Classic run takes minutes; runs recorded closer together than this earn no progress.
  min_seconds_between_runs integer NOT NULL DEFAULT 30 CHECK (min_seconds_between_runs >= 0),
  -- After this many duplicate rewards in a row, the next reward is a player the account lacks.
  dup_protection_after integer NOT NULL DEFAULT 4 CHECK (dup_protection_after > 0),
  -- Weight multiplier for players the account doesn't own yet.
  new_player_bias numeric NOT NULL DEFAULT 1.5 CHECK (new_player_bias >= 1),
  -- Extra multiplier for missing players from the account's Focus Dynasty.
  focus_multiplier numeric NOT NULL DEFAULT 3 CHECK (focus_multiplier >= 1)
);

INSERT INTO public.dynasty_chest_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.dynasty_chest_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dynasty_chest_settings FROM PUBLIC, anon, authenticated;

-- Which chest rarity an earned chest rolls (relative weights).
CREATE TABLE IF NOT EXISTS public.dynasty_chest_tiers (
  tier text PRIMARY KEY CHECK (tier IN ('pro', 'all_star', 'superstar', 'legend', 'goat')),
  sort_order integer NOT NULL UNIQUE,
  earn_weight numeric NOT NULL CHECK (earn_weight >= 0)
);

INSERT INTO public.dynasty_chest_tiers (tier, sort_order, earn_weight) VALUES
  ('pro', 1, 55),
  ('all_star', 2, 25),
  ('superstar', 3, 12),
  ('legend', 4, 6),
  ('goat', 5, 2)
ON CONFLICT (tier) DO NOTHING;

-- Collectible rarity, separate from Classic dollar values (which never change).
ALTER TABLE public.dynasty_collection_players
  ADD COLUMN IF NOT EXISTS rarity text NOT NULL DEFAULT 'pro';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dynasty_collection_players_rarity_check') THEN
    ALTER TABLE public.dynasty_collection_players
      ADD CONSTRAINT dynasty_collection_players_rarity_check
      CHECK (rarity IN ('pro', 'all_star', 'superstar', 'legend', 'goat'));
  END IF;
END;
$$;

UPDATE public.dynasty_collection_players cp SET rarity = v.rarity
FROM (VALUES
  ('dal-2011', 'hist_2010s_DAL_jason_kidd', 'superstar'),
  ('dal-2011', 'hist_2010s_DAL_j_j_barea', 'pro'),
  ('dal-2011', 'hist_2010s_DAL_shawn_marion', 'all_star'),
  ('dal-2011', 'hist_2010s_DAL_dirk_nowitzki', 'legend'),
  ('dal-2011', 'hist_2010s_DAL_tyson_chandler', 'all_star'),
  ('det-2004', 'hist_2000s_DET_chauncey_billups', 'superstar'),
  ('det-2004', 'hist_2000s_DET_richard_hamilton', 'all_star'),
  ('det-2004', 'hist_2000s_DET_tayshaun_prince', 'all_star'),
  ('det-2004', 'hist_2000s_DET_rasheed_wallace', 'all_star'),
  ('det-2004', 'hist_2000s_DET_ben_wallace', 'superstar'),
  ('mia-2013', 'hist_2010s_MIA_mario_chalmers', 'pro'),
  ('mia-2013', 'hist_2010s_MIA_dwyane_wade', 'legend'),
  ('mia-2013', 'hist_2010s_MIA_mike_miller', 'pro'),
  ('mia-2013', 'hist_2010s_MIA_lebron_james', 'goat'),
  ('mia-2013', 'hist_2010s_MIA_chris_bosh', 'superstar'),
  ('cle-2016', 'hist_2010s_CLE_kyrie_irving', 'legend'),
  ('cle-2016', 'hist_2010s_CLE_j_r_smith', 'pro'),
  ('cle-2016', 'hist_2010s_CLE_lebron_james', 'goat'),
  ('cle-2016', 'hist_2010s_CLE_kevin_love', 'superstar'),
  ('cle-2016', 'hist_2010s_CLE_tristan_thompson', 'all_star'),
  ('gsw-2017', 'hist_2010s_GSW_stephen_curry', 'goat'),
  ('gsw-2017', 'hist_2010s_GSW_klay_thompson', 'superstar'),
  ('gsw-2017', 'hist_2010s_GSW_kevin_durant', 'legend'),
  ('gsw-2017', 'hist_2010s_GSW_draymond_green', 'superstar'),
  ('gsw-2017', 'hist_2010s_GSW_zaza_pachulia', 'pro'),
  ('chi-1996', 'hist_1990s_CHI_ron_harper', 'all_star'),
  ('chi-1996', 'hist_1990s_CHI_michael_jordan', 'goat'),
  ('chi-1996', 'hist_1990s_CHI_scottie_pippen', 'legend'),
  ('chi-1996', 'hist_1990s_CHI_dennis_rodman', 'superstar'),
  ('chi-1996', 'hist_1990s_CHI_luc_longley', 'pro')
) AS v (collection_id, player_id, rarity)
WHERE cp.collection_id = v.collection_id AND cp.player_id = v.player_id;

-- How likely each player rarity is from each chest tier (relative weights per chest).
CREATE TABLE IF NOT EXISTS public.dynasty_chest_reward_weights (
  chest_tier text NOT NULL REFERENCES public.dynasty_chest_tiers (tier),
  rarity text NOT NULL CHECK (rarity IN ('pro', 'all_star', 'superstar', 'legend', 'goat')),
  weight numeric NOT NULL CHECK (weight >= 0),
  PRIMARY KEY (chest_tier, rarity)
);

INSERT INTO public.dynasty_chest_reward_weights (chest_tier, rarity, weight) VALUES
  ('pro', 'pro', 60), ('pro', 'all_star', 30), ('pro', 'superstar', 9), ('pro', 'legend', 1), ('pro', 'goat', 0),
  ('all_star', 'pro', 35), ('all_star', 'all_star', 40), ('all_star', 'superstar', 20), ('all_star', 'legend', 4), ('all_star', 'goat', 1),
  ('superstar', 'pro', 15), ('superstar', 'all_star', 30), ('superstar', 'superstar', 35), ('superstar', 'legend', 15), ('superstar', 'goat', 5),
  ('legend', 'pro', 5), ('legend', 'all_star', 15), ('legend', 'superstar', 30), ('legend', 'legend', 35), ('legend', 'goat', 15),
  ('goat', 'pro', 0), ('goat', 'all_star', 5), ('goat', 'superstar', 20), ('goat', 'legend', 40), ('goat', 'goat', 35)
ON CONFLICT (chest_tier, rarity) DO NOTHING;

ALTER TABLE public.dynasty_chest_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynasty_chest_reward_weights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dynasty_chest_tiers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.dynasty_chest_reward_weights FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Per-account state
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dynasty_chest_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  runs_counted integer NOT NULL DEFAULT 0,
  chests_earned integer NOT NULL DEFAULT 0,
  -- Duplicate rewards in a row (reset by any new player).
  dup_streak integer NOT NULL DEFAULT 0,
  focus_collection_id text REFERENCES public.dynasty_collections (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per verified run: what it earned (also proves it was counted).
CREATE TABLE IF NOT EXISTS public.dynasty_run_rewards (
  run_id uuid PRIMARY KEY REFERENCES public.user_leaderboard_runs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_run_id text,
  points integer NOT NULL,
  -- counted | too_soon
  reason text NOT NULL,
  chest_ids uuid[] NOT NULL DEFAULT '{}',
  awarded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dynasty_run_rewards_user_idx ON public.dynasty_run_rewards (user_id, awarded_at DESC);

CREATE TABLE IF NOT EXISTS public.dynasty_key_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  delta integer NOT NULL CHECK (delta <> 0),
  -- purchase (+, Apple transaction id) · use (−1, client request id) · refund (−, transaction id) · grant (+, admin/achievement ref)
  kind text NOT NULL CHECK (kind IN ('purchase', 'use', 'refund', 'grant')),
  ref text NOT NULL,
  product_id text,
  environment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dynasty_key_ledger_once UNIQUE (user_id, kind, ref)
);

-- An Apple transaction can grant (and be refunded) exactly once, whichever account sends it.
CREATE UNIQUE INDEX IF NOT EXISTS dynasty_key_ledger_purchase_uidx
  ON public.dynasty_key_ledger (ref) WHERE kind = 'purchase';
CREATE UNIQUE INDEX IF NOT EXISTS dynasty_key_ledger_refund_uidx
  ON public.dynasty_key_ledger (ref) WHERE kind = 'refund';
CREATE INDEX IF NOT EXISTS dynasty_key_ledger_user_idx ON public.dynasty_key_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.dynasty_chests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tier text NOT NULL REFERENCES public.dynasty_chest_tiers (tier),
  -- classic_progress = earned from verified runs; grant reserved for future milestone rewards.
  source text NOT NULL CHECK (source IN ('classic_progress', 'grant')),
  source_ref text,
  earned_at timestamptz NOT NULL DEFAULT now(),
  unlock_started_at timestamptz,
  unlock_ends_at timestamptz,
  unlocked_by text CHECK (unlocked_by IN ('timer', 'key')),
  key_ledger_id uuid REFERENCES public.dynasty_key_ledger (id),
  opened_at timestamptz,
  reward_collection_id text,
  reward_player_id text,
  reward_is_new boolean,
  reward_dup_streak integer,
  CONSTRAINT dynasty_chests_unlock_pair CHECK ((unlock_started_at IS NULL) = (unlock_ends_at IS NULL)),
  CONSTRAINT dynasty_chests_open_after_unlock CHECK (opened_at IS NULL OR unlock_ends_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS dynasty_chests_user_idx ON public.dynasty_chests (user_id, earned_at DESC);

-- Purchasable key packs. Empty until App Store Connect products exist (no invented ids/prices).
CREATE TABLE IF NOT EXISTS public.dynasty_key_products (
  product_id text PRIMARY KEY,
  keys integer NOT NULL CHECK (keys > 0),
  active boolean NOT NULL DEFAULT false
);

ALTER TABLE public.dynasty_chest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynasty_run_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynasty_key_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynasty_chests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynasty_key_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dynasty_chest_progress_own ON public.dynasty_chest_progress;
CREATE POLICY dynasty_chest_progress_own ON public.dynasty_chest_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS dynasty_run_rewards_own ON public.dynasty_run_rewards;
CREATE POLICY dynasty_run_rewards_own ON public.dynasty_run_rewards
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS dynasty_key_ledger_own ON public.dynasty_key_ledger;
CREATE POLICY dynasty_key_ledger_own ON public.dynasty_key_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS dynasty_chests_own ON public.dynasty_chests;
CREATE POLICY dynasty_chests_own ON public.dynasty_chests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS dynasty_key_products_read ON public.dynasty_key_products;
CREATE POLICY dynasty_key_products_read ON public.dynasty_key_products
  FOR SELECT TO anon, authenticated USING (active);

REVOKE ALL ON TABLE public.dynasty_chest_progress FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.dynasty_run_rewards FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.dynasty_key_ledger FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.dynasty_chests FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.dynasty_key_products FROM PUBLIC;
GRANT SELECT ON TABLE public.dynasty_chest_progress TO authenticated;
GRANT SELECT ON TABLE public.dynasty_run_rewards TO authenticated;
GRANT SELECT ON TABLE public.dynasty_key_ledger TO authenticated;
GRANT SELECT ON TABLE public.dynasty_chests TO authenticated;
GRANT SELECT ON TABLE public.dynasty_key_products TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dynasty_lock_user(p_uid uuid)
RETURNS void
LANGUAGE sql
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('dynasty:' || p_uid::text, 0));
$$;

REVOKE ALL ON FUNCTION public.dynasty_lock_user(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.dynasty_key_balance(p_uid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce(sum(delta), 0)::integer FROM public.dynasty_key_ledger WHERE user_id = p_uid;
$$;

REVOKE ALL ON FUNCTION public.dynasty_key_balance(uuid) FROM PUBLIC;

-- Earned chest rarity for a roll in [0, 1).
CREATE OR REPLACE FUNCTION public.dynasty_pick_chest_tier(p_roll double precision)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT tier FROM (
    SELECT tier, sort_order,
           sum(earn_weight) OVER (ORDER BY sort_order ROWS UNBOUNDED PRECEDING) AS cum,
           sum(earn_weight) OVER () AS tot
    FROM public.dynasty_chest_tiers
    WHERE earn_weight > 0
  ) t
  WHERE cum > least(greatest(p_roll, 0), 0.999999999) * tot
  ORDER BY sort_order
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.dynasty_pick_chest_tier(double precision) FROM PUBLIC;

-- Every collectible a chest of this tier could reveal for this account, with its weight:
--   chest × rarity weight, split evenly across that rarity's players
--   × new_player_bias for players the account lacks
--   × focus_multiplier for missing players from the (unfinished) Focus Dynasty.
CREATE OR REPLACE FUNCTION public.dynasty_reward_pool(p_uid uuid, p_tier text)
RETURNS TABLE (
  collection_id text,
  player_id text,
  rarity text,
  is_new boolean,
  focus boolean,
  weight numeric,
  ord bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH s AS (SELECT * FROM public.dynasty_chest_settings WHERE id),
  f AS (
    SELECT p.focus_collection_id AS fid
    FROM public.dynasty_chest_progress p
    WHERE p.user_id = p_uid
      AND NOT EXISTS (
        SELECT 1 FROM public.dynasty_completions d
        WHERE d.user_id = p_uid AND d.collection_id = p.focus_collection_id
      )
  ),
  pool AS (
    SELECT cp.collection_id, cp.player_id, cp.rarity,
           (i.id IS NULL) AS is_new,
           c.sort_order * 100 + cp.sort_order AS ord
    FROM public.dynasty_collection_players cp
    JOIN public.dynasty_collections c ON c.id = cp.collection_id AND c.active AND c.kind = 'championship'
    LEFT JOIN public.dynasty_inventory i
      ON i.user_id = p_uid AND i.collection_id = cp.collection_id AND i.player_id = cp.player_id
  ),
  counts AS (SELECT pool.rarity, count(*) AS n FROM pool GROUP BY pool.rarity)
  SELECT pool.collection_id, pool.player_id, pool.rarity, pool.is_new,
         (pool.is_new AND pool.collection_id = (SELECT fid FROM f)) AS focus,
         coalesce(w.weight, 0) / counts.n
           * CASE WHEN pool.is_new THEN s.new_player_bias ELSE 1 END
           * CASE WHEN pool.is_new AND pool.collection_id = (SELECT fid FROM f) THEN s.focus_multiplier ELSE 1 END AS weight,
         pool.ord
  FROM pool
  JOIN counts ON counts.rarity = pool.rarity
  CROSS JOIN s
  LEFT JOIN public.dynasty_chest_reward_weights w ON w.chest_tier = p_tier AND w.rarity = pool.rarity;
$$;

REVOKE ALL ON FUNCTION public.dynasty_reward_pool(uuid, text) FROM PUBLIC;

-- Deterministic for a given roll in [0, 1) so the odds can be tested exactly.
-- Duplicate protection: once dup_streak reaches the threshold, only missing players are eligible
-- (by their weights, or evenly if this chest tier weights them all at zero). With nothing missing,
-- it's an ordinary roll and says so (all_owned).
CREATE OR REPLACE FUNCTION public.dynasty_pick_reward(p_uid uuid, p_tier text, p_roll double precision)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_after integer;
  v_streak integer;
  v_any_new boolean;
  v_protected boolean;
  v_new_weight numeric;
  v_roll double precision := least(greatest(coalesce(p_roll, 0), 0), 0.999999999);
  v_pick record;
BEGIN
  SELECT dup_protection_after INTO v_after FROM public.dynasty_chest_settings WHERE id;
  SELECT coalesce((SELECT dup_streak FROM public.dynasty_chest_progress WHERE user_id = p_uid), 0) INTO v_streak;
  SELECT bool_or(is_new), coalesce(sum(weight) FILTER (WHERE is_new), 0)
  INTO v_any_new, v_new_weight
  FROM public.dynasty_reward_pool(p_uid, p_tier);
  v_any_new := coalesce(v_any_new, false);
  v_protected := v_any_new AND v_streak >= v_after;

  SELECT collection_id, player_id, rarity, is_new, focus INTO v_pick
  FROM (
    SELECT p.*, sum(p.w) OVER (ORDER BY p.ord ROWS UNBOUNDED PRECEDING) AS cum, sum(p.w) OVER () AS tot
    FROM (
      SELECT rp.*,
             CASE
               WHEN NOT v_protected THEN rp.weight
               WHEN NOT rp.is_new THEN 0
               WHEN v_new_weight > 0 THEN rp.weight
               ELSE 1
             END AS w
      FROM public.dynasty_reward_pool(p_uid, p_tier) rp
    ) p
    WHERE p.w > 0
  ) z
  WHERE z.cum > v_roll * z.tot
  ORDER BY z.ord
  LIMIT 1;

  IF v_pick.player_id IS NULL THEN
    RAISE EXCEPTION 'empty_reward_pool' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'collection_id', v_pick.collection_id,
    'player_id', v_pick.player_id,
    'rarity', v_pick.rarity,
    'is_new', v_pick.is_new,
    'focus', v_pick.focus,
    'protected', v_protected,
    'all_owned', NOT v_any_new
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dynasty_pick_reward(uuid, text, double precision) FROM PUBLIC;

-- Award chest progress for one verified run, exactly once.
CREATE OR REPLACE FUNCTION public.dynasty_award_run_points(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  r public.user_leaderboard_runs%ROWTYPE;
  s public.dynasty_chest_settings%ROWTYPE;
  v_last timestamptz;
  v_points integer := 0;
  v_reason text := 'counted';
  v_balance integer;
  v_chests uuid[] := '{}';
  v_chest uuid;
BEGIN
  SELECT * INTO r FROM public.user_leaderboard_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT * INTO s FROM public.dynasty_chest_settings WHERE id;
  IF r.achieved_at < s.launched_at THEN
    RETURN;
  END IF;

  PERFORM public.dynasty_lock_user(r.user_id);
  IF EXISTS (SELECT 1 FROM public.dynasty_run_rewards WHERE run_id = r.id) THEN
    RETURN;
  END IF;

  SELECT max(awarded_at) INTO v_last
  FROM public.dynasty_run_rewards
  WHERE user_id = r.user_id AND points > 0;

  IF v_last IS NOT NULL AND now() < v_last + make_interval(secs => s.min_seconds_between_runs) THEN
    v_reason := 'too_soon';
  ELSE
    v_points := s.points_per_run + CASE WHEN r.verified_value >= s.billion_value THEN s.points_billion_bonus ELSE 0 END;
  END IF;

  INSERT INTO public.dynasty_chest_progress (user_id) VALUES (r.user_id) ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.dynasty_chest_progress
  SET points = points + v_points,
      runs_counted = runs_counted + CASE WHEN v_points > 0 THEN 1 ELSE 0 END,
      updated_at = now()
  WHERE user_id = r.user_id
  RETURNING points INTO v_balance;

  WHILE v_balance >= s.points_per_chest LOOP
    INSERT INTO public.dynasty_chests (user_id, tier, source, source_ref)
    VALUES (r.user_id, public.dynasty_pick_chest_tier(random()), 'classic_progress', r.id::text)
    RETURNING id INTO v_chest;
    v_chests := v_chests || v_chest;
    v_balance := v_balance - s.points_per_chest;
  END LOOP;

  UPDATE public.dynasty_chest_progress
  SET points = v_balance,
      chests_earned = chests_earned + coalesce(array_length(v_chests, 1), 0)
  WHERE user_id = r.user_id;

  INSERT INTO public.dynasty_run_rewards (run_id, user_id, client_run_id, points, reason, chest_ids)
  VALUES (r.id, r.user_id, r.client_run_id, v_points, v_reason, v_chests);
END;
$$;

REVOKE ALL ON FUNCTION public.dynasty_award_run_points(uuid) FROM PUBLIC;

-- Never lets a chest problem block the Classic run itself.
CREATE OR REPLACE FUNCTION public.dynasty_award_run_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  BEGIN
    PERFORM public.dynasty_award_run_points(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dynasty chest progress failed for run %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS dynasty_award_run_trg ON public.user_leaderboard_runs;
CREATE TRIGGER dynasty_award_run_trg
  AFTER INSERT ON public.user_leaderboard_runs
  FOR EACH ROW EXECUTE FUNCTION public.dynasty_award_run_trg();

CREATE OR REPLACE FUNCTION public.dynasty_chest_status(p_opened_at timestamptz, p_unlock_ends_at timestamptz, p_now timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_opened_at IS NOT NULL THEN 'opened'
    WHEN p_unlock_ends_at IS NULL THEN 'waiting'
    WHEN p_unlock_ends_at > p_now THEN 'unlocking'
    ELSE 'ready'
  END;
$$;

-- ---------------------------------------------------------------------------
-- Snapshot (replaces Phase 1's, keeping every Phase 1 field)
-- ---------------------------------------------------------------------------

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
    'server_now', now(),
    'min_run_value', (SELECT min_run_value FROM public.dynasty_settings WHERE id),
    'owned', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'collection_id', i.collection_id,
        'player_id', i.player_id,
        'source', i.source,
        'acquired_at', i.acquired_at,
        'chest_tier', ch.tier
      ) ORDER BY i.acquired_at)
      FROM public.dynasty_inventory i
      LEFT JOIN public.dynasty_chests ch
        ON i.source = 'chest' AND ch.id::text = i.source_ref AND ch.user_id = i.user_id
      WHERE i.user_id = p_uid
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
    ), '[]'::jsonb),
    'chest_rules', (
      SELECT jsonb_build_object(
        'points_per_run', s.points_per_run,
        'points_billion_bonus', s.points_billion_bonus,
        'points_per_chest', s.points_per_chest,
        'unlock_seconds', s.unlock_seconds,
        'max_unlocking', s.max_unlocking,
        'dup_protection_after', s.dup_protection_after
      )
      FROM public.dynasty_chest_settings s WHERE s.id
    ),
    'chest_progress', coalesce((
      SELECT jsonb_build_object(
        'points', p.points,
        'runs_counted', p.runs_counted,
        'chests_earned', p.chests_earned,
        'dup_streak', p.dup_streak
      )
      FROM public.dynasty_chest_progress p WHERE p.user_id = p_uid
    ), jsonb_build_object('points', 0, 'runs_counted', 0, 'chests_earned', 0, 'dup_streak', 0)),
    -- A finished Focus Dynasty stops counting the moment it completes.
    'focus_collection_id', (
      SELECT p.focus_collection_id FROM public.dynasty_chest_progress p
      WHERE p.user_id = p_uid
        AND NOT EXISTS (
          SELECT 1 FROM public.dynasty_completions d
          WHERE d.user_id = p_uid AND d.collection_id = p.focus_collection_id
        )
    ),
    'keys', public.dynasty_key_balance(p_uid),
    -- Every chest not yet opened, plus the ten most recently opened.
    'chests', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'tier', c.tier,
        'status', public.dynasty_chest_status(c.opened_at, c.unlock_ends_at, now()),
        'earned_at', c.earned_at,
        'unlock_started_at', c.unlock_started_at,
        'unlock_ends_at', c.unlock_ends_at,
        'unlocked_by', c.unlocked_by,
        'opened_at', c.opened_at,
        'reward_collection_id', c.reward_collection_id,
        'reward_player_id', c.reward_player_id,
        'reward_is_new', c.reward_is_new
      ) ORDER BY c.opened_at DESC NULLS FIRST, c.earned_at)
      FROM (
        SELECT * FROM public.dynasty_chests WHERE user_id = p_uid AND opened_at IS NULL
        UNION ALL
        (SELECT * FROM public.dynasty_chests WHERE user_id = p_uid AND opened_at IS NOT NULL
         ORDER BY opened_at DESC LIMIT 10)
      ) c
    ), '[]'::jsonb),
    'run_rewards', coalesce((
      SELECT jsonb_agg(x ORDER BY x ->> 'awarded_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'client_run_id', rr.client_run_id,
          'points', rr.points,
          'reason', rr.reason,
          'chest_ids', to_jsonb(rr.chest_ids),
          'awarded_at', rr.awarded_at
        ) AS x
        FROM public.dynasty_run_rewards rr
        WHERE rr.user_id = p_uid
        ORDER BY rr.awarded_at DESC
        LIMIT 10
      ) recent
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.dynasty_snapshot(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

-- Start the free three-hour timer. Only max_unlocking chests count down at once.
CREATE OR REPLACE FUNCTION public.dynasty_chest_start_unlock(p_chest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.dynasty_require_user();
  s public.dynasty_chest_settings%ROWTYPE;
  c public.dynasty_chests%ROWTYPE;
BEGIN
  PERFORM public.dynasty_lock_user(v_uid);
  SELECT * INTO s FROM public.dynasty_chest_settings WHERE id;
  SELECT * INTO c FROM public.dynasty_chests WHERE id = p_chest_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chest_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF c.opened_at IS NOT NULL THEN
    RAISE EXCEPTION 'chest_opened' USING ERRCODE = '22023';
  END IF;
  -- Already counting down (or done): nothing to start, same answer as before.
  IF c.unlock_started_at IS NOT NULL THEN
    RETURN public.dynasty_snapshot(v_uid);
  END IF;
  IF (
    SELECT count(*) FROM public.dynasty_chests
    WHERE user_id = v_uid AND opened_at IS NULL AND unlock_ends_at > now()
  ) >= s.max_unlocking THEN
    RAISE EXCEPTION 'unlock_slot_busy' USING ERRCODE = '22023';
  END IF;

  UPDATE public.dynasty_chests
  SET unlock_started_at = now(),
      unlock_ends_at = now() + make_interval(secs => s.unlock_seconds),
      unlocked_by = 'timer'
  WHERE id = c.id;

  RETURN public.dynasty_snapshot(v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.dynasty_chest_start_unlock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dynasty_chest_start_unlock(uuid) TO authenticated;

-- Spend one key to finish a waiting or counting-down chest now. The key and the unlock are one
-- transaction: if the unlock can't happen, no key is spent. A retried request id is a no-op.
CREATE OR REPLACE FUNCTION public.dynasty_chest_use_key(p_chest_id uuid, p_request_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.dynasty_require_user();
  c public.dynasty_chests%ROWTYPE;
  v_ledger uuid;
BEGIN
  IF p_request_id IS NULL OR length(trim(p_request_id)) < 8 OR length(p_request_id) > 100 THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023';
  END IF;
  PERFORM public.dynasty_lock_user(v_uid);

  IF EXISTS (
    SELECT 1 FROM public.dynasty_key_ledger
    WHERE user_id = v_uid AND kind = 'use' AND ref = trim(p_request_id)
  ) THEN
    RETURN public.dynasty_snapshot(v_uid) || jsonb_build_object('already_applied', true);
  END IF;

  SELECT * INTO c FROM public.dynasty_chests WHERE id = p_chest_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chest_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF c.opened_at IS NOT NULL THEN
    RAISE EXCEPTION 'chest_opened' USING ERRCODE = '22023';
  END IF;
  IF c.unlock_ends_at IS NOT NULL AND c.unlock_ends_at <= now() THEN
    RAISE EXCEPTION 'chest_ready' USING ERRCODE = '22023';
  END IF;
  IF public.dynasty_key_balance(v_uid) < 1 THEN
    RAISE EXCEPTION 'no_keys' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dynasty_key_ledger (user_id, delta, kind, ref)
  VALUES (v_uid, -1, 'use', trim(p_request_id))
  RETURNING id INTO v_ledger;

  UPDATE public.dynasty_chests
  SET unlock_started_at = coalesce(unlock_started_at, now()),
      unlock_ends_at = now(),
      unlocked_by = 'key',
      key_ledger_id = v_ledger
  WHERE id = c.id;

  RETURN public.dynasty_snapshot(v_uid) || jsonb_build_object('already_applied', false);
END;
$$;

REVOKE ALL ON FUNCTION public.dynasty_chest_use_key(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dynasty_chest_use_key(uuid, text) TO authenticated;

-- Open a ready chest: roll its one player on the server, add it to the collection, record it.
-- Opening an opened chest returns the same reveal.
CREATE OR REPLACE FUNCTION public.dynasty_chest_open(p_chest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.dynasty_require_user();
  c public.dynasty_chests%ROWTYPE;
  v_pick jsonb;
  v_grant jsonb;
  v_new boolean;
  v_streak integer;
  v_completed boolean;
BEGIN
  PERFORM public.dynasty_lock_user(v_uid);
  SELECT * INTO c FROM public.dynasty_chests WHERE id = p_chest_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chest_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF c.opened_at IS NOT NULL THEN
    RETURN public.dynasty_snapshot(v_uid) || jsonb_build_object('reveal', jsonb_build_object(
      'chest_id', c.id,
      'tier', c.tier,
      'collection_id', c.reward_collection_id,
      'player_id', c.reward_player_id,
      'is_new', c.reward_is_new,
      'dup_streak', c.reward_dup_streak,
      'completed_now', false,
      'already_opened', true
    ));
  END IF;
  IF c.unlock_ends_at IS NULL OR c.unlock_ends_at > now() THEN
    RAISE EXCEPTION 'chest_locked' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dynasty_chest_progress (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  v_pick := public.dynasty_pick_reward(v_uid, c.tier, random());
  v_grant := public.dynasty_grant_player(v_uid, v_pick ->> 'collection_id', v_pick ->> 'player_id', 'chest', c.id::text);
  v_new := coalesce((v_grant ->> 'created')::boolean, false);
  v_completed := coalesce((v_grant ->> 'completed')::boolean, false);

  UPDATE public.dynasty_chest_progress
  SET dup_streak = CASE WHEN v_new THEN 0 ELSE dup_streak + 1 END,
      focus_collection_id = CASE
        WHEN v_completed AND focus_collection_id = v_pick ->> 'collection_id' THEN NULL
        ELSE focus_collection_id
      END,
      updated_at = now()
  WHERE user_id = v_uid
  RETURNING dup_streak INTO v_streak;

  UPDATE public.dynasty_chests
  SET opened_at = now(),
      reward_collection_id = v_pick ->> 'collection_id',
      reward_player_id = v_pick ->> 'player_id',
      reward_is_new = v_new,
      reward_dup_streak = v_streak
  WHERE id = c.id;

  RETURN public.dynasty_snapshot(v_uid) || jsonb_build_object('reveal', jsonb_build_object(
    'chest_id', c.id,
    'tier', c.tier,
    'collection_id', v_pick ->> 'collection_id',
    'player_id', v_pick ->> 'player_id',
    'is_new', v_new,
    'dup_streak', v_streak,
    'protected', (v_pick ->> 'protected')::boolean,
    'focus', (v_pick ->> 'focus')::boolean,
    'all_owned', (v_pick ->> 'all_owned')::boolean,
    'completed_now', v_completed,
    'already_opened', false
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.dynasty_chest_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dynasty_chest_open(uuid) TO authenticated;

-- Choose (or clear, with NULL) the Focus Dynasty. Free to change; finished dynasties can't be chosen.
CREATE OR REPLACE FUNCTION public.dynasty_set_focus(p_collection_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.dynasty_require_user();
BEGIN
  PERFORM public.dynasty_lock_user(v_uid);
  IF p_collection_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.dynasty_collections
      WHERE id = p_collection_id AND active AND kind = 'championship'
    ) THEN
      RAISE EXCEPTION 'focus_not_eligible' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.dynasty_completions
      WHERE user_id = v_uid AND collection_id = p_collection_id
    ) THEN
      RAISE EXCEPTION 'focus_completed' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.dynasty_chest_progress (user_id, focus_collection_id)
  VALUES (v_uid, p_collection_id)
  ON CONFLICT (user_id) DO UPDATE SET focus_collection_id = EXCLUDED.focus_collection_id, updated_at = now();

  RETURN public.dynasty_snapshot(v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.dynasty_set_focus(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dynasty_set_focus(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Purchased keys (service role only: called by the App Store validator, never by the app)
-- ---------------------------------------------------------------------------

-- Grant the keys for one verified Apple transaction. The same transaction id never grants twice,
-- whichever account presents it.
CREATE OR REPLACE FUNCTION public.dynasty_grant_key_purchase(
  p_user_id uuid,
  p_transaction_id text,
  p_product_id text,
  p_environment text DEFAULT 'Production'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_keys integer;
  v_owner uuid;
BEGIN
  IF p_user_id IS NULL OR p_transaction_id IS NULL OR length(trim(p_transaction_id)) = 0 THEN
    RAISE EXCEPTION 'invalid_purchase' USING ERRCODE = '22023';
  END IF;
  SELECT keys INTO v_keys FROM public.dynasty_key_products WHERE product_id = p_product_id AND active;
  IF v_keys IS NULL THEN
    RAISE EXCEPTION 'unknown_product' USING ERRCODE = '22023';
  END IF;

  PERFORM public.dynasty_lock_user(p_user_id);
  SELECT user_id INTO v_owner FROM public.dynasty_key_ledger
  WHERE kind = 'purchase' AND ref = trim(p_transaction_id);
  IF FOUND THEN
    IF v_owner <> p_user_id THEN
      RAISE EXCEPTION 'transaction_belongs_to_another_account' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('ok', true, 'granted', 0, 'duplicate', true, 'keys', public.dynasty_key_balance(p_user_id));
  END IF;

  INSERT INTO public.dynasty_key_ledger (user_id, delta, kind, ref, product_id, environment)
  VALUES (p_user_id, v_keys, 'purchase', trim(p_transaction_id), p_product_id, p_environment);

  RETURN jsonb_build_object('ok', true, 'granted', v_keys, 'duplicate', false, 'keys', public.dynasty_key_balance(p_user_id));
END;
$$;

REVOKE ALL ON FUNCTION public.dynasty_grant_key_purchase(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dynasty_grant_key_purchase(uuid, text, text, text) TO service_role;

-- Apple refunded or revoked a transaction: take its keys back once. Keys already spent stay spent,
-- so the balance can dip below zero until more keys arrive; no chest or player is ever removed.
CREATE OR REPLACE FUNCTION public.dynasty_revoke_key_purchase(p_transaction_id text, p_reason text DEFAULT 'refund')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  p public.dynasty_key_ledger%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.dynasty_key_ledger WHERE kind = 'purchase' AND ref = trim(p_transaction_id);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_transaction');
  END IF;
  PERFORM public.dynasty_lock_user(p.user_id);
  IF EXISTS (SELECT 1 FROM public.dynasty_key_ledger WHERE kind = 'refund' AND ref = p.ref) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'keys', public.dynasty_key_balance(p.user_id));
  END IF;
  INSERT INTO public.dynasty_key_ledger (user_id, delta, kind, ref, product_id, environment)
  VALUES (p.user_id, -p.delta, 'refund', p.ref, p.product_id, left(coalesce(p_reason, 'refund'), 40));
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'keys', public.dynasty_key_balance(p.user_id));
END;
$$;

REVOKE ALL ON FUNCTION public.dynasty_revoke_key_purchase(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dynasty_revoke_key_purchase(text, text) TO service_role;
