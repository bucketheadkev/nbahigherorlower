-- =============================================================================
-- REVIEW ONLY — do not auto-deploy.
-- Project target: rqogjyjfatnyuoorvyix
--
-- SECURE coin/bank v2 — addresses independent security review findings:
--  1) Trivia choices shuffled server-side (correct_index never returned)
--  2) One trivia attempt per (session, difficulty); no re-issue after terminal
--  3) Classic spins/picks validated against franchise_player_pool + seat values
--  4) No 45s minimum — rewards gated by validated session picks
--  5) Boosts require active open session UUID (never optional)
--  6) Idempotency keys use server session UUID only
--  7) Boost + coin/perk spend are single-transaction / retry-safe
--  8) spend_my_coins rejects (dedicated RPCs only)
--  9) Daily caps + open-run limits use per-user locks
-- 10) coin_post/bank_post re-asserted: FOR UPDATE, unique source, no client EXECUTE
-- 11) IAP: global unique tx, ownership, entitlements, revoke; service_role only
-- 12) No DELETE of balances/ledgers/inventories/entitlements
-- 13) Rollback companion drops dependents first; preserves history
-- =============================================================================

BEGIN;

-- ── Preflight ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(DISTINCT kind, ', ' ORDER BY kind) INTO v_bad
  FROM public.bank_ledger
  WHERE kind NOT IN (
    'achievement', 'classic_run_bonus', 'cash_table_wager', 'cash_table_payout',
    'cash_table_refund', 'league_entry', 'league_payout', 'league_refund',
    'admin_adjustment', 'franchise_purchase', 'franchise_payout', 'franchise_income',
    'franchise_sale', 'rank_reward', 'run_bonus', 'franchise_chest',
    'franchise_paycheck', 'franchise_card_sale', 'daily_wins_payout', 'trivia_bonus'
  );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'bank_ledger has unexpected kind(s): %. Extend CHECK before applying.', v_bad;
  END IF;
  IF to_regprocedure('public.coin_post(uuid,bigint,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'coin_post missing — apply 20261122_1_coin_ledger.sql first';
  END IF;
  IF to_regprocedure('public.bank_post(uuid,bigint,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'bank_post missing — apply bank ledger migrations first';
  END IF;
  IF to_regclass('public.franchise_player_pool') IS NULL THEN
    RAISE EXCEPTION 'franchise_player_pool missing — required for Classic validation';
  END IF;
  IF to_regclass('public.classic_player_seat_values') IS NULL THEN
    RAISE EXCEPTION 'classic_player_seat_values missing — required for Classic validation';
  END IF;
END $$;

-- Drop unsafe / superseded client surfaces (definitions only — no ledger rows).
DROP FUNCTION IF EXISTS public.credit_my_coins(bigint, text, text);
DROP FUNCTION IF EXISTS public.coin_spend_reroll(text);
DROP FUNCTION IF EXISTS public.coin_spend_reroll(text, text);
DROP FUNCTION IF EXISTS public.coin_grant_iap(uuid, text, text, bigint);
DROP FUNCTION IF EXISTS public.coin_grant_iap(uuid, text, text);
DROP FUNCTION IF EXISTS public.post_my_trivia_bonus(text, text);
DROP FUNCTION IF EXISTS public.trivia_answer(uuid, integer);
DROP FUNCTION IF EXISTS public.trivia_issue(text, text);
DROP FUNCTION IF EXISTS public.classic_boost_consume(text, text);
DROP FUNCTION IF EXISTS public.classic_run_complete(text);
DROP FUNCTION IF EXISTS public.classic_run_begin();
DROP FUNCTION IF EXISTS public.classic_run_begin(text);
DROP FUNCTION IF EXISTS public.trivia_issue(uuid, text);
DROP FUNCTION IF EXISTS public.coin_award_classic_run(text);
DROP FUNCTION IF EXISTS public.coin_grant_iap(uuid, text, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.iap_revoke_transaction(text);
DROP FUNCTION IF EXISTS public.classic_spin(uuid, text);
DROP FUNCTION IF EXISTS public.classic_spin_commit(uuid, text, text);
DROP FUNCTION IF EXISTS public.classic_pick_commit(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.classic_pick_commit(uuid, text, text);
DROP FUNCTION IF EXISTS public.classic_swap_commit(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.classic_boost_reroll(uuid, text, text);
DROP FUNCTION IF EXISTS public.classic_boost_reroll(uuid, text);
DROP FUNCTION IF EXISTS public.classic_perk_activate(uuid, text, text);
DROP FUNCTION IF EXISTS public.classic_perk_activate(uuid, text);
DROP FUNCTION IF EXISTS public.classic_run_submit(uuid);
DROP FUNCTION IF EXISTS public.classic_run_abandon(uuid);
DROP FUNCTION IF EXISTS public.submit_classic_leaderboard_lineup(jsonb, text);
DROP FUNCTION IF EXISTS public.submit_leaderboard_run(bigint, jsonb, text);

ALTER TABLE public.bank_ledger DROP CONSTRAINT IF EXISTS bank_ledger_kind_check;
ALTER TABLE public.bank_ledger
  ADD CONSTRAINT bank_ledger_kind_check CHECK (kind IN (
    'achievement', 'classic_run_bonus', 'cash_table_wager', 'cash_table_payout',
    'cash_table_refund', 'league_entry', 'league_payout', 'league_refund',
    'admin_adjustment', 'franchise_purchase', 'franchise_payout', 'franchise_income',
    'franchise_sale', 'rank_reward', 'run_bonus', 'franchise_chest',
    'franchise_paycheck', 'franchise_card_sale', 'daily_wins_payout', 'trivia_bonus'
  ));

-- ── Auth helper ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._require_permanent_uid()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public._require_permanent_uid() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._user_xact_lock(p_uid uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  -- Serialize currency / session mutations for one user inside this transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_uid::text, 84215045));
END;
$$;
REVOKE ALL ON FUNCTION public._user_xact_lock(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._require_service_role()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._require_service_role() FROM PUBLIC, anon, authenticated;

-- ── Re-assert coin_post / bank_post (permissions + semantics) ────────────────
CREATE OR REPLACE FUNCTION public.coin_post(
  p_user uuid,
  p_amount bigint,
  p_kind text,
  p_source_ref text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_balance bigint;
  v_entry bigint;
BEGIN
  IF p_user IS NULL OR p_amount IS NULL OR p_amount = 0 THEN
    RETURN false;
  END IF;
  IF length(trim(coalesce(p_source_ref, ''))) < 1 OR length(p_source_ref) > 200 THEN
    RAISE EXCEPTION 'invalid_source_ref' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.coin_accounts (user_id) VALUES (p_user)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.coin_accounts
  WHERE user_id = p_user
  FOR UPDATE;

  INSERT INTO public.coin_ledger (user_id, amount, kind, source_ref, metadata)
  VALUES (p_user, p_amount, p_kind, p_source_ref, coalesce(p_metadata, '{}'::jsonb))
  ON CONFLICT ON CONSTRAINT coin_ledger_unique_source DO NOTHING
  RETURNING id INTO v_entry;

  IF v_entry IS NULL THEN
    RETURN false; -- duplicate source (idempotent no-op)
  END IF;

  IF v_balance + p_amount < 0 THEN
    -- Unique row already inserted — remove it so a retry can succeed after funding.
    DELETE FROM public.coin_ledger WHERE id = v_entry;
    RAISE EXCEPTION 'insufficient_coins' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.coin_accounts
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.coin_post(uuid, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bank_post(
  p_user uuid,
  p_amount bigint,
  p_kind text,
  p_source_ref text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_balance bigint;
  v_entry bigint;
BEGIN
  IF p_user IS NULL OR p_amount IS NULL OR p_amount = 0 THEN
    RETURN false;
  END IF;
  IF length(trim(coalesce(p_source_ref, ''))) < 1 OR length(p_source_ref) > 200 THEN
    RAISE EXCEPTION 'invalid_source_ref' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.bank_accounts (user_id) VALUES (p_user)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.bank_accounts
  WHERE user_id = p_user
  FOR UPDATE;

  INSERT INTO public.bank_ledger (user_id, amount, kind, source_ref, metadata)
  VALUES (p_user, p_amount, p_kind, p_source_ref, coalesce(p_metadata, '{}'::jsonb))
  ON CONFLICT ON CONSTRAINT bank_ledger_unique_source DO NOTHING
  RETURNING id INTO v_entry;

  IF v_entry IS NULL THEN
    RETURN false;
  END IF;

  IF v_balance + p_amount < 0 THEN
    DELETE FROM public.bank_ledger WHERE id = v_entry;
    RAISE EXCEPTION 'insufficient_funds' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bank_accounts
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.bank_post(uuid, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── IAP catalog + transactions + entitlements ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.iap_product_catalog (
  product_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('coins','remove_ads','premium','pro_monthly','pro_yearly')),
  coins integer NOT NULL DEFAULT 0 CHECK (coins >= 0 AND coins <= 100000),
  billing text NOT NULL CHECK (billing IN ('consumable','non_consumable','subscription')),
  active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.iap_product_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.iap_product_catalog FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS iap_product_catalog_select ON public.iap_product_catalog;
CREATE POLICY iap_product_catalog_select ON public.iap_product_catalog
  FOR SELECT TO authenticated USING (active = true);
GRANT SELECT ON TABLE public.iap_product_catalog TO authenticated;

INSERT INTO public.iap_product_catalog (product_id, kind, coins, billing) VALUES
  ('com.1brun.coins.600', 'coins', 600, 'consumable'),
  ('com.1brun.coins.1200', 'coins', 1200, 'consumable'),
  ('com.1brun.coins.2600', 'coins', 2600, 'consumable'),
  ('com.1brun.coins.6000', 'coins', 6000, 'consumable'),
  ('com.1brun.coins.17000', 'coins', 17000, 'consumable'),
  ('com.1brun.removeads', 'remove_ads', 0, 'non_consumable'),
  ('com.1brun.premium', 'premium', 500, 'non_consumable'),
  ('com.1brun.pro.monthly', 'pro_monthly', 750, 'subscription'),
  ('com.1brun.pro.yearly', 'pro_yearly', 9000, 'subscription')
ON CONFLICT (product_id) DO UPDATE SET
  kind = EXCLUDED.kind,
  coins = EXCLUDED.coins,
  billing = EXCLUDED.billing,
  active = true;

CREATE TABLE IF NOT EXISTS public.iap_transactions (
  transaction_id text PRIMARY KEY CHECK (length(transaction_id) BETWEEN 4 AND 64),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.iap_product_catalog (product_id),
  original_transaction_id text,
  environment text,
  status text NOT NULL DEFAULT 'granted'
    CHECK (status IN ('granted', 'refunded', 'revoked')),
  granted_coins integer NOT NULL DEFAULT 0 CHECK (granted_coins >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iap_transactions_user_idx ON public.iap_transactions (user_id, created_at DESC);
ALTER TABLE public.iap_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.iap_transactions FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS iap_transactions_select_own ON public.iap_transactions;
CREATE POLICY iap_transactions_select_own ON public.iap_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);
GRANT SELECT ON TABLE public.iap_transactions TO authenticated;

CREATE TABLE IF NOT EXISTS public.user_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  remove_ads boolean NOT NULL DEFAULT false,
  premium boolean NOT NULL DEFAULT false,
  pro_active_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_entitlements FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS user_entitlements_select_own ON public.user_entitlements;
CREATE POLICY user_entitlements_select_own ON public.user_entitlements
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);
GRANT SELECT ON TABLE public.user_entitlements TO authenticated;

-- ── Classic run sessions (server-authoritative) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.classic_run_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'expired')),
  boosts_used integer NOT NULL DEFAULT 0 CHECK (boosts_used >= 0 AND boosts_used <= 3),
  free_team_left boolean NOT NULL DEFAULT true,
  free_era_left boolean NOT NULL DEFAULT true,
  spin_team text,
  spin_era text,
  spin_seq integer NOT NULL DEFAULT 0,
  picks jsonb NOT NULL DEFAULT '[]'::jsonb,
  perks jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_value bigint,
  leaderboard_run_id uuid
);

-- Migrate older shape if present (additive only).
ALTER TABLE public.classic_run_sessions ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.classic_run_sessions ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.classic_run_sessions ADD COLUMN IF NOT EXISTS free_team_left boolean;
ALTER TABLE public.classic_run_sessions ADD COLUMN IF NOT EXISTS free_era_left boolean;
ALTER TABLE public.classic_run_sessions ADD COLUMN IF NOT EXISTS spin_team text;
ALTER TABLE public.classic_run_sessions ADD COLUMN IF NOT EXISTS spin_era text;
ALTER TABLE public.classic_run_sessions ADD COLUMN IF NOT EXISTS spin_seq integer;
ALTER TABLE public.classic_run_sessions ADD COLUMN IF NOT EXISTS picks jsonb;
ALTER TABLE public.classic_run_sessions ADD COLUMN IF NOT EXISTS perks jsonb;
ALTER TABLE public.classic_run_sessions ADD COLUMN IF NOT EXISTS verified_value bigint;
ALTER TABLE public.classic_run_sessions ADD COLUMN IF NOT EXISTS leaderboard_run_id uuid;
-- Drop client_run_id uniqueness reliance; keep column if already there for legacy rows.
ALTER TABLE public.classic_run_sessions ADD COLUMN IF NOT EXISTS client_run_id text;

UPDATE public.classic_run_sessions
SET expires_at = coalesce(expires_at, started_at + interval '2 hours'),
    status = coalesce(nullif(status, ''), CASE WHEN completed_at IS NOT NULL THEN 'completed' ELSE 'open' END),
    free_team_left = coalesce(free_team_left, true),
    free_era_left = coalesce(free_era_left, true),
    spin_seq = coalesce(spin_seq, 0),
    picks = coalesce(picks, '[]'::jsonb),
    perks = coalesce(perks, '{}'::jsonb)
WHERE true;

CREATE INDEX IF NOT EXISTS classic_run_sessions_user_open_idx
  ON public.classic_run_sessions (user_id, started_at DESC)
  WHERE status = 'open';

ALTER TABLE public.classic_run_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.classic_run_sessions FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS classic_run_sessions_select_own ON public.classic_run_sessions;
CREATE POLICY classic_run_sessions_select_own ON public.classic_run_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);
GRANT SELECT ON TABLE public.classic_run_sessions TO authenticated;

CREATE OR REPLACE FUNCTION public._classic_session_lock(p_session uuid)
RETURNS public.classic_run_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  s public.classic_run_sessions%ROWTYPE;
BEGIN
  PERFORM public._user_xact_lock(v_uid);
  SELECT * INTO s FROM public.classic_run_sessions
  WHERE id = p_session AND user_id = v_uid
  FOR UPDATE;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'run_session_required' USING ERRCODE = 'P0001';
  END IF;
  IF s.status = 'open' AND s.expires_at < now() THEN
    UPDATE public.classic_run_sessions
    SET status = 'expired', completed_at = coalesce(completed_at, now())
    WHERE id = s.id
    RETURNING * INTO s;
  END IF;
  IF s.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'run_session_closed' USING ERRCODE = 'P0001';
  END IF;
  RETURN s;
END;
$$;
REVOKE ALL ON FUNCTION public._classic_session_lock(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.classic_run_begin()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  v_open integer;
  v_id uuid;
BEGIN
  PERFORM public._user_xact_lock(v_uid);

  -- Expire stale open sessions for this user.
  UPDATE public.classic_run_sessions
  SET status = 'expired', completed_at = coalesce(completed_at, now())
  WHERE user_id = v_uid AND status = 'open' AND expires_at < now();

  SELECT count(*)::integer INTO v_open
  FROM public.classic_run_sessions
  WHERE user_id = v_uid AND status = 'open';
  IF v_open >= 3 THEN
    RAISE EXCEPTION 'too_many_open_runs' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.classic_run_sessions (user_id)
  VALUES (v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.classic_run_begin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_run_begin() TO authenticated;

-- Validate a spun team/era against the Classic player pool + open seats.
CREATE OR REPLACE FUNCTION public.classic_spin_commit(p_session uuid, p_team text, p_era text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  s public.classic_run_sessions%ROWTYPE;
  v_team text := lower(trim(coalesce(p_team, '')));
  v_era text := trim(coalesce(p_era, ''));
  v_picked text[];
  v_open text[];
  v_ok boolean;
BEGIN
  s := public._classic_session_lock(p_session);
  IF v_team = '' OR v_era = '' THEN
    RAISE EXCEPTION 'invalid_spin' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(p ->> 'player_id'), ARRAY[]::text[]) INTO v_picked
  FROM jsonb_array_elements(s.picks) p;
  SELECT coalesce(array_agg(slot), ARRAY[]::text[]) INTO v_open
  FROM unnest(ARRAY['PG','SG','SF','PF','C']) slot
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(s.picks) p WHERE p ->> 'slot' = slot
  );
  IF coalesce(array_length(v_open, 1), 0) = 0 THEN
    RAISE EXCEPTION 'lineup_full' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.franchise_player_pool pool
    WHERE lower(pool.team_id) = v_team
      AND pool.era = v_era
      AND pool.eligible && v_open
      AND NOT (pool.player_id = ANY (v_picked))
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'invalid_spin_pair' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.classic_run_sessions
  SET spin_team = v_team,
      spin_era = v_era,
      spin_seq = spin_seq + 1
  WHERE id = s.id
  RETURNING * INTO s;

  RETURN jsonb_build_object(
    'session_id', s.id,
    'spin_team', s.spin_team,
    'spin_era', s.spin_era,
    'spin_seq', s.spin_seq,
    'boosts_used', s.boosts_used,
    'picks', s.picks
  );
END;
$$;
REVOKE ALL ON FUNCTION public.classic_spin_commit(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_spin_commit(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.classic_pick_commit(p_session uuid, p_player_id text, p_slot text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  s public.classic_run_sessions%ROWTYPE;
  pool public.franchise_player_pool%ROWTYPE;
  v_slot text := upper(trim(coalesce(p_slot, '')));
  v_player text := trim(coalesce(p_player_id, ''));
  v_value bigint;
BEGIN
  s := public._classic_session_lock(p_session);
  IF s.spin_team IS NULL OR s.spin_era IS NULL THEN
    RAISE EXCEPTION 'no_spin' USING ERRCODE = 'P0001';
  END IF;
  IF length(v_player) < 4 OR v_slot NOT IN ('PG','SG','SF','PF','C') THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(s.picks) p WHERE p ->> 'slot' = v_slot) THEN
    RAISE EXCEPTION 'duplicate_slot' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(s.picks) p WHERE p ->> 'player_id' = v_player) THEN
    RAISE EXCEPTION 'duplicate_player' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO pool FROM public.franchise_player_pool WHERE player_id = v_player;
  IF pool.player_id IS NULL
     OR lower(pool.team_id) IS DISTINCT FROM lower(s.spin_team)
     OR pool.era IS DISTINCT FROM s.spin_era
     OR NOT (v_slot = ANY (pool.eligible)) THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = 'P0001';
  END IF;

  v_value := public.classic_seat_value(v_player, v_slot);
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'unknown_player' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.classic_run_sessions
  SET picks = picks || jsonb_build_array(jsonb_build_object(
        'slot', v_slot,
        'player_id', v_player,
        'value', v_value,
        'team', s.spin_team,
        'era', s.spin_era,
        'spin_seq', s.spin_seq
      )),
      -- Double Draft: keep spin until second pick consumed.
      spin_team = CASE
        WHEN coalesce((perks ->> 'double_draft_left')::int, 0) > 1 THEN spin_team
        ELSE NULL
      END,
      spin_era = CASE
        WHEN coalesce((perks ->> 'double_draft_left')::int, 0) > 1 THEN spin_era
        ELSE NULL
      END,
      perks = CASE
        WHEN coalesce((perks ->> 'double_draft_left')::int, 0) > 0 THEN
          jsonb_set(perks, '{double_draft_left}', to_jsonb(greatest(0, (perks ->> 'double_draft_left')::int - 1)))
        ELSE perks
      END
  WHERE id = s.id
  RETURNING * INTO s;

  RETURN jsonb_build_object(
    'session_id', s.id,
    'picks', s.picks,
    'spin_team', s.spin_team,
    'spin_era', s.spin_era,
    'boosts_used', s.boosts_used
  );
END;
$$;
REVOKE ALL ON FUNCTION public.classic_pick_commit(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_pick_commit(uuid, text, text) TO authenticated;

-- Atomic boost: paid Team/Era reroll (100 coins) OR free first of each kind.
-- Never increments boosts_used unless payment succeeds (same transaction).
CREATE OR REPLACE FUNCTION public.classic_boost_reroll(p_session uuid, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  s public.classic_run_sessions%ROWTYPE;
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_free boolean := false;
  v_ref text;
  v_balance bigint;
BEGIN
  s := public._classic_session_lock(p_session);
  IF v_kind NOT IN ('reroll_team', 'reroll_era') THEN
    RAISE EXCEPTION 'invalid_boost' USING ERRCODE = '22023';
  END IF;
  IF s.boosts_used >= 3 THEN
    RAISE EXCEPTION 'boost_limit' USING ERRCODE = 'P0001';
  END IF;

  IF v_kind = 'reroll_team' AND s.free_team_left THEN
    v_free := true;
  ELSIF v_kind = 'reroll_era' AND s.free_era_left THEN
    v_free := true;
  END IF;

  IF NOT v_free THEN
    v_ref := 'reroll:' || s.id::text || ':' || v_kind || ':' || (s.boosts_used + 1)::text;
    IF NOT public.coin_post(s.user_id, -100, 'spend', v_ref, jsonb_build_object('session_id', s.id, 'kind', v_kind)) THEN
      -- Duplicate retry of same boost step — treat as success path for retry-safety.
      NULL;
    END IF;
  END IF;

  UPDATE public.classic_run_sessions
  SET boosts_used = boosts_used + 1,
      free_team_left = CASE WHEN v_kind = 'reroll_team' THEN false ELSE free_team_left END,
      free_era_left = CASE WHEN v_kind = 'reroll_era' THEN false ELSE free_era_left END,
      spin_team = NULL,
      spin_era = NULL
  WHERE id = s.id
  RETURNING * INTO s;

  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = s.user_id;
  RETURN jsonb_build_object(
    'session_id', s.id,
    'boosts_used', s.boosts_used,
    'free', v_free,
    'coins_balance', coalesce(v_balance, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.classic_boost_reroll(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_boost_reroll(uuid, text) TO authenticated;

-- Atomic perk activation: inventory consume OR 100-coin pay, then boost slot.
CREATE OR REPLACE FUNCTION public.classic_perk_activate(p_session uuid, p_perk text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  s public.classic_run_sessions%ROWTYPE;
  v_perk text := lower(trim(coalesce(p_perk, '')));
  v_stock integer := 0;
  v_used_inv boolean := false;
  v_ref text;
  v_balance bigint;
  v_key text;
BEGIN
  s := public._classic_session_lock(p_session);
  IF v_perk NOT IN ('double_draft', 'xray', 'player_swap') THEN
    RAISE EXCEPTION 'invalid_perk' USING ERRCODE = '22023';
  END IF;
  IF s.boosts_used >= 3 THEN
    RAISE EXCEPTION 'boost_limit' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(s.perks ->> ('used_' || v_perk), 'false') = 'true' THEN
    RAISE EXCEPTION 'perk_already_used' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_perk_inventory (user_id) VALUES (s.user_id) ON CONFLICT DO NOTHING;
  SELECT CASE v_perk
    WHEN 'double_draft' THEN double_draft
    WHEN 'xray' THEN xray
    ELSE player_swap
  END INTO v_stock
  FROM public.user_perk_inventory WHERE user_id = s.user_id FOR UPDATE;

  IF coalesce(v_stock, 0) > 0 THEN
    IF v_perk = 'double_draft' THEN
      UPDATE public.user_perk_inventory SET double_draft = double_draft - 1, updated_at = now() WHERE user_id = s.user_id;
    ELSIF v_perk = 'xray' THEN
      UPDATE public.user_perk_inventory SET xray = xray - 1, updated_at = now() WHERE user_id = s.user_id;
    ELSE
      UPDATE public.user_perk_inventory SET player_swap = player_swap - 1, updated_at = now() WHERE user_id = s.user_id;
    END IF;
    INSERT INTO public.user_perk_consumptions (user_id, perk, run_ref)
    VALUES (s.user_id, v_perk, s.id::text)
    ON CONFLICT DO NOTHING;
    v_used_inv := true;
  ELSE
    v_ref := 'perk_activate:' || v_perk || ':' || s.id::text;
    IF NOT public.coin_post(s.user_id, -100, 'spend', v_ref, jsonb_build_object('session_id', s.id, 'perk', v_perk)) THEN
      NULL; -- retry of same activation
    END IF;
  END IF;

  UPDATE public.classic_run_sessions
  SET boosts_used = boosts_used + 1,
      perks = perks
        || jsonb_build_object('used_' || v_perk, true)
        || CASE WHEN v_perk = 'double_draft' THEN jsonb_build_object('double_draft_left', 2)
                WHEN v_perk = 'xray' THEN jsonb_build_object('xray', true)
                WHEN v_perk = 'player_swap' THEN jsonb_build_object('player_swap', true)
                ELSE '{}'::jsonb END
  WHERE id = s.id
  RETURNING * INTO s;

  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = s.user_id;
  RETURN jsonb_build_object(
    'session_id', s.id,
    'boosts_used', s.boosts_used,
    'used_inventory', v_used_inv,
    'perks', s.perks,
    'coins_balance', coalesce(v_balance, 0),
    'inventory', public.perk_inventory_get()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.classic_perk_activate(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_perk_activate(uuid, text) TO authenticated;

-- Submit: server totals from committed picks only (ignores client-claimed values).
CREATE OR REPLACE FUNCTION public.classic_run_submit(p_session uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  s public.classic_run_sessions%ROWTYPE;
  v_uid uuid;
  v_total bigint := 0;
  v_item jsonb;
  v_slot text;
  v_player text;
  v_value bigint;
  v_seen_slots text[] := ARRAY[]::text[];
  v_seen_players text[] := ARRAY[]::text[];
  v_lineup jsonb := '[]'::jsonb;
  v_run_id uuid;
  v_prev_best bigint;
  v_is_new_best boolean := false;
  v_balance bigint;
  v_amount bigint;
  v_today integer;
BEGIN
  s := public._classic_session_lock(p_session);
  v_uid := s.user_id;

  IF jsonb_typeof(s.picks) IS DISTINCT FROM 'array' OR jsonb_array_length(s.picks) <> 5 THEN
    RAISE EXCEPTION 'incomplete_lineup' USING ERRCODE = 'P0001';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(s.picks)
  LOOP
    v_player := v_item ->> 'player_id';
    v_slot := upper(coalesce(v_item ->> 'slot', ''));
    IF v_slot NOT IN ('PG','SG','SF','PF','C') OR v_slot = ANY (v_seen_slots) OR v_player = ANY (v_seen_players) THEN
      RAISE EXCEPTION 'invalid_lineup' USING ERRCODE = '22023';
    END IF;
    -- Re-price from authoritative seat table (ignore stored client-facing value).
    v_value := public.classic_seat_value(v_player, v_slot);
    IF v_value IS NULL THEN
      RAISE EXCEPTION 'unknown_player' USING ERRCODE = 'P0001';
    END IF;
    -- Re-validate pool eligibility for recorded team/era.
    IF NOT EXISTS (
      SELECT 1 FROM public.franchise_player_pool pool
      WHERE pool.player_id = v_player
        AND lower(pool.team_id) = lower(coalesce(v_item ->> 'team', ''))
        AND pool.era = coalesce(v_item ->> 'era', '')
        AND v_slot = ANY (pool.eligible)
    ) THEN
      RAISE EXCEPTION 'invalid_pick_history' USING ERRCODE = 'P0001';
    END IF;
    v_seen_slots := array_append(v_seen_slots, v_slot);
    v_seen_players := array_append(v_seen_players, v_player);
    v_total := v_total + v_value;
    v_lineup := v_lineup || jsonb_build_array(jsonb_build_object('player_id', v_player, 'slot', v_slot));
  END LOOP;

  IF array_length(v_seen_slots, 1) <> 5 THEN
    RAISE EXCEPTION 'invalid_lineup' USING ERRCODE = '22023';
  END IF;

  -- Idempotent: already submitted this session.
  IF s.leaderboard_run_id IS NOT NULL THEN
    SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = v_uid;
    RETURN jsonb_build_object(
      'ok', true,
      'session_id', s.id,
      'verified_value', s.verified_value,
      'run_id', s.leaderboard_run_id,
      'duplicate', true,
      'coins_balance', coalesce(v_balance, 0)
    );
  END IF;

  INSERT INTO public.user_leaderboard_runs (user_id, verified_value, lineup, client_run_id, achieved_at)
  VALUES (v_uid, v_total, v_lineup, s.id::text, now())
  RETURNING id INTO v_run_id;

  SELECT verified_best INTO v_prev_best FROM public.user_leaderboard_pb WHERE user_id = v_uid;
  IF v_prev_best IS NULL OR v_total > v_prev_best THEN
    v_is_new_best := true;
    INSERT INTO public.user_leaderboard_pb (user_id, verified_best, best_run_id, achieved_at, updated_at)
    VALUES (v_uid, v_total, v_run_id, now(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET verified_best = EXCLUDED.verified_best,
          best_run_id = EXCLUDED.best_run_id,
          achieved_at = EXCLUDED.achieved_at,
          updated_at = EXCLUDED.updated_at;
  END IF;

  -- Daily run-award cap (race-safe: account already locked via _user_xact_lock).
  SELECT count(*)::integer INTO v_today
  FROM public.coin_ledger
  WHERE user_id = v_uid AND kind = 'run_award'
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc');
  IF v_today < 40 THEN
    v_amount := 20 + CASE WHEN v_total >= 1000000000 THEN 30 ELSE 0 END;
    PERFORM public.coin_post(
      v_uid, v_amount, 'run_award', 'run:' || s.id::text,
      jsonb_build_object('verified_value', v_total, 'session_id', s.id)
    );
  END IF;

  UPDATE public.classic_run_sessions
  SET status = 'completed',
      completed_at = now(),
      verified_value = v_total,
      leaderboard_run_id = v_run_id,
      spin_team = NULL,
      spin_era = NULL
  WHERE id = s.id;

  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = v_uid;
  RETURN jsonb_build_object(
    'ok', true,
    'session_id', s.id,
    'verified_value', v_total,
    'is_new_best', v_is_new_best,
    'run_id', v_run_id,
    'verified_best', CASE WHEN v_is_new_best THEN v_total ELSE coalesce(v_prev_best, 0) END,
    'coins_balance', coalesce(v_balance, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.classic_run_submit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_run_submit(uuid) TO authenticated;

-- Compatibility wrappers (reject client-chosen run ids).
CREATE OR REPLACE FUNCTION public.classic_run_begin(p_client_run_id text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  -- Ignore client-supplied ids; server UUID is canonical.
  RETURN public.classic_run_begin();
END;
$$;
REVOKE ALL ON FUNCTION public.classic_run_begin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_run_begin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.coin_award_classic_run(p_client_run_id text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  v_ref text := trim(coalesce(p_client_run_id, ''));
  s public.classic_run_sessions%ROWTYPE;
  v_balance bigint;
BEGIN
  PERFORM public._user_xact_lock(v_uid);
  -- Only accept canonical session UUID strings.
  IF v_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'run_session_required' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO s FROM public.classic_run_sessions WHERE id = v_ref::uuid AND user_id = v_uid FOR UPDATE;
  IF s.id IS NULL OR s.leaderboard_run_id IS NULL OR s.verified_value IS NULL THEN
    RAISE EXCEPTION 'run_not_verified' USING ERRCODE = 'P0001';
  END IF;
  -- Award already attempted inside classic_run_submit; this is idempotent pull.
  PERFORM public.coin_post(
    v_uid,
    20 + CASE WHEN s.verified_value >= 1000000000 THEN 30 ELSE 0 END,
    'run_award',
    'run:' || s.id::text,
    jsonb_build_object('verified_value', s.verified_value, 'session_id', s.id)
  );
  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = v_uid;
  RETURN coalesce(v_balance, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.coin_award_classic_run(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coin_award_classic_run(text) TO authenticated;

-- Soft cap: classic_run_bonus Bank posts per UTC day (locked via bank_post FOR UPDATE).
CREATE OR REPLACE FUNCTION public._bank_classic_run_bonus_daily_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE v_n integer;
BEGIN
  IF NEW.kind = 'classic_run_bonus' THEN
    SELECT count(*)::integer INTO v_n
    FROM public.bank_ledger
    WHERE user_id = NEW.user_id AND kind = 'classic_run_bonus'
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc');
    IF v_n >= 40 THEN
      RAISE EXCEPTION 'classic_run_bonus_daily_cap' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bank_ledger_classic_run_bonus_guard ON public.bank_ledger;
CREATE TRIGGER bank_ledger_classic_run_bonus_guard
  BEFORE INSERT ON public.bank_ledger
  FOR EACH ROW EXECUTE FUNCTION public._bank_classic_run_bonus_daily_guard();

-- ── Perk inventory tables (preserve existing stock) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.user_perk_inventory (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  double_draft integer NOT NULL DEFAULT 0 CHECK (double_draft >= 0),
  xray integer NOT NULL DEFAULT 0 CHECK (xray >= 0),
  player_swap integer NOT NULL DEFAULT 0 CHECK (player_swap >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_perk_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_perk_inventory FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS user_perk_inventory_select_own ON public.user_perk_inventory;
CREATE POLICY user_perk_inventory_select_own ON public.user_perk_inventory
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);
GRANT SELECT ON TABLE public.user_perk_inventory TO authenticated;

CREATE TABLE IF NOT EXISTS public.user_perk_consumptions (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  perk text NOT NULL CHECK (perk IN ('double_draft', 'xray', 'player_swap')),
  run_ref text NOT NULL CHECK (length(run_ref) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, perk, run_ref)
);
ALTER TABLE public.user_perk_consumptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_perk_consumptions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.perk_inventory_get()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  r public.user_perk_inventory%ROWTYPE;
BEGIN
  INSERT INTO public.user_perk_inventory (user_id) VALUES (v_uid) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.user_perk_inventory WHERE user_id = v_uid;
  RETURN jsonb_build_object(
    'double_draft', coalesce(r.double_draft, 0),
    'xray', coalesce(r.xray, 0),
    'player_swap', coalesce(r.player_swap, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.perk_inventory_get() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perk_inventory_get() TO authenticated;

CREATE OR REPLACE FUNCTION public.coin_claim_welcome()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  v_balance bigint;
BEGIN
  PERFORM public._user_xact_lock(v_uid);
  PERFORM public.coin_post(v_uid, 200, 'welcome', 'welcome_v1', '{}'::jsonb);
  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = v_uid;
  RETURN coalesce(v_balance, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.coin_claim_welcome() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coin_claim_welcome() TO authenticated;

CREATE OR REPLACE FUNCTION public.coin_buy_perk_pack(p_perk text, p_request_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  v_perk text := lower(trim(coalesce(p_perk, '')));
  v_req text := trim(coalesce(p_request_id, ''));
  v_price integer;
  v_qty integer := 5;
  v_ref text;
  v_ok boolean;
BEGIN
  PERFORM public._user_xact_lock(v_uid);
  v_price := CASE v_perk
    WHEN 'double_draft' THEN 500 WHEN 'xray' THEN 600 WHEN 'player_swap' THEN 750 ELSE NULL END;
  IF v_price IS NULL THEN RAISE EXCEPTION 'invalid_perk' USING ERRCODE = '22023'; END IF;
  IF length(v_req) < 8 OR length(v_req) > 80 THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023'; END IF;
  v_ref := 'perk_pack:' || v_perk || ':' || v_req;
  v_ok := public.coin_post(v_uid, -v_price, 'spend', v_ref, jsonb_build_object('perk', v_perk, 'qty', v_qty));
  IF NOT v_ok THEN RETURN public.perk_inventory_get(); END IF;
  INSERT INTO public.user_perk_inventory (user_id) VALUES (v_uid) ON CONFLICT DO NOTHING;
  IF v_perk = 'double_draft' THEN
    UPDATE public.user_perk_inventory SET double_draft = double_draft + v_qty, updated_at = now() WHERE user_id = v_uid;
  ELSIF v_perk = 'xray' THEN
    UPDATE public.user_perk_inventory SET xray = xray + v_qty, updated_at = now() WHERE user_id = v_uid;
  ELSE
    UPDATE public.user_perk_inventory SET player_swap = player_swap + v_qty, updated_at = now() WHERE user_id = v_uid;
  END IF;
  RETURN public.perk_inventory_get();
END;
$$;
REVOKE ALL ON FUNCTION public.coin_buy_perk_pack(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coin_buy_perk_pack(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.coin_buy_perk_bundle(p_request_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  v_req text := trim(coalesce(p_request_id, ''));
  v_ok boolean;
BEGIN
  PERFORM public._user_xact_lock(v_uid);
  IF length(v_req) < 8 OR length(v_req) > 80 THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023'; END IF;
  v_ok := public.coin_post(v_uid, -3000, 'spend', 'perk_bundle:' || v_req, jsonb_build_object('bundle', true));
  IF NOT v_ok THEN RETURN public.perk_inventory_get(); END IF;
  INSERT INTO public.user_perk_inventory (user_id) VALUES (v_uid) ON CONFLICT DO NOTHING;
  UPDATE public.user_perk_inventory SET
    double_draft = double_draft + 10, xray = xray + 10, player_swap = player_swap + 10, updated_at = now()
  WHERE user_id = v_uid;
  RETURN public.perk_inventory_get();
END;
$$;
REVOKE ALL ON FUNCTION public.coin_buy_perk_bundle(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coin_buy_perk_bundle(text) TO authenticated;

-- Reject generic spend — dedicated RPCs only (cannot bypass boost/perk/pack pricing).
CREATE OR REPLACE FUNCTION public.spend_my_coins(p_amount bigint, p_source_ref text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  PERFORM public._require_permanent_uid();
  RAISE EXCEPTION 'use_dedicated_rpc' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.spend_my_coins(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_my_coins(bigint, text) TO authenticated;

-- Legacy perk_consume / coin_spend_reroll redirected to session-bound RPCs.
CREATE OR REPLACE FUNCTION public.perk_consume(p_perk text, p_run_ref text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE v_ref text := trim(coalesce(p_run_ref, ''));
BEGIN
  IF v_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'run_session_required' USING ERRCODE = 'P0001';
  END IF;
  RETURN public.classic_perk_activate(v_ref::uuid, p_perk);
END;
$$;
REVOKE ALL ON FUNCTION public.perk_consume(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perk_consume(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.coin_spend_reroll(p_source_ref text, p_client_run_id text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_run text := nullif(trim(coalesce(p_client_run_id, '')), '');
  v_kind text := CASE WHEN coalesce(p_source_ref,'') ILIKE '%era%' THEN 'reroll_era' ELSE 'reroll_team' END;
  v_out jsonb;
BEGIN
  IF v_run IS NULL OR v_run !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'run_session_required' USING ERRCODE = 'P0001';
  END IF;
  v_out := public.classic_boost_reroll(v_run::uuid, v_kind);
  RETURN coalesce((v_out ->> 'coins_balance')::bigint, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.coin_spend_reroll(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coin_spend_reroll(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.classic_boost_consume(p_client_run_id text, p_kind text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_run text := trim(coalesce(p_client_run_id, ''));
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_out jsonb;
BEGIN
  IF v_run !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'run_session_required' USING ERRCODE = 'P0001';
  END IF;
  IF v_kind LIKE 'perk_%' THEN
    v_out := public.classic_perk_activate(v_run::uuid, substr(v_kind, 6));
  ELSE
    v_out := public.classic_boost_reroll(v_run::uuid, v_kind);
  END IF;
  RETURN coalesce((v_out ->> 'boosts_used')::integer, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.classic_boost_consume(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_boost_consume(text, text) TO authenticated;

-- ── Trivia ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trivia_questions (
  id text PRIMARY KEY,
  difficulty text NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  correct_index smallint NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  prompt text NOT NULL,
  choices jsonb NOT NULL
);
ALTER TABLE public.trivia_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_questions FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.trivia_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES public.trivia_questions (id),
  difficulty text NOT NULL,
  session_id uuid NOT NULL,
  correct_index smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  answered_at timestamptz,
  choice_index smallint,
  correct boolean,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'correct', 'incorrect', 'expired'))
);
-- Unique index created after session_id backfill (see below).
CREATE INDEX IF NOT EXISTS trivia_challenges_user_created_idx
  ON public.trivia_challenges (user_id, created_at DESC);
ALTER TABLE public.trivia_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_challenges FROM PUBLIC, anon, authenticated;

-- Migrate older trivia_challenges that used client_run_id.
ALTER TABLE public.trivia_challenges ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE public.trivia_challenges ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.trivia_challenges ADD COLUMN IF NOT EXISTS client_run_id text;
DO $$
BEGIN
  -- Allow legacy rows; new writes always set session_id (+ client_run_id mirror).
  BEGIN
    ALTER TABLE public.trivia_challenges ALTER COLUMN client_run_id DROP NOT NULL;
  EXCEPTION WHEN others THEN
    NULL;
  END;
END $$;
UPDATE public.trivia_challenges
SET session_id = coalesce(session_id,
  CASE
    WHEN client_run_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN client_run_id::uuid
    ELSE NULL
  END)
WHERE session_id IS NULL;

ALTER TABLE public.trivia_challenges
  ALTER COLUMN status SET DEFAULT 'open';

-- Drop incomplete rows that can never be keyed (pre-secure leftovers).
DELETE FROM public.trivia_challenges WHERE session_id IS NULL AND answered_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trivia_challenges_session_diff_uidx
  ON public.trivia_challenges (user_id, session_id, difficulty)
  WHERE session_id IS NOT NULL;

UPDATE public.trivia_challenges
SET status = coalesce(nullif(status, ''),
  CASE
    WHEN answered_at IS NOT NULL AND correct IS TRUE THEN 'correct'
    WHEN answered_at IS NOT NULL THEN 'incorrect'
    WHEN expires_at < now() THEN 'expired'
    ELSE 'open'
  END)
WHERE true;

INSERT INTO public.trivia_questions (id, difficulty, correct_index, prompt, choices) VALUES
('e001', 'easy', 0, 'Which team drafted LeBron James first overall in 2003?', '["Cleveland Cavaliers","Los Angeles Lakers","Chicago Bulls","Miami Heat"]'::jsonb),
('e002', 'easy', 1, 'How many points is a made free throw worth?', '["4","1","2","3"]'::jsonb),
('e003', 'easy', 2, 'Which NBA franchise is nicknamed the Celtics?', '["Brooklyn","Toronto","Boston","Philadelphia"]'::jsonb),
('e004', 'easy', 3, 'Michael Jordan won six championships with which team?', '["Washington Wizards","New York Knicks","Charlotte Hornets","Chicago Bulls"]'::jsonb),
('e005', 'easy', 0, 'How many players are on the court for one NBA team at a time?', '["5","4","7","6"]'::jsonb),
('e006', 'easy', 1, 'Which position is typically abbreviated ''PG''?', '["Pivot Guard","Point Guard","Power Guard","Post Guard"]'::jsonb),
('e007', 'easy', 2, 'Kobe Bryant spent his entire NBA career with which franchise?', '["Los Angeles Clippers","Philadelphia 76ers","Los Angeles Lakers","Boston Celtics"]'::jsonb),
('e008', 'easy', 3, 'How many quarters are in a regulation NBA game?', '["3","2","5","4"]'::jsonb),
('e009', 'easy', 0, 'Which team plays home games at Madison Square Garden?', '["New York Knicks","Brooklyn Nets","Boston Celtics","Philadelphia 76ers"]'::jsonb),
('e010', 'easy', 1, 'Stephen Curry is best known for popularizing what shot?', '["Finger roll","Three-pointer","Hook shot","Skyhook"]'::jsonb),
('e011', 'easy', 2, 'Which team won the 2016 NBA Finals after trailing 3–1?', '["San Antonio Spurs","Golden State Warriors","Cleveland Cavaliers","Miami Heat"]'::jsonb),
('e012', 'easy', 3, 'Shaquille O''Neal attended which university?', '["North Carolina","Duke","Kentucky","LSU"]'::jsonb),
('e013', 'easy', 0, 'Which NBA team is based in Toronto?', '["Raptors","Blue Jays","Argonauts","Maple Leafs"]'::jsonb),
('e014', 'easy', 1, 'Tim Duncan spent his entire career with which franchise?', '["Phoenix Suns","San Antonio Spurs","Orlando Magic","Dallas Mavericks"]'::jsonb),
('e015', 'easy', 2, 'What is the foul limit before an NBA player fouls out?', '["7","5","6","4"]'::jsonb),
('e016', 'easy', 3, 'Which player is nicknamed ''The King''?', '["Kawhi Leonard","Kevin Durant","Giannis Antetokounmpo","LeBron James"]'::jsonb),
('e017', 'easy', 0, 'The NBA logo silhouette is widely believed to depict which player?', '["Jerry West","Magic Johnson","Michael Jordan","Larry Bird"]'::jsonb),
('e018', 'easy', 1, 'Dirk Nowitzki won his only NBA title with which team?', '["Milwaukee Bucks","Dallas Mavericks","San Antonio Spurs","Houston Rockets"]'::jsonb),
('e019', 'easy', 2, 'Which city do the Heat call home?', '["Tampa","Orlando","Miami","Jacksonville"]'::jsonb),
('e020', 'easy', 3, 'Magic Johnson played his Hall of Fame career with which team?', '["Chicago Bulls","Los Angeles Clippers","Boston Celtics","Los Angeles Lakers"]'::jsonb),
('e021', 'easy', 0, 'Larry Bird is most associated with which franchise?', '["Boston Celtics","Chicago Bulls","Indiana Pacers","Golden State Warriors"]'::jsonb),
('e022', 'easy', 1, 'Which award is given to the league''s most valuable player each season?', '["DPOY","MVP","MIP","ROY"]'::jsonb),
('e023', 'easy', 2, 'How long is an NBA shot clock, in seconds?', '["20","35","24","30"]'::jsonb),
('e024', 'easy', 3, 'Michael Jordan''s final two NBA seasons were with which team?', '["Charlotte Hornets","Chicago Bulls","Miami Heat","Washington Wizards"]'::jsonb),
('e025', 'easy', 0, 'Which franchise has won the most NBA championships?', '["Boston Celtics","Golden State Warriors","Chicago Bulls","Los Angeles Lakers"]'::jsonb),
('e026', 'easy', 1, 'Kevin Durant won his first NBA title with which team?', '["Phoenix Suns","Golden State Warriors","Brooklyn Nets","Oklahoma City Thunder"]'::jsonb),
('e027', 'easy', 2, 'Which player is commonly called ''KD''?', '["Kyrie Irving","Kawhi Leonard","Kevin Durant","Karl-Anthony Towns"]'::jsonb),
('e028', 'easy', 3, 'The Spurs are based in which Texas city?', '["Houston","Dallas","Austin","San Antonio"]'::jsonb),
('e029', 'easy', 0, 'Which team drafted Giannis Antetokounmpo?', '["Milwaukee Bucks","Boston Celtics","Atlanta Hawks","Toronto Raptors"]'::jsonb),
('e030', 'easy', 1, 'What does ''NBA'' stand for?', '["North Basketball Alliance","National Basketball Association","National Ball Association","National Basketball Alliance"]'::jsonb),
('e031', 'easy', 2, 'Which jersey number did Michael Jordan make iconic with the Bulls?', '["45","12","23","9"]'::jsonb),
('e032', 'easy', 3, 'Who invented the game of basketball?', '["Bill Russell","James Madison","Amos Alonzo Stagg","James Naismith"]'::jsonb),
('e033', 'easy', 0, 'Which Bay Area franchise is nicknamed the Warriors?', '["Golden State","Portland","Sacramento","Los Angeles"]'::jsonb),
('e034', 'easy', 1, 'Chris Paul primarily plays which position?', '["Center","Point guard","Power forward","Shooting guard"]'::jsonb),
('e035', 'easy', 2, 'In which year was Anthony Davis selected No. 1 overall?', '["2014","2011","2012","2013"]'::jsonb),
('e036', 'easy', 3, 'The NBA Finals MVP trophy is named after which legend?', '["Larry Bird","Kareem Abdul-Jabbar","Magic Johnson","Bill Russell"]'::jsonb),
('e037', 'easy', 0, 'Kawhi Leonard won his first NBA title with which team?', '["San Antonio Spurs","Miami Heat","Los Angeles Clippers","Toronto Raptors"]'::jsonb),
('e038', 'easy', 1, 'Which Canadian city hosts an NBA franchise?', '["Montreal","Toronto","Vancouver","Ottawa"]'::jsonb),
('e039', 'easy', 2, 'Who scored 100 points in a single NBA game?', '["Elgin Baylor","Michael Jordan","Wilt Chamberlain","Kobe Bryant"]'::jsonb),
('e040', 'easy', 3, 'Kobe Bryant scored 81 points in 2006 against which team?', '["Boston Celtics","Miami Heat","Dallas Mavericks","Toronto Raptors"]'::jsonb),
('e041', 'easy', 0, 'Which position abbreviation is ''C''?', '["Center","Clipper","Captain","Coach"]'::jsonb),
('e042', 'easy', 1, 'Dwyane Wade won most of his titles with which franchise?', '["Philadelphia 76ers","Miami Heat","Chicago Bulls","Cleveland Cavaliers"]'::jsonb),
('e043', 'easy', 2, 'Which team is nicknamed the ''Sixers''?', '["Phoenix Suns","San Antonio Spurs","Philadelphia 76ers","Sacramento Kings"]'::jsonb),
('e044', 'easy', 3, 'Russell Westbrook averaged a triple-double in 2016–17 with which team?', '["Los Angeles Lakers","Houston Rockets","Washington Wizards","Oklahoma City Thunder"]'::jsonb),
('e045', 'easy', 0, 'Which arena is home to the Chicago Bulls?', '["United Center","Crypto.com Arena","TD Garden","Madison Square Garden"]'::jsonb),
('e046', 'easy', 1, 'Steve Nash won back-to-back MVPs with which team?', '["Los Angeles Lakers","Phoenix Suns","Toronto Raptors","Dallas Mavericks"]'::jsonb),
('e047', 'easy', 2, 'Which team drafted Zion Williamson No. 1 overall?', '["Charlotte Hornets","Memphis Grizzlies","New Orleans Pelicans","Atlanta Hawks"]'::jsonb),
('e048', 'easy', 3, 'How many teams are currently in the NBA?', '["28","29","32","30"]'::jsonb),
('e049', 'easy', 0, 'Which conference includes the Los Angeles Lakers?', '["Western","Eastern","Northern","Southern"]'::jsonb),
('e050', 'easy', 1, 'Allen Iverson won MVP while playing for which team?', '["Denver Nuggets","Philadelphia 76ers","Brooklyn Nets","Detroit Pistons"]'::jsonb),
('e051', 'easy', 2, 'Which player is nicknamed ''The Greek Freak''?', '["Luka Doncic","Nikola Jokic","Giannis Antetokounmpo","Kristaps Porzingis"]'::jsonb),
('e052', 'easy', 3, 'How many NBA titles did the Chicago Bulls win in the 1990s?', '["7","5","3","6"]'::jsonb),
('e053', 'easy', 0, 'Ray Allen helped which team win the 2008 NBA title?', '["Boston Celtics","Seattle SuperSonics","Miami Heat","Milwaukee Bucks"]'::jsonb),
('e054', 'easy', 1, 'Who is the NBA''s all-time leading scorer in career points?', '["Kobe Bryant","LeBron James","Kareem Abdul-Jabbar","Karl Malone"]'::jsonb),
('e055', 'easy', 2, 'Which Seattle franchise relocated and became the Oklahoma City Thunder?', '["Grizzlies","Sonics Stars","SuperSonics","Hornets"]'::jsonb),
('e056', 'easy', 3, 'Pau Gasol won two titles with which franchise?', '["Chicago Bulls","Memphis Grizzlies","San Antonio Spurs","Los Angeles Lakers"]'::jsonb),
('e057', 'easy', 0, 'Which award goes to the league''s top defensive player?', '["DPOY","MVP","ROY","SMOY"]'::jsonb),
('e058', 'easy', 1, 'Tony Parker was a longtime star for which team?', '["Phoenix Suns","San Antonio Spurs","Charlotte Hornets","New York Knicks"]'::jsonb),
('e059', 'easy', 2, 'Besides No. 8, which number did Kobe Bryant famously wear?', '["23","10","24","33"]'::jsonb),
('e060', 'easy', 3, 'Wade, James, and Bosh formed a Big Three in which city?', '["Los Angeles","Boston","Cleveland","Miami"]'::jsonb),
('e061', 'easy', 0, 'Which team drafted Damian Lillard?', '["Portland Trail Blazers","Sacramento Kings","Utah Jazz","Denver Nuggets"]'::jsonb),
('e062', 'easy', 1, 'Manu Ginóbili is a Hall of Famer from which country?', '["Italy","Argentina","Brazil","Spain"]'::jsonb),
('e063', 'easy', 2, 'Which team won the 2020 NBA championship in the Orlando bubble?', '["Los Angeles Clippers","Miami Heat","Los Angeles Lakers","Boston Celtics"]'::jsonb),
('e064', 'easy', 3, 'Nikola Jokić plays for which franchise?', '["Phoenix Suns","Minnesota Timberwolves","Oklahoma City Thunder","Denver Nuggets"]'::jsonb),
('e065', 'easy', 0, 'A field goal made from beyond the arc is worth how many points?', '["3","4","1","2"]'::jsonb),
('e066', 'easy', 1, 'How many NBA championships did Bill Russell win as a player?', '["6","11","8","10"]'::jsonb),
('e067', 'easy', 2, 'Which team is nicknamed the Knicks?', '["Queens","Brooklyn","New York","New Jersey"]'::jsonb),
('e068', 'easy', 3, 'David Robinson was nicknamed what?', '["The Navy","The Captain","The General","The Admiral"]'::jsonb),
('e069', 'easy', 0, 'Which college did Larry Bird attend?', '["Indiana State","Boston College","Indiana","Kentucky"]'::jsonb),
('e070', 'easy', 1, 'Kevin Garnett won a title in 2008 with which team?', '["Brooklyn Nets","Boston Celtics","Minnesota Timberwolves","Dallas Mavericks"]'::jsonb),
('e071', 'easy', 2, 'Which player announced ''The Decision'' to join Miami in 2010?', '["Kyrie Irving","Chris Bosh","LeBron James","Dwyane Wade"]'::jsonb),
('e072', 'easy', 3, 'The Timberwolves play in which city?', '["Detroit","Des Moines","Milwaukee","Minneapolis"]'::jsonb),
('e073', 'easy', 0, 'Which team drafted Hakeem Olajuwon No. 1 overall in 1984?', '["Houston Rockets","Dallas Mavericks","Chicago Bulls","Portland Trail Blazers"]'::jsonb),
('e074', 'easy', 1, 'Patrick Ewing was a star center primarily for which franchise?', '["Orlando Magic","New York Knicks","Seattle SuperSonics","Charlotte Hornets"]'::jsonb),
('e075', 'easy', 2, 'Which team won back-to-back titles in 2017 and 2018?', '["Cleveland Cavaliers","Toronto Raptors","Golden State Warriors","Houston Rockets"]'::jsonb),
('e076', 'easy', 3, 'Who is nicknamed ''The Beard''?', '["Kawhi Leonard","Paul George","Joel Embiid","James Harden"]'::jsonb),
('e077', 'easy', 0, 'Which NBA team is based in Salt Lake City?', '["Utah Jazz","Denver Nuggets","Oklahoma City Thunder","Portland Trail Blazers"]'::jsonb),
('e078', 'easy', 1, 'Did Charles Barkley ever win an NBA championship?', '["Yes, with Phoenix","No","Yes, with Philadelphia","Yes, with Houston"]'::jsonb),
('e079', 'easy', 2, 'Which team drafted Blake Griffin No. 1 overall in 2009?', '["Detroit Pistons","Brooklyn Nets","Los Angeles Clippers","Oklahoma City Thunder"]'::jsonb),
('e080', 'easy', 3, 'The ''Showtime'' Lakers were led by which point guard?', '["Kareem Abdul-Jabbar","Byron Scott","James Worthy","Magic Johnson"]'::jsonb),
('e081', 'easy', 0, 'Who holds the NBA record for most career assists?', '["John Stockton","Jason Kidd","Chris Paul","Steve Nash"]'::jsonb),
('e082', 'easy', 1, 'Vince Carter''s famous Olympic dunk over Frédéric Weis came while he was with which NBA team?', '["Memphis Grizzlies","Toronto Raptors","Orlando Magic","New Jersey Nets"]'::jsonb),
('e083', 'easy', 2, 'Reggie Miller was a career icon for which franchise?', '["Milwaukee Bucks","Los Angeles Clippers","Indiana Pacers","New York Knicks"]'::jsonb),
('e084', 'easy', 3, 'In which year did the Bulls complete their first three-peat?', '["1992","1991","1996","1993"]'::jsonb),
('e085', 'easy', 0, 'Who won Finals MVP for the 2014 Spurs?', '["Kawhi Leonard","Tim Duncan","Tony Parker","Manu Ginóbili"]'::jsonb),
('e086', 'easy', 1, 'Yao Ming was drafted No. 1 overall by which team?', '["Chicago Bulls","Houston Rockets","New York Knicks","San Antonio Spurs"]'::jsonb),
('e087', 'easy', 2, 'Which player is known for the ''skyhook''?', '["Bill Walton","Wilt Chamberlain","Kareem Abdul-Jabbar","Hakeem Olajuwon"]'::jsonb),
('e088', 'easy', 3, 'Which team won the 2019 NBA championship?', '["Milwaukee Bucks","Los Angeles Lakers","Golden State Warriors","Toronto Raptors"]'::jsonb),
('e089', 'easy', 0, 'Which team received Trae Young in a draft-night trade in 2018?', '["Atlanta Hawks","New York Knicks","Dallas Mavericks","Chicago Bulls"]'::jsonb),
('e090', 'easy', 1, 'The Clippers share a market with which other NBA team?', '["Kings","Lakers","Suns","Warriors"]'::jsonb),
('e091', 'easy', 2, 'Who is Stephen Curry''s fellow ''Splash Brother''?', '["Andre Iguodala","Draymond Green","Klay Thompson","Kevin Durant"]'::jsonb),
('e092', 'easy', 3, 'Which team won the NBA championship in 2021?', '["Phoenix Suns","Atlanta Hawks","Brooklyn Nets","Milwaukee Bucks"]'::jsonb),
('e093', 'easy', 0, 'Joel Embiid plays for which team?', '["Philadelphia 76ers","Minnesota Timberwolves","Miami Heat","Oklahoma City Thunder"]'::jsonb),
('e094', 'easy', 1, 'Which college did Steph Curry play for?', '["Duke","Davidson","Kentucky","North Carolina"]'::jsonb),
('e095', 'easy', 2, 'Scottie Pippen was Michael Jordan''s longtime teammate on which team?', '["Houston Rockets","Portland Trail Blazers","Chicago Bulls","Miami Heat"]'::jsonb),
('e096', 'easy', 3, 'Which team acquired Dirk Nowitzki on draft night in 1998?', '["Phoenix Suns","San Antonio Spurs","Milwaukee Bucks","Dallas Mavericks"]'::jsonb),
('e097', 'easy', 0, 'Which award is given to the NBA''s top rookie?', '["ROY","MIP","SMOY","MVP"]'::jsonb),
('e098', 'easy', 1, 'Which city is home to the Trail Blazers?', '["Salt Lake City","Portland","Sacramento","Seattle"]'::jsonb),
('e099', 'easy', 2, 'Who won Finals MVP for Toronto in 2019?', '["Pascal Siakam","Fred VanVleet","Kawhi Leonard","Kyle Lowry"]'::jsonb),
('e100', 'easy', 3, 'Which team won the 2022 NBA championship?', '["Boston Celtics","Dallas Mavericks","Miami Heat","Golden State Warriors"]'::jsonb),
('m001', 'medium', 0, 'Who won the 2005 NBA MVP award?', '["Steve Nash","Shaquille O''Neal","Dirk Nowitzki","Tim Duncan"]'::jsonb),
('m002', 'medium', 1, 'Which team selected Darko Miličić No. 2 overall in 2003?', '["Miami Heat","Detroit Pistons","Denver Nuggets","Cleveland Cavaliers"]'::jsonb),
('m003', 'medium', 2, 'In which season did the NBA introduce the three-point line?', '["1994–95","1984–85","1979–80","1967–68"]'::jsonb),
('m004', 'medium', 3, 'Who was Finals MVP when Miami won in 2006?', '["Gary Payton","Shaquille O''Neal","Alonzo Mourning","Dwyane Wade"]'::jsonb),
('m005', 'medium', 0, 'Which coach led the Bulls to six championships in the 1990s?', '["Phil Jackson","Tex Winter","Doug Collins","Jerry Krause"]'::jsonb),
('m006', 'medium', 1, 'Who holds the record for most steals in a single NBA season?', '["John Stockton","Alvin Robertson","Michael Jordan","Chris Paul"]'::jsonb),
('m007', 'medium', 2, 'Which team did the Rockets sweep in the 1995 NBA Finals?', '["New York Knicks","Phoenix Suns","Orlando Magic","Utah Jazz"]'::jsonb),
('m008', 'medium', 3, 'Who was the No. 1 overall pick in the 1997 NBA Draft?', '["Keith Van Horn","Chauncey Billups","Tracy McGrady","Tim Duncan"]'::jsonb),
('m009', 'medium', 0, 'Who won Finals MVP for Dallas in 2011?', '["Dirk Nowitzki","Jason Kidd","Jason Terry","Tyson Chandler"]'::jsonb),
('m010', 'medium', 1, 'In which year did the ABA–NBA merger take effect?', '["1971","1976","1980","1967"]'::jsonb),
('m011', 'medium', 2, 'Who scored 63 points in a 1986 playoff game against Boston?', '["Dominique Wilkins","Isiah Thomas","Michael Jordan","Larry Bird"]'::jsonb),
('m012', 'medium', 3, 'Which team drafted Ray Allen in 1996 before trading him?', '["Milwaukee Bucks","Boston Celtics","Seattle SuperSonics","Minnesota Timberwolves"]'::jsonb),
('m013', 'medium', 0, 'Who won the 1994 NBA MVP award?', '["Hakeem Olajuwon","David Robinson","Charles Barkley","Patrick Ewing"]'::jsonb),
('m014', 'medium', 1, 'Which franchise drafted Kawhi Leonard before trading him to San Antonio?', '["Memphis Grizzlies","Indiana Pacers","Toronto Raptors","Los Angeles Clippers"]'::jsonb),
('m015', 'medium', 2, 'Who was the first unanimous NBA MVP?', '["Shaquille O''Neal","LeBron James","Stephen Curry","Magic Johnson"]'::jsonb),
('m016', 'medium', 3, 'Which underdog defeated the Lakers in the 2004 NBA Finals?', '["Sacramento Kings","Minnesota Timberwolves","Indiana Pacers","Detroit Pistons"]'::jsonb),
('m017', 'medium', 0, 'Who holds the official NBA record for most assists in a single game?', '["Scott Skiles","Magic Johnson","Nate Archibald","John Stockton"]'::jsonb),
('m018', 'medium', 1, 'Who was named Finals MVP in 2008 for Boston?', '["Rajon Rondo","Paul Pierce","Kevin Garnett","Ray Allen"]'::jsonb),
('m019', 'medium', 2, 'In which year did the Seattle SuperSonics win their only NBA title?', '["1980","1978","1979","1996"]'::jsonb),
('m020', 'medium', 3, 'Which head coach has the most NBA championships?', '["Pat Riley","Red Auerbach","Gregg Popovich","Phil Jackson"]'::jsonb),
('m021', 'medium', 0, 'Who won Defensive Player of the Year in 2011?', '["Dwight Howard","Kevin Garnett","Tyson Chandler","LeBron James"]'::jsonb),
('m022', 'medium', 1, 'Which team did Carmelo Anthony begin his NBA career with?', '["New York Knicks","Denver Nuggets","Portland Trail Blazers","Oklahoma City Thunder"]'::jsonb),
('m023', 'medium', 2, 'Who won Rookie of the Year for the 2003–04 season?', '["Carmelo Anthony","Dwyane Wade","LeBron James","Chris Bosh"]'::jsonb),
('m024', 'medium', 3, 'Who hit ''The Shot'' over Craig Ehlo in the 1989 playoffs?', '["Larry Bird","Clyde Drexler","Isiah Thomas","Michael Jordan"]'::jsonb),
('m025', 'medium', 0, 'How many games were played in the lockout-shortened 1998–99 season?', '["50","72","60","66"]'::jsonb),
('m026', 'medium', 1, 'Who was Finals MVP for the Lakers in 2002?', '["Kobe Bryant","Shaquille O''Neal","Robert Horry","Derek Fisher"]'::jsonb),
('m027', 'medium', 2, 'Which European-born player won the 2007 NBA MVP?', '["Tony Parker","Pau Gasol","Dirk Nowitzki","Peja Stojaković"]'::jsonb),
('m028', 'medium', 3, 'Who led the NBA in scoring average in 2005–06?', '["Allen Iverson","Carmelo Anthony","LeBron James","Kobe Bryant"]'::jsonb),
('m029', 'medium', 0, 'Which team drafted Chris Paul in 2005?', '["New Orleans Hornets","Los Angeles Clippers","Charlotte Bobcats","Houston Rockets"]'::jsonb),
('m030', 'medium', 1, 'Who hit the go-ahead shot in Game 7 of the 2010 NBA Finals?', '["Kobe Bryant","Metta World Peace (Ron Artest)","Pau Gasol","Derek Fisher"]'::jsonb),
('m031', 'medium', 2, 'Who won three consecutive Defensive Player of the Year awards from 2009 to 2011?', '["Kevin Garnett","Marcus Camby","Dwight Howard","Ben Wallace"]'::jsonb),
('m032', 'medium', 3, 'Who was the No. 1 overall pick in the 2008 NBA Draft?', '["Michael Beasley","O.J. Mayo","Russell Westbrook","Derrick Rose"]'::jsonb),
('m033', 'medium', 0, 'Which team did the Lakers defeat in the 1985 NBA Finals?', '["Boston Celtics","Houston Rockets","Philadelphia 76ers","Detroit Pistons"]'::jsonb),
('m034', 'medium', 1, 'Who holds the NBA record for most blocks in a single season?', '["Dikembe Mutombo","Mark Eaton","Manute Bol","Hakeem Olajuwon"]'::jsonb),
('m035', 'medium', 2, 'Who won the 2015 NBA MVP award?', '["James Harden","LeBron James","Stephen Curry","Russell Westbrook"]'::jsonb),
('m036', 'medium', 3, 'In which year did the ''Malice at the Palace'' occur?', '["2005","2006","2003","2004"]'::jsonb),
('m037', 'medium', 0, 'Who was Finals MVP in 1995 for Houston?', '["Hakeem Olajuwon","Clyde Drexler","Kenny Smith","Robert Horry"]'::jsonb),
('m038', 'medium', 1, 'Which team originally drafted Steve Nash in 1996?', '["Vancouver Grizzlies","Phoenix Suns","Dallas Mavericks","Toronto Raptors"]'::jsonb),
('m039', 'medium', 2, 'Who won the NBA Slam Dunk Contest in 2000?', '["Steve Francis","Jason Richardson","Vince Carter","Tracy McGrady"]'::jsonb),
('m040', 'medium', 3, 'Who was named Coach of the Year after Golden State''s 73-win season?', '["Mike Brown","Luke Walton","Mark Jackson","Steve Kerr"]'::jsonb),
('m041', 'medium', 0, 'Who was the 1993 NBA Finals MVP?', '["Michael Jordan","Horace Grant","Scottie Pippen","John Paxson"]'::jsonb),
('m042', 'medium', 1, 'Who was drafted immediately after LeBron James in 2003?', '["Dwyane Wade","Darko Miličić","Chris Bosh","Carmelo Anthony"]'::jsonb),
('m043', 'medium', 2, 'In which year did the Orlando Magic make their first NBA Finals?', '["1994","2008","1995","2009"]'::jsonb),
('m044', 'medium', 3, 'Who won Sixth Man of the Year in 2016?', '["Manu Ginóbili","Andre Iguodala","Lou Williams","Jamal Crawford"]'::jsonb),
('m045', 'medium', 0, 'Which Spurs player was Finals MVP in 2007?', '["Tony Parker","Manu Ginóbili","Tim Duncan","Bruce Bowen"]'::jsonb),
('m046', 'medium', 1, 'Who scored 61 points at Madison Square Garden in January 2014?', '["LeBron James","Carmelo Anthony","Kobe Bryant","Dwyane Wade"]'::jsonb),
('m047', 'medium', 2, 'Which team selected Yao Ming No. 1 overall in 2002?', '["New York Knicks","Chicago Bulls","Houston Rockets","Golden State Warriors"]'::jsonb),
('m048', 'medium', 3, 'Which franchise relocated from New Orleans to Utah in 1979?', '["Stars","Spirits","Hornets","Jazz"]'::jsonb),
('m049', 'medium', 0, 'Who hit a game-winning jumper over Byron Russell in the 1998 Finals?', '["Michael Jordan","Dennis Rodman","Scottie Pippen","Steve Kerr"]'::jsonb),
('m050', 'medium', 1, 'Who won Rookie of the Year in 2012?', '["Jimmy Butler","Kyrie Irving","Klay Thompson","Kawhi Leonard"]'::jsonb),
('m051', 'medium', 2, 'How many consecutive wins did the 2012–13 Heat string together?', '["19","33","27","22"]'::jsonb),
('m052', 'medium', 3, 'Which team drafted Kevin Durant No. 2 overall in 2007?', '["Boston Celtics","Memphis Grizzlies","Portland Trail Blazers","Seattle SuperSonics"]'::jsonb),
('m053', 'medium', 0, 'Who won the 2000 NBA MVP award?', '["Shaquille O''Neal","Karl Malone","Allen Iverson","Tim Duncan"]'::jsonb),
('m054', 'medium', 1, 'Who set the single-season three-pointers made record in 2015–16?', '["Klay Thompson","Stephen Curry","Dennis Scott","Ray Allen"]'::jsonb),
('m055', 'medium', 2, 'Who was Finals MVP for Detroit in 2004?', '["Richard Hamilton","Rasheed Wallace","Chauncey Billups","Ben Wallace"]'::jsonb),
('m056', 'medium', 3, 'Which college did Tim Duncan attend?', '["Duke","UCLA","North Carolina","Wake Forest"]'::jsonb),
('m057', 'medium', 0, 'Who won NBA MVP in both 1997 and 1999?', '["Karl Malone","Tim Duncan","Shaquille O''Neal","Michael Jordan"]'::jsonb),
('m058', 'medium', 1, 'Which team drafted Paul Pierce?', '["Dallas Mavericks","Boston Celtics","Los Angeles Clippers","Philadelphia 76ers"]'::jsonb),
('m059', 'medium', 2, 'Who was the first African-born player to win NBA MVP?', '["Luol Deng","Dikembe Mutombo","Hakeem Olajuwon","Serge Ibaka"]'::jsonb),
('m060', 'medium', 3, 'In which year did the Grizzlies move from Vancouver to Memphis?', '["1999","1995","2005","2001"]'::jsonb),
('m061', 'medium', 0, 'Who won the 2014 NBA MVP award?', '["Kevin Durant","Blake Griffin","Chris Paul","LeBron James"]'::jsonb),
('m062', 'medium', 1, 'Who made ''The Block'' in Game 7 of the 2016 NBA Finals?', '["Draymond Green","LeBron James","Andre Iguodala","Kyrie Irving"]'::jsonb),
('m063', 'medium', 2, 'Who hit the go-ahead three in Game 7 of the 2016 Finals?', '["J.R. Smith","LeBron James","Kyrie Irving","Kevin Love"]'::jsonb),
('m064', 'medium', 3, 'Which coach did Gregg Popovich succeed as Spurs head coach?', '["Larry Brown","John Lucas","Jerry Tarkanian","Bob Hill"]'::jsonb),
('m065', 'medium', 0, 'Who was the No. 1 overall pick in the 1992 NBA Draft?', '["Shaquille O''Neal","Jim Jackson","Alonzo Mourning","Christian Laettner"]'::jsonb),
('m066', 'medium', 1, 'Which team did the Bulls defeat in the 1991 NBA Finals?', '["Portland Trail Blazers","Los Angeles Lakers","Utah Jazz","Phoenix Suns"]'::jsonb),
('m067', 'medium', 2, 'Who won Defensive Player of the Year in 2008?', '["Tim Duncan","Kobe Bryant","Kevin Garnett","Marcus Camby"]'::jsonb),
('m068', 'medium', 3, 'Which defensive stopper was nicknamed ''The Glove''?', '["Scottie Pippen","Michael Cooper","Joe Dumars","Gary Payton"]'::jsonb),
('m069', 'medium', 0, 'Who scored 71 points in a game for San Antonio in 1994?', '["David Robinson","Shaquille O''Neal","Kobe Bryant","Hakeem Olajuwon"]'::jsonb),
('m070', 'medium', 1, 'Which ABA team joined the NBA as the Denver Nuggets?', '["San Diego Conquistadors","Denver Nuggets","Spirits of St. Louis","Kentucky Colonels"]'::jsonb),
('m071', 'medium', 2, 'Who won the 2016 NBA MVP award?', '["Russell Westbrook","LeBron James","Stephen Curry","Kawhi Leonard"]'::jsonb),
('m072', 'medium', 3, 'Which team drafted Luka Dončić before trading him to Dallas?', '["Phoenix Suns","Sacramento Kings","Dallas Mavericks","Atlanta Hawks"]'::jsonb),
('m073', 'medium', 0, 'Who was Finals MVP for Golden State in 2015?', '["Andre Iguodala","Draymond Green","Stephen Curry","Klay Thompson"]'::jsonb),
('m074', 'medium', 1, 'In which year did the Charlotte Hornets originally join the NBA?', '["1995","1988","2004","2014"]'::jsonb),
('m075', 'medium', 2, 'Who won Most Improved Player in 2017?', '["Jimmy Butler","Nikola Jokić","Giannis Antetokounmpo","CJ McCollum"]'::jsonb),
('m076', 'medium', 3, 'Which player scored 8 points in 9 seconds to beat the Knicks in 1995?', '["Rik Smits","Mark Jackson","Larry Bird","Reggie Miller"]'::jsonb),
('m077', 'medium', 0, 'Who was named Finals MVP in 1999 for San Antonio?', '["Tim Duncan","David Robinson","Avery Johnson","Sean Elliott"]'::jsonb),
('m078', 'medium', 1, 'Which team drafted Chris Webber No. 1 overall in 1993?', '["Golden State Warriors","Orlando Magic","Washington Bullets","Sacramento Kings"]'::jsonb),
('m079', 'medium', 2, 'Who won the 2017 NBA MVP award?', '["Kawhi Leonard","James Harden","Russell Westbrook","LeBron James"]'::jsonb),
('m080', 'medium', 3, 'Which team did the Spurs defeat in the 2003 NBA Finals?', '["Dallas Mavericks","Los Angeles Lakers","Detroit Pistons","New Jersey Nets"]'::jsonb),
('m081', 'medium', 0, 'Who holds the record for most career rebounds in NBA history?', '["Wilt Chamberlain","Kareem Abdul-Jabbar","Bill Russell","Karl Malone"]'::jsonb),
('m082', 'medium', 1, 'In which year did Michael Jordan first retire from the Bulls to play baseball?', '["1995","1993","1992","1994"]'::jsonb),
('m083', 'medium', 2, 'Who was the No. 1 overall pick in the 2003 NBA Draft?', '["Carmelo Anthony","Dwyane Wade","LeBron James","Darko Miličić"]'::jsonb),
('m084', 'medium', 3, 'Which coach won titles with both the Lakers and Heat?', '["Erik Spoelstra","Stan Van Gundy","Phil Jackson","Pat Riley"]'::jsonb),
('m085', 'medium', 0, 'Who won Rookie of the Year in 2009?', '["Derrick Rose","Brook Lopez","Kevin Durant","Russell Westbrook"]'::jsonb),
('m086', 'medium', 1, 'Which team did Isiah Thomas lead to back-to-back titles?', '["New York Knicks","Detroit Pistons","Indiana Pacers","Chicago Bulls"]'::jsonb),
('m087', 'medium', 2, 'Who hit a famous playoff step-back three over Tyronn Lue in 2001?', '["Vince Carter","Ray Allen","Allen Iverson","Kobe Bryant"]'::jsonb),
('m088', 'medium', 3, 'In which season did the NBA first implement a salary cap?', '["1976–77","1995–96","1999–00","1984–85"]'::jsonb),
('m089', 'medium', 0, 'Who was Finals MVP for Miami in 2012?', '["LeBron James","Mario Chalmers","Chris Bosh","Dwyane Wade"]'::jsonb),
('m090', 'medium', 1, 'Who won four consecutive scoring titles from 2005–06 through 2008–09?', '["LeBron James","Kobe Bryant","Kevin Durant","Allen Iverson"]'::jsonb),
('m091', 'medium', 2, 'Who was the lead player Boston sent to Cleveland in the 2017 Kyrie Irving trade?', '["Gordon Hayward","Al Horford","Isaiah Thomas","Marcus Smart"]'::jsonb),
('m092', 'medium', 3, 'Which team won 72 games in the 1995–96 season?', '["Los Angeles Lakers","Utah Jazz","Seattle SuperSonics","Chicago Bulls"]'::jsonb),
('m093', 'medium', 0, 'Who won Defensive Player of the Year in both 2015 and 2016?', '["Kawhi Leonard","Rudy Gobert","Draymond Green","Tony Allen"]'::jsonb),
('m094', 'medium', 1, 'Which college did Magic Johnson attend?', '["UCLA","Michigan State","Indiana","Michigan"]'::jsonb),
('m095', 'medium', 2, 'Who is widely regarded as the shortest player in NBA history?', '["Spud Webb","Mel Hirsch","Muggsy Bogues","Earl Boykins"]'::jsonb),
('m096', 'medium', 3, 'Which team drafted Tracy McGrady out of high school in 1997?', '["Houston Rockets","Detroit Pistons","Orlando Magic","Toronto Raptors"]'::jsonb),
('m097', 'medium', 0, 'Who won the 2018 NBA MVP award?', '["James Harden","Anthony Davis","LeBron James","Giannis Antetokounmpo"]'::jsonb),
('m098', 'medium', 1, 'Before his Game 6 winner in the 1998 Finals, Michael Jordan stripped which Jazz player?', '["Bryon Russell","Karl Malone","Jeff Hornacek","John Stockton"]'::jsonb),
('m099', 'medium', 2, 'Which expansion franchise began play in 1995 alongside Vancouver?', '["Miami Heat","Orlando Magic","Toronto Raptors","Charlotte Hornets"]'::jsonb),
('m100', 'medium', 3, 'Who was named Finals MVP in both 2009 and 2010?', '["Derek Fisher","Lamar Odom","Pau Gasol","Kobe Bryant"]'::jsonb),
('h001', 'hard', 0, 'Who was the last player to average a triple-double for a season before Russell Westbrook (2016–17)?', '["Oscar Robertson","Magic Johnson","Jason Kidd","Fat Lever"]'::jsonb),
('h002', 'hard', 1, 'Which team selected Len Bias with the No. 2 pick in 1986?', '["Philadelphia 76ers","Boston Celtics","Maryland Terrapins","Portland Trail Blazers"]'::jsonb),
('h003', 'hard', 2, 'Who holds the NBA record for most free throws made in a single game (28)?', '["Karl Malone","Michael Jordan","Wilt Chamberlain","Adrian Dantley"]'::jsonb),
('h004', 'hard', 3, 'Who scored 42 points at center in Game 6 of the 1980 NBA Finals filling in for Kareem?', '["Michael Cooper","Jamaal Wilkes","Norm Nixon","Magic Johnson"]'::jsonb),
('h005', 'hard', 0, 'In which season did Wilt Chamberlain average 50.4 points per game?', '["1961–62","1962–63","1959–60","1960–61"]'::jsonb),
('h006', 'hard', 1, 'Who was the first Asian-born player selected No. 1 overall in the NBA Draft?', '["Yi Jianlian","Yao Ming","Wang Zhizhi","Ha Seung-jin"]'::jsonb),
('h007', 'hard', 2, 'Which coach popularized the Triangle Offense used by Phil Jackson''s championship teams?', '["Johnny Bach","Chick Hearn","Tex Winter","Bill Sharman"]'::jsonb),
('h008', 'hard', 3, 'Who won Finals MVP in 1969 even though his Lakers lost the series?', '["Elgin Baylor","Bill Russell","Wilt Chamberlain","Jerry West"]'::jsonb),
('h009', 'hard', 0, 'Who holds the NBA record for most career personal fouls?', '["Kareem Abdul-Jabbar","Karl Malone","Robert Parish","Charles Oakley"]'::jsonb),
('h010', 'hard', 1, 'Which player won Rookie of the Year and MVP in the same season (1968–69)?', '["Wilt Chamberlain","Wes Unseld","Dave Cowens","Oscar Robertson"]'::jsonb),
('h011', 'hard', 2, 'Who was Finals MVP for the 1978 Washington Bullets?', '["Elvin Hayes","Bob Dandridge","Wes Unseld","Kevin Grevey"]'::jsonb),
('h012', 'hard', 3, 'Who was the first player to win MVP and Defensive Player of the Year in the same season?', '["David Robinson","Kawhi Leonard","Hakeem Olajuwon","Michael Jordan"]'::jsonb),
('h013', 'hard', 0, 'Who was the No. 1 overall pick in the 1986 NBA Draft?', '["Brad Daugherty","Chuck Person","Len Bias","Chris Washburn"]'::jsonb),
('h014', 'hard', 1, 'Which team drafted Manute Bol in 1985?', '["Milwaukee Bucks","Washington Bullets","Golden State Warriors","Philadelphia 76ers"]'::jsonb),
('h015', 'hard', 2, 'Who holds the NBA record for most assists in a single NBA Finals series?', '["Walt Frazier","John Stockton","Magic Johnson","Isiah Thomas"]'::jsonb),
('h016', 'hard', 3, 'Who scored 71 points for the Lakers in a November 1960 game?', '["Jerry West","Wilt Chamberlain","Hot Rod Hundley","Elgin Baylor"]'::jsonb),
('h017', 'hard', 0, 'Which coach won Coach of the Year with the Bulls'' 72-win 1995–96 team?', '["Phil Jackson","Rudy Tomjanovich","Doug Collins","Larry Brown"]'::jsonb),
('h018', 'hard', 1, 'In which seasons was the NBA three-point line temporarily shortened?', '["2001–02 through 2003–04","1994–95 through 1996–97","1990–91 only","1984–85 through 1986–87"]'::jsonb),
('h019', 'hard', 2, 'Who hit a tip-in at the buzzer to win Game 5 of the 1986 Western Conference Finals for Houston?', '["Sleepy Floyd","Hakeem Olajuwon","Ralph Sampson","Rodney McCray"]'::jsonb),
('h020', 'hard', 3, 'Who holds the record for most points scored in an NBA All-Star Game (52)?', '["Wilt Chamberlain","Michael Jordan","Blake Griffin","Anthony Davis"]'::jsonb),
('h021', 'hard', 0, 'Which player won the 1985 Slam Dunk Contest as a rookie?', '["Michael Jordan","Clyde Drexler","Spud Webb","Dominique Wilkins"]'::jsonb),
('h022', 'hard', 1, 'Who was traded for Scottie Pippen on draft night in 1987?', '["Kenny Smith","Olden Polynice","Horace Grant","Reggie Williams"]'::jsonb),
('h023', 'hard', 2, 'Which ABA team did Julius Erving win two championships with?', '["Kentucky Colonels","Virginia Squires","New York Nets","Indiana Pacers"]'::jsonb),
('h024', 'hard', 3, 'Who holds the single-season rebounding average record (27.2 RPG)?', '["Bob Pettit","Bill Russell","Nate Thurmond","Wilt Chamberlain"]'::jsonb),
('h025', 'hard', 0, 'Who is the shortest player to win the NBA Slam Dunk Contest?', '["Spud Webb","Muggsy Bogues","Nate Robinson","Earl Boykins"]'::jsonb),
('h026', 'hard', 1, 'Who was the first European player selected No. 1 overall in the NBA Draft?', '["Dirk Nowitzki","Andrea Bargnani","Darko Miličić","Pau Gasol"]'::jsonb),
('h027', 'hard', 2, 'In Game 5 of the 1976 Finals, whose shot forced a third overtime?', '["Jo Jo White","Paul Westphal","Gar Heard","Dave Cowens"]'::jsonb),
('h028', 'hard', 3, 'Who was the first player credited with 11 steals in an NBA game?', '["John Stockton","Alvin Robertson","Gary Payton","Larry Kenon"]'::jsonb),
('h029', 'hard', 0, 'Which player was nicknamed ''The Big O''?', '["Oscar Robertson","Olden Polynice","Oliver Miller","Otis Thorpe"]'::jsonb),
('h030', 'hard', 1, 'Who was named MVP of the 1992 Olympic men''s basketball tournament?', '["Magic Johnson","Charles Barkley","Larry Bird","Michael Jordan"]'::jsonb),
('h031', 'hard', 2, 'Who scored 100 points for Philadelphia against New York in Hershey, PA?', '["Paul Arizin","Tom Gola","Wilt Chamberlain","Guy Rodgers"]'::jsonb),
('h032', 'hard', 3, 'Which team did Bill Walton lead to the 1977 NBA championship?', '["Boston Celtics","San Diego Clippers","Los Angeles Clippers","Portland Trail Blazers"]'::jsonb),
('h033', 'hard', 0, 'Who was the No. 1 overall pick in the 1970 NBA Draft?', '["Bob Lanier","Rudy Tomjanovich","Pete Maravich","Dave Cowens"]'::jsonb),
('h034', 'hard', 1, 'Which Knicks legend famously walked onto the court injured to start Game 7 of the 1970 Finals?', '["Bill Bradley","Willis Reed","Dave DeBusschere","Walt Frazier"]'::jsonb),
('h035', 'hard', 2, 'Who holds the record for most NBA championships as a head coach?', '["Pat Riley","Red Auerbach","Phil Jackson","John Kundla"]'::jsonb),
('h036', 'hard', 3, 'In which season did Michael Jordan win his first MVP award?', '["1990–91","1986–87","1988–89","1987–88"]'::jsonb),
('h037', 'hard', 0, 'Who was the first high-school player taken No. 1 overall in the NBA Draft?', '["Kwame Brown","Kevin Garnett","LeBron James","Tracy McGrady"]'::jsonb),
('h038', 'hard', 1, 'Which team selected Kevin Garnett No. 5 overall in 1995?', '["Philadelphia 76ers","Minnesota Timberwolves","Milwaukee Bucks","Chicago Bulls"]'::jsonb),
('h039', 'hard', 2, 'Who hit a half-court buzzer-beater for Houston in Game 1 of the 1995 Western Conference semifinals?', '["Hakeem Olajuwon","Clyde Drexler","Kenny Smith","Sam Cassell"]'::jsonb),
('h040', 'hard', 3, 'Who was Finals MVP for the 1983 Philadelphia 76ers?', '["Julius Erving","Andrew Toney","Maurice Cheeks","Moses Malone"]'::jsonb),
('h041', 'hard', 0, 'Which player predicted a 76ers sweep in 1983 with the line ''Fo'', ''Fo'', ''Fo''?', '["Moses Malone","Billy Cunningham","Harold Katz","Julius Erving"]'::jsonb),
('h042', 'hard', 1, 'Who holds the NBA Finals single-game scoring record (61 points)?', '["Rick Barry","Elgin Baylor","Jerry West","Michael Jordan"]'::jsonb),
('h043', 'hard', 2, 'In which year did the NBA introduce the 24-second shot clock?', '["1948","1951","1954","1960"]'::jsonb),
('h044', 'hard', 3, 'Who was the first Black head coach to win an NBA championship?', '["K.C. Jones","Lenny Wilkens","Al Attles","Bill Russell"]'::jsonb),
('h045', 'hard', 0, 'Which player won eight consecutive scoring titles (1959–60 through 1966–67)?', '["Wilt Chamberlain","Rick Barry","Bob Pettit","Elgin Baylor"]'::jsonb),
('h046', 'hard', 1, 'Which coach led Houston to back-to-back titles in 1994 and 1995?', '["Don Chaney","Rudy Tomjanovich","Jeff Van Gundy","Bill Fitch"]'::jsonb),
('h047', 'hard', 2, 'Who held the single-season triple-double record (41) before Westbrook broke it?', '["Jason Kidd","Fat Lever","Oscar Robertson","Magic Johnson"]'::jsonb),
('h048', 'hard', 3, 'Who scored 55 points in a 1967 NBA Finals game for San Francisco?', '["Jeff Mullins","Nate Thurmond","Wilt Chamberlain","Rick Barry"]'::jsonb),
('h049', 'hard', 0, 'Who was the first Canadian selected No. 1 overall in the NBA Draft?', '["Anthony Bennett","Andrew Wiggins","Steve Nash","Tristan Thompson"]'::jsonb),
('h050', 'hard', 1, 'In 1997, which Spur hit the ''Memorial Day Miracle'' three against Phoenix?', '["Vinny Del Negro","Sean Elliott","Avery Johnson","David Robinson"]'::jsonb),
('h051', 'hard', 2, 'Who won the inaugural NBA Defensive Player of the Year award (1982–83)?', '["Maurice Cheeks","Bobby Jones","Sidney Moncrief","Michael Cooper"]'::jsonb),
('h052', 'hard', 3, 'Who scored 60 points for the Knicks against the Nets on Christmas Day 1984?', '["Carl Braun","Patrick Ewing","Richie Guerin","Bernard King"]'::jsonb),
('h053', 'hard', 0, 'Which player recorded a quadruple-double for Milwaukee in 1986?', '["Alvin Robertson","Hakeem Olajuwon","David Robinson","Nate Thurmond"]'::jsonb),
('h054', 'hard', 1, 'Who was the first player to record a documented NBA quadruple-double?', '["Alvin Robertson","Nate Thurmond","David Robinson","Hakeem Olajuwon"]'::jsonb),
('h055', 'hard', 2, 'Which team selected Chris Webber No. 1 overall before trading him on draft night?', '["Sacramento Kings","Golden State Warriors","Orlando Magic","Washington Bullets"]'::jsonb),
('h056', 'hard', 3, 'Who won MVP while playing for the Buffalo Braves?', '["Artis Gilmore","Julius Erving","Dave Cowens","Bob McAdoo"]'::jsonb),
('h057', 'hard', 0, 'Who was nicknamed ''The Iceman''?', '["George Gervin","Earl Monroe","Clyde Drexler","James Worthy"]'::jsonb),
('h058', 'hard', 1, 'In which arena did Wilt Chamberlain score 100 points?', '["Convention Hall","Hershey Sports Arena","Boston Garden","Madison Square Garden"]'::jsonb),
('h059', 'hard', 2, 'Who won Finals MVP for the 1975 Golden State Warriors?', '["Clifford Ray","Butch Beard","Rick Barry","Jamaal Wilkes"]'::jsonb),
('h060', 'hard', 3, 'In which year did the Miami Heat and Charlotte Hornets begin NBA play?', '["1986","1995","1989","1988"]'::jsonb),
('h061', 'hard', 1, 'Who holds the career record for most NBA All-Star Game selections?', '["Kareem Abdul-Jabbar","LeBron James","Tim Duncan","Kobe Bryant"]'::jsonb),
('h062', 'hard', 1, 'Which player was known as ''Pistol Pete''?', '["Peter Vecsey","Pete Maravich","Pete Newell","Pete Myers"]'::jsonb),
('h063', 'hard', 2, 'Who hit the series-winning three for Utah in Game 6 of the 1997 Western Conference Finals?', '["Karl Malone","Bryon Russell","John Stockton","Jeff Hornacek"]'::jsonb),
('h064', 'hard', 3, 'Who was the No. 1 overall pick in the 1969 NBA Draft?', '["Wes Unseld","Bob Lanier","Elvin Hayes","Kareem Abdul-Jabbar (Lew Alcindor)"]'::jsonb),
('h065', 'hard', 0, 'Which team did the Celtics defeat for Bill Russell''s final championship in 1969?', '["Los Angeles Lakers","Philadelphia 76ers","New York Knicks","San Francisco Warriors"]'::jsonb),
('h066', 'hard', 1, 'Who scored 25 points in a single quarter of Game 6 of the 1988 NBA Finals on a sprained ankle?', '["Vinnie Johnson","Isiah Thomas","Joe Dumars","Bill Laimbeer"]'::jsonb),
('h067', 'hard', 2, 'Who hit ''The Shot'' that clinched Detroit''s 1990 Finals win over Portland?', '["Isiah Thomas","Joe Dumars","Vinnie Johnson","Dennis Rodman"]'::jsonb),
('h068', 'hard', 3, 'Which player won MVP in 1981 while with the Celtics?', '["Kareem Abdul-Jabbar","Moses Malone","Julius Erving","Larry Bird"]'::jsonb),
('h069', 'hard', 0, 'Who was the first foreign-born No. 1 overall pick in the common draft era (Bahamas, 1978)?', '["Mychal Thompson","Hakeem Olajuwon","Andrea Bargnani","Yao Ming"]'::jsonb),
('h070', 'hard', 1, 'Which team drafted Toni Kukoč in 1990 before he later joined the Bulls?', '["San Antonio Spurs","Chicago Bulls","New Jersey Nets","Boston Celtics"]'::jsonb),
('h071', 'hard', 2, 'Who scored 63 points in a 1962 NBA Finals game for the Lakers?', '["Hot Rod Hundley","Jerry West","Elgin Baylor","Wilt Chamberlain"]'::jsonb),
('h072', 'hard', 3, 'Who was Coach of the Year in 2007–08 with New Orleans?', '["Doc Rivers","Mike D''Antoni","Jerry Sloan","Byron Scott"]'::jsonb),
('h073', 'hard', 0, 'Which player won three consecutive MVPs from 1984 through 1986?', '["Larry Bird","Julius Erving","Moses Malone","Magic Johnson"]'::jsonb),
('h074', 'hard', 1, 'Who was named Finals MVP for the 1975 Warriors after starring in the ABA?', '["Julius Erving","Rick Barry","George McGinnis","Spencer Haywood"]'::jsonb),
('h075', 'hard', 2, 'Who was the first unanimous NBA MVP in history?', '["LeBron James","Magic Johnson","Stephen Curry","Shaquille O''Neal"]'::jsonb),
('h076', 'hard', 3, 'Who led the NBA in scoring in 1973–74 for Buffalo?', '["Kareem Abdul-Jabbar","Tiny Archibald","Rick Barry","Bob McAdoo"]'::jsonb),
('h077', 'hard', 0, 'Who holds the single-season record for most turnovers?', '["James Harden","Allen Iverson","Steve Francis","Russell Westbrook"]'::jsonb),
('h078', 'hard', 1, 'Who was named Finals MVP in 1988 for the Lakers?', '["Magic Johnson","James Worthy","Kareem Abdul-Jabbar","Byron Scott"]'::jsonb),
('h079', 'hard', 2, 'Which team selected Markelle Fultz No. 1 overall in 2017?', '["Boston Celtics","Phoenix Suns","Philadelphia 76ers","Los Angeles Lakers"]'::jsonb),
('h080', 'hard', 3, 'Who won Defensive Player of the Year in 1992?', '["Patrick Ewing","Hakeem Olajuwon","Dennis Rodman","David Robinson"]'::jsonb),
('h081', 'hard', 0, 'In which year did the BAA and NBL merge to form the NBA?', '["1949","1947","1950","1946"]'::jsonb),
('h082', 'hard', 1, 'Which coach won an NBA title as a Rockets player and later as Rockets head coach?', '["Kenny Smith","Rudy Tomjanovich","Clyde Drexler","Robert Reid"]'::jsonb),
('h083', 'hard', 2, 'Who was the No. 1 overall pick in the 1968 NBA Draft?', '["Wes Unseld","Kareem Abdul-Jabbar","Elvin Hayes","Bob Lanier"]'::jsonb),
('h084', 'hard', 3, 'Which player recorded 30 assists in a 1990 game for Orlando?', '["Magic Johnson","John Stockton","Mark Jackson","Scott Skiles"]'::jsonb),
('h085', 'hard', 0, 'Who won MVP for the Lakers'' record 33-game win streak season (1971–72)?', '["Jerry West","Gail Goodrich","Wilt Chamberlain","Happy Hairston"]'::jsonb),
('h086', 'hard', 1, 'Who was nicknamed ''Mr. Clutch''?', '["Sam Jones","Jerry West","John Havlicek","Reggie Miller"]'::jsonb),
('h087', 'hard', 2, 'Which expansion franchise selected Rex Chapman with its first pick in 1988?', '["Miami Heat","Orlando Magic","Charlotte Hornets","Minnesota Timberwolves"]'::jsonb),
('h088', 'hard', 3, 'Who holds the official NBA single-game blocks record (17)?', '["Mark Eaton","Dikembe Mutombo","Manute Bol","Elmore Smith"]'::jsonb),
('h089', 'hard', 0, 'Who won Rookie of the Year in 1981–82 with the New Jersey Nets?', '["Buck Williams","Jay Vincent","Isiah Thomas","Kelly Tripucka"]'::jsonb),
('h090', 'hard', 1, 'Which team drafted Pau Gasol No. 3 overall in 2001 before trading him?', '["Los Angeles Lakers","Atlanta Hawks","Memphis Grizzlies","Orlando Magic"]'::jsonb),
('h091', 'hard', 2, 'Who was the first player to win MVP while with the Milwaukee Bucks?', '["Oscar Robertson","Giannis Antetokounmpo","Kareem Abdul-Jabbar","Sidney Moncrief"]'::jsonb),
('h092', 'hard', 3, 'Who holds the record for most points in a single NBA playoff game (63)?', '["Jerry West","Wilt Chamberlain","Elgin Baylor","Michael Jordan"]'::jsonb),
('h093', 'hard', 0, 'Who scored 37 points in a single quarter for Golden State in 2015?', '["Klay Thompson","Monta Ellis","Stephen Curry","Kevin Durant"]'::jsonb),
('h094', 'hard', 1, 'Which player won MVP in 1975 with the Buffalo Braves?', '["Dave Cowens","Bob McAdoo","Kareem Abdul-Jabbar","Julius Erving"]'::jsonb),
('h095', 'hard', 2, 'Who was Minnesota''s first-ever NBA Draft selection (No. 10 in 1989)?', '["Danny Ferry","Jerome Lane","Pooh Richardson","Randy Breuer"]'::jsonb),
('h096', 'hard', 3, 'In which season did Nate Thurmond record the first official quadruple-double?', '["1978–79","1973–74","1976–77","1974–75"]'::jsonb),
('h097', 'hard', 0, 'Who hit the series-clinching three for Utah over Houston in Game 6 of the 1997 Western Conference Finals?', '["John Stockton","Karl Malone","Bryon Russell","Jeff Hornacek"]'::jsonb),
('h098', 'hard', 1, 'Who was nicknamed ''The Logo'' and inspired the NBA silhouetted mark?', '["Elgin Baylor","Jerry West","Oscar Robertson","Bob Cousy"]'::jsonb),
('h099', 'hard', 2, 'Which team won the inaugural BAA/NBA championship in 1947?', '["New York Knicks","Washington Capitols","Philadelphia Warriors","Chicago Stags"]'::jsonb),
('h100', 'hard', 3, 'Who averaged an NBA-record 48.5 minutes per game for a season?', '["Oscar Robertson","Nate Thurmond","Bill Russell","Wilt Chamberlain"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  difficulty = EXCLUDED.difficulty,
  correct_index = EXCLUDED.correct_index,
  prompt = EXCLUDED.prompt,
  choices = EXCLUDED.choices;

CREATE OR REPLACE FUNCTION public._trivia_shuffle_choices(p_choices jsonb, p_correct smallint)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SET search_path = public
AS $$
DECLARE
  v_items text[];
  v_order int[] := ARRAY[0,1,2,3];
  v_i int;
  v_j int;
  v_tmp int;
  v_out jsonb := '[]'::jsonb;
  v_new_correct smallint;
BEGIN
  IF jsonb_typeof(p_choices) IS DISTINCT FROM 'array' OR jsonb_array_length(p_choices) <> 4 THEN
    RAISE EXCEPTION 'invalid_choices' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(value #>> '{}') INTO v_items
  FROM jsonb_array_elements(p_choices);
  -- Fisher–Yates using random().
  FOR v_i IN REVERSE 3..1 LOOP
    v_j := floor(random() * (v_i + 1))::int;
    v_tmp := v_order[v_i + 1];
    v_order[v_i + 1] := v_order[v_j + 1];
    v_order[v_j + 1] := v_tmp;
  END LOOP;
  v_new_correct := NULL;
  FOR v_i IN 0..3 LOOP
    v_out := v_out || jsonb_build_array(v_items[v_order[v_i + 1] + 1]);
    IF v_order[v_i + 1] = p_correct THEN
      v_new_correct := v_i;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('choices', v_out, 'correct_index', v_new_correct);
END;
$$;
REVOKE ALL ON FUNCTION public._trivia_shuffle_choices(jsonb, smallint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trivia_issue(p_session_id uuid, p_difficulty text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  v_diff text := lower(trim(coalesce(p_difficulty, '')));
  s public.classic_run_sessions%ROWTYPE;
  q public.trivia_questions%ROWTYPE;
  v_id uuid;
  v_shuffled jsonb;
BEGIN
  PERFORM public._user_xact_lock(v_uid);
  IF v_diff NOT IN ('easy','medium','hard') THEN RAISE EXCEPTION 'invalid_difficulty' USING ERRCODE = '22023'; END IF;

  SELECT * INTO s FROM public.classic_run_sessions
  WHERE id = p_session_id AND user_id = v_uid FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'run_session_required' USING ERRCODE = 'P0001'; END IF;
  IF s.leaderboard_run_id IS NULL OR coalesce(s.verified_value, 0) < 1000000000 THEN
    RAISE EXCEPTION 'run_not_eligible' USING ERRCODE = 'P0001';
  END IF;

  -- Already attempted this difficulty on this run?
  IF EXISTS (
    SELECT 1 FROM public.trivia_challenges
    WHERE user_id = v_uid AND session_id = s.id AND difficulty = v_diff
  ) THEN
    RAISE EXCEPTION 'trivia_attempt_used' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bank_ledger
    WHERE user_id = v_uid AND kind = 'trivia_bonus'
      AND source_ref = 'trivia:' || s.id::text || ':' || v_diff
  ) THEN
    RAISE EXCEPTION 'already_paid' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO q FROM public.trivia_questions
  WHERE difficulty = v_diff
  ORDER BY random() LIMIT 1;
  IF q.id IS NULL THEN RAISE EXCEPTION 'no_questions' USING ERRCODE = 'P0001'; END IF;

  v_shuffled := public._trivia_shuffle_choices(q.choices, q.correct_index);

  INSERT INTO public.trivia_challenges (
    user_id, question_id, difficulty, session_id, client_run_id, correct_index, expires_at, status
  ) VALUES (
    v_uid, q.id, v_diff, s.id, s.id::text,
    (v_shuffled ->> 'correct_index')::smallint,
    now() + interval '90 seconds',
    'open'
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'challenge_id', v_id,
    'question_id', q.id,
    'difficulty', v_diff,
    'prompt', q.prompt,
    'choices', v_shuffled -> 'choices',
    'expires_at', now() + interval '90 seconds',
    'session_id', s.id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.trivia_issue(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trivia_issue(uuid, text) TO authenticated;

-- Compatibility: text run id must be session UUID.
CREATE OR REPLACE FUNCTION public.trivia_issue(p_client_run_id text, p_difficulty text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE v_ref text := trim(coalesce(p_client_run_id, ''));
BEGIN
  IF v_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'run_session_required' USING ERRCODE = 'P0001';
  END IF;
  RETURN public.trivia_issue(v_ref::uuid, p_difficulty);
END;
$$;
REVOKE ALL ON FUNCTION public.trivia_issue(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trivia_issue(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.trivia_answer(p_challenge_id uuid, p_choice_index integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  c public.trivia_challenges%ROWTYPE;
  v_amount bigint;
  v_correct boolean;
  v_ref text;
  v_today integer;
  v_balance bigint;
BEGIN
  PERFORM public._user_xact_lock(v_uid);
  SELECT * INTO c FROM public.trivia_challenges
  WHERE id = p_challenge_id AND user_id = v_uid FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'challenge_not_found' USING ERRCODE = 'P0001'; END IF;

  IF c.status IS DISTINCT FROM 'open' OR c.answered_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_answered', 'correct', c.correct, 'paid', 0);
  END IF;

  IF c.expires_at < now() THEN
    UPDATE public.trivia_challenges
    SET answered_at = now(), choice_index = p_choice_index, correct = false, status = 'expired'
    WHERE id = c.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired', 'correct', false, 'paid', 0);
  END IF;

  IF p_choice_index IS NULL OR p_choice_index < 0 OR p_choice_index > 3 THEN
    RAISE EXCEPTION 'invalid_choice' USING ERRCODE = '22023';
  END IF;

  v_correct := (p_choice_index = c.correct_index);
  UPDATE public.trivia_challenges
  SET answered_at = now(),
      choice_index = p_choice_index,
      correct = v_correct,
      status = CASE WHEN v_correct THEN 'correct' ELSE 'incorrect' END
  WHERE id = c.id;

  IF NOT v_correct THEN
    RETURN jsonb_build_object('ok', true, 'correct', false, 'paid', 0);
  END IF;

  v_amount := CASE c.difficulty
    WHEN 'easy' THEN 10000000 WHEN 'medium' THEN 25000000 WHEN 'hard' THEN 45000000 ELSE NULL END;

  SELECT count(*)::integer INTO v_today FROM public.bank_ledger
  WHERE user_id = v_uid AND kind = 'trivia_bonus'
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc');
  IF v_today >= 12 THEN
    RAISE EXCEPTION 'trivia_daily_cap' USING ERRCODE = 'P0001';
  END IF;

  v_ref := 'trivia:' || c.session_id::text || ':' || c.difficulty;
  PERFORM public.bank_post(
    v_uid, v_amount, 'trivia_bonus', v_ref,
    jsonb_build_object('difficulty', c.difficulty, 'challenge_id', c.id, 'question_id', c.question_id, 'session_id', c.session_id)
  );

  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.bank_accounts a WHERE a.user_id = v_uid;
  RETURN jsonb_build_object('ok', true, 'correct', true, 'paid', v_amount, 'bank_balance', coalesce(v_balance, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.trivia_answer(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trivia_answer(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_my_trivia_bonus(p_source_ref text, p_difficulty text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  PERFORM public._require_permanent_uid();
  RAISE EXCEPTION 'use_trivia_answer' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.post_my_trivia_bonus(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_my_trivia_bonus(text, text) TO authenticated;

-- ── IAP grant / revoke (service_role only) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.coin_grant_iap(
  p_user uuid,
  p_transaction_id text,
  p_product_id text,
  p_original_transaction_id text DEFAULT NULL,
  p_environment text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_tx text := trim(coalesce(p_transaction_id, ''));
  v_product text := trim(coalesce(p_product_id, ''));
  v_cat public.iap_product_catalog%ROWTYPE;
  v_balance bigint;
  v_ok boolean;
  v_existing public.iap_transactions%ROWTYPE;
BEGIN
  PERFORM public._require_service_role();
  IF p_user IS NULL OR length(v_tx) < 4 OR length(v_product) < 1 THEN
    RAISE EXCEPTION 'invalid_iap' USING ERRCODE = '22023';
  END IF;

  PERFORM public._user_xact_lock(p_user);

  SELECT * INTO v_existing FROM public.iap_transactions WHERE transaction_id = v_tx FOR UPDATE;
  IF v_existing.transaction_id IS NOT NULL THEN
    IF v_existing.user_id IS DISTINCT FROM p_user THEN
      RAISE EXCEPTION 'iap_account_mismatch' USING ERRCODE = '42501';
    END IF;
    SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = p_user;
    RETURN jsonb_build_object(
      'ok', true,
      'granted', 0,
      'duplicate', true,
      'coins_balance', coalesce(v_balance, 0),
      'product_id', v_existing.product_id,
      'status', v_existing.status
    );
  END IF;

  SELECT * INTO v_cat FROM public.iap_product_catalog WHERE product_id = v_product AND active;
  IF v_cat.product_id IS NULL THEN
    RAISE EXCEPTION 'unknown_product' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.iap_transactions (
    transaction_id, user_id, product_id, original_transaction_id, environment, status, granted_coins
  ) VALUES (
    v_tx, p_user, v_product, nullif(trim(coalesce(p_original_transaction_id,'')), ''),
    nullif(trim(coalesce(p_environment,'')), ''), 'granted', v_cat.coins
  );

  IF v_cat.coins > 0 THEN
    v_ok := public.coin_post(
      p_user, v_cat.coins, 'iap_grant', 'iap_tx:' || v_tx,
      jsonb_build_object('product_id', v_product, 'kind', v_cat.kind)
    );
  ELSE
    v_ok := true;
  END IF;

  INSERT INTO public.user_entitlements (user_id) VALUES (p_user) ON CONFLICT DO NOTHING;
  UPDATE public.user_entitlements SET
    remove_ads = remove_ads OR (v_cat.kind IN ('remove_ads','premium','pro_monthly','pro_yearly')),
    premium = premium OR (v_cat.kind = 'premium'),
    pro_active_until = CASE
      WHEN v_cat.kind IN ('pro_monthly','pro_yearly') THEN
        GREATEST(coalesce(pro_active_until, now()), coalesce(p_expires_at, now() + CASE WHEN v_cat.kind = 'pro_yearly' THEN interval '366 days' ELSE interval '32 days' END))
      ELSE pro_active_until
    END,
    updated_at = now()
  WHERE user_id = p_user;

  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = p_user;
  RETURN jsonb_build_object(
    'ok', true,
    'granted', CASE WHEN v_ok AND v_cat.coins > 0 THEN v_cat.coins ELSE 0 END,
    'duplicate', NOT v_ok,
    'coins_balance', coalesce(v_balance, 0),
    'product_id', v_product,
    'kind', v_cat.kind,
    'billing', v_cat.billing,
    'remove_ads', v_cat.kind IN ('remove_ads','premium','pro_monthly','pro_yearly'),
    'premium', v_cat.kind = 'premium',
    'pro_active_until', CASE
      WHEN v_cat.kind IN ('pro_monthly','pro_yearly') THEN coalesce(p_expires_at, now() + CASE WHEN v_cat.kind = 'pro_yearly' THEN interval '366 days' ELSE interval '32 days' END)
      ELSE NULL
    END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.coin_grant_iap(uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- 3-arg compatibility for older edge builds.
CREATE OR REPLACE FUNCTION public.coin_grant_iap(p_user uuid, p_transaction_id text, p_product_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RETURN public.coin_grant_iap(p_user, p_transaction_id, p_product_id, NULL, NULL, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.coin_grant_iap(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.iap_revoke_transaction(p_transaction_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_tx text := trim(coalesce(p_transaction_id, ''));
  t public.iap_transactions%ROWTYPE;
  v_cat public.iap_product_catalog%ROWTYPE;
BEGIN
  PERFORM public._require_service_role();
  SELECT * INTO t FROM public.iap_transactions WHERE transaction_id = v_tx FOR UPDATE;
  IF t.transaction_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'ignored', true);
  END IF;
  IF t.status IN ('refunded', 'revoked') THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'status', t.status);
  END IF;

  UPDATE public.iap_transactions
  SET status = 'revoked', updated_at = now()
  WHERE transaction_id = v_tx;

  SELECT * INTO v_cat FROM public.iap_product_catalog WHERE product_id = t.product_id;
  IF coalesce(t.granted_coins, 0) > 0 THEN
    -- Compensating debit keyed by tx (idempotent).
    BEGIN
      PERFORM public.coin_post(
        t.user_id, -t.granted_coins, 'iap_refund', 'iap_refund:' || v_tx,
        jsonb_build_object('transaction_id', v_tx, 'product_id', t.product_id)
      );
    EXCEPTION WHEN others THEN
      -- If balance too low, leave a zero-balance floor; entitlement still revoked.
      NULL;
    END;
  END IF;

  IF v_cat.kind IN ('remove_ads','premium') THEN
    UPDATE public.user_entitlements SET
      remove_ads = CASE WHEN v_cat.kind = 'remove_ads' THEN false ELSE remove_ads END,
      premium = CASE WHEN v_cat.kind = 'premium' THEN false ELSE premium END,
      updated_at = now()
    WHERE user_id = t.user_id;
  ELSIF v_cat.kind IN ('pro_monthly','pro_yearly') THEN
    UPDATE public.user_entitlements SET
      pro_active_until = least(pro_active_until, now()),
      updated_at = now()
    WHERE user_id = t.user_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'revoked', v_tx);
END;
$$;
REVOKE ALL ON FUNCTION public.iap_revoke_transaction(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  e public.user_entitlements%ROWTYPE;
BEGIN
  INSERT INTO public.user_entitlements (user_id) VALUES (v_uid) ON CONFLICT DO NOTHING;
  SELECT * INTO e FROM public.user_entitlements WHERE user_id = v_uid;
  RETURN jsonb_build_object(
    'remove_ads', coalesce(e.remove_ads, false),
    'premium', coalesce(e.premium, false),
    'pro_active_until', e.pro_active_until,
    'pro_active', coalesce(e.pro_active_until, now()) > now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated;


-- =============================================================================
-- V3 FIXES (independent review defects 1–13) — same transaction, replaces above.
-- =============================================================================

-- Action ledger for retry-safe boost/perk/spin ids
CREATE TABLE IF NOT EXISTS public.classic_run_actions (
  session_id uuid NOT NULL REFERENCES public.classic_run_sessions (id) ON DELETE CASCADE,
  action_id text NOT NULL CHECK (length(action_id) BETWEEN 8 AND 80),
  kind text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, action_id)
);
ALTER TABLE public.classic_run_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.classic_run_actions FROM PUBLIC, anon, authenticated;

ALTER TABLE public.iap_transactions ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE TABLE IF NOT EXISTS public.iap_refund_debts (
  transaction_id text PRIMARY KEY REFERENCES public.iap_transactions (transaction_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount_remaining bigint NOT NULL CHECK (amount_remaining > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.iap_refund_debts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.iap_refund_debts FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS iap_refund_debts_select_own ON public.iap_refund_debts;
CREATE POLICY iap_refund_debts_select_own ON public.iap_refund_debts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);
GRANT SELECT ON TABLE public.iap_refund_debts TO authenticated;

-- Hide session pick valuations from direct table reads (values only via RPCs when xray).
REVOKE ALL ON TABLE public.classic_run_sessions FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS classic_run_sessions_select_own ON public.classic_run_sessions;
-- No SELECT policy for authenticated — clients use RPCs that strip values.

CREATE OR REPLACE FUNCTION public._classic_session_get(p_session uuid, p_allow_completed boolean DEFAULT false)
RETURNS public.classic_run_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  s public.classic_run_sessions%ROWTYPE;
BEGIN
  PERFORM public._user_xact_lock(v_uid);
  SELECT * INTO s FROM public.classic_run_sessions
  WHERE id = p_session AND user_id = v_uid
  FOR UPDATE;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'run_session_required' USING ERRCODE = 'P0001';
  END IF;
  IF s.status = 'open' AND s.expires_at < now() THEN
    UPDATE public.classic_run_sessions
    SET status = 'expired', completed_at = coalesce(completed_at, now())
    WHERE id = s.id RETURNING * INTO s;
  END IF;
  IF p_allow_completed AND s.leaderboard_run_id IS NOT NULL THEN
    RETURN s;
  END IF;
  IF s.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'run_session_closed' USING ERRCODE = 'P0001';
  END IF;
  RETURN s;
END;
$$;
REVOKE ALL ON FUNCTION public._classic_session_get(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._classic_public_picks(p_picks jsonb, p_xray boolean)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_row jsonb;
BEGIN
  IF jsonb_typeof(p_picks) IS DISTINCT FROM 'array' THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_picks)
  LOOP
    v_row := jsonb_build_object(
      'slot', v_item ->> 'slot',
      'player_id', v_item ->> 'player_id',
      'team', v_item ->> 'team',
      'era', v_item ->> 'era',
      'spin_seq', v_item -> 'spin_seq'
    );
    IF p_xray THEN
      v_row := v_row || jsonb_build_object('value', v_item -> 'value');
    END IF;
    v_out := v_out || jsonb_build_array(v_row);
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public._classic_public_picks(jsonb, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._classic_pick_fair_pair(p_open text[], p_picked text[], p_lock_team text, p_lock_era text)
RETURNS TABLE(team_id text, era text)
LANGUAGE plpgsql VOLATILE
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_team text;
  v_era text;
BEGIN
  -- Match client pickFairResult: uniform team among teams with a valid era, then uniform era.
  IF p_lock_team IS NOT NULL AND p_lock_era IS NULL THEN
    -- Team locked (era reroll): pick another era for same team.
    SELECT pool.era INTO v_era
    FROM public.franchise_player_pool pool
    WHERE lower(pool.team_id) = lower(p_lock_team)
      AND pool.eligible && p_open
      AND NOT (pool.player_id = ANY (p_picked))
      AND pool.era IS DISTINCT FROM coalesce(p_lock_era, '')
    GROUP BY pool.era
    ORDER BY random()
    LIMIT 1;
    IF v_era IS NULL THEN
      SELECT pool.era INTO v_era
      FROM public.franchise_player_pool pool
      WHERE lower(pool.team_id) = lower(p_lock_team)
        AND pool.eligible && p_open
        AND NOT (pool.player_id = ANY (p_picked))
      GROUP BY pool.era
      ORDER BY random() LIMIT 1;
    END IF;
    team_id := lower(p_lock_team);
    era := v_era;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_lock_era IS NOT NULL AND p_lock_team IS NULL THEN
    -- Era locked (team reroll): pick another team that supports this era.
    SELECT lower(pool.team_id) INTO v_team
    FROM public.franchise_player_pool pool
    WHERE pool.era = p_lock_era
      AND pool.eligible && p_open
      AND NOT (pool.player_id = ANY (p_picked))
      AND lower(pool.team_id) IS DISTINCT FROM lower(coalesce(p_lock_team, ''))
    GROUP BY lower(pool.team_id)
    ORDER BY random() LIMIT 1;
    IF v_team IS NULL THEN
      SELECT lower(pool.team_id) INTO v_team
      FROM public.franchise_player_pool pool
      WHERE pool.eligible && p_open AND NOT (pool.player_id = ANY (p_picked))
      GROUP BY lower(pool.team_id)
      ORDER BY random() LIMIT 1;
      SELECT pool.era INTO v_era
      FROM public.franchise_player_pool pool
      WHERE lower(pool.team_id) = v_team
        AND pool.eligible && p_open AND NOT (pool.player_id = ANY (p_picked))
      GROUP BY pool.era ORDER BY random() LIMIT 1;
      team_id := v_team; era := v_era; RETURN NEXT; RETURN;
    END IF;
    team_id := v_team; era := p_lock_era; RETURN NEXT; RETURN;
  END IF;

  IF p_lock_team IS NOT NULL AND p_lock_era IS NOT NULL THEN
    -- Both locked (validate only)
    team_id := lower(p_lock_team); era := p_lock_era; RETURN NEXT; RETURN;
  END IF;

  -- Fresh spin (pickFairResult): uniform team, then uniform era for that team.
  SELECT lower(pool.team_id) INTO v_team
  FROM public.franchise_player_pool pool
  WHERE pool.eligible && p_open AND NOT (pool.player_id = ANY (p_picked))
  GROUP BY lower(pool.team_id)
  ORDER BY random() LIMIT 1;
  IF v_team IS NULL THEN
    RETURN;
  END IF;
  SELECT pool.era INTO v_era
  FROM public.franchise_player_pool pool
  WHERE lower(pool.team_id) = v_team
    AND pool.eligible && p_open AND NOT (pool.player_id = ANY (p_picked))
  GROUP BY pool.era
  ORDER BY random() LIMIT 1;
  team_id := v_team; era := v_era; RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public._classic_pick_fair_pair(text[], text[], text, text) FROM PUBLIC, anon, authenticated;

-- 1) Server-authored spin (no client team/era). Prevents repeat while spin pending.
CREATE OR REPLACE FUNCTION public.classic_spin(p_session uuid, p_action_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  s public.classic_run_sessions%ROWTYPE;
  v_action text := trim(coalesce(p_action_id, ''));
  v_picked text[];
  v_open text[];
  v_team text;
  v_era text;
  v_prev jsonb;
  v_xray boolean;
BEGIN
  IF length(v_action) < 8 OR length(v_action) > 80 THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;
  s := public._classic_session_get(p_session, false);

  SELECT result INTO v_prev FROM public.classic_run_actions
  WHERE session_id = s.id AND action_id = v_action;
  IF v_prev IS NOT NULL THEN
    RETURN v_prev;
  END IF;

  -- Unauthorized repeat: must not already have an unresolved spin
  -- (Double Draft may keep spin after first pick — still same spin_seq, no new spin).
  IF s.spin_team IS NOT NULL AND s.spin_era IS NOT NULL THEN
    RAISE EXCEPTION 'spin_pending' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(p ->> 'player_id'), ARRAY[]::text[]) INTO v_picked
  FROM jsonb_array_elements(s.picks) p;
  SELECT coalesce(array_agg(slot), ARRAY[]::text[]) INTO v_open
  FROM unnest(ARRAY['PG','SG','SF','PF','C']) slot
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.picks) p WHERE p ->> 'slot' = slot);
  IF coalesce(array_length(v_open, 1), 0) = 0 THEN
    RAISE EXCEPTION 'lineup_full' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.team_id, p.era INTO v_team, v_era
  FROM public._classic_pick_fair_pair(v_open, v_picked, NULL, NULL) p;
  IF v_team IS NULL OR v_era IS NULL THEN
    RAISE EXCEPTION 'pool_unavailable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.classic_run_sessions
  SET spin_team = v_team, spin_era = v_era, spin_seq = spin_seq + 1
  WHERE id = s.id RETURNING * INTO s;

  v_xray := coalesce((s.perks ->> 'xray')::boolean, false);
  v_prev := jsonb_build_object(
    'session_id', s.id,
    'spin_team', upper(s.spin_team),
    'spin_era', s.spin_era,
    'spin_seq', s.spin_seq,
    'boosts_used', s.boosts_used,
    'picks', public._classic_public_picks(s.picks, v_xray)
  );
  INSERT INTO public.classic_run_actions (session_id, action_id, kind, result)
  VALUES (s.id, v_action, 'spin', v_prev);
  RETURN v_prev;
END;
$$;
REVOKE ALL ON FUNCTION public.classic_spin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_spin(uuid, text) TO authenticated;

-- Legacy signature: reject client-chosen outcomes.
CREATE OR REPLACE FUNCTION public.classic_spin_commit(p_session uuid, p_team text, p_era text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RAISE EXCEPTION 'use_classic_spin' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.classic_spin_commit(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_spin_commit(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.classic_pick_commit(p_session uuid, p_player_id text, p_slot text, p_action_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  s public.classic_run_sessions%ROWTYPE;
  pool public.franchise_player_pool%ROWTYPE;
  v_slot text := upper(trim(coalesce(p_slot, '')));
  v_player text := trim(coalesce(p_player_id, ''));
  v_value bigint;
  v_action text := nullif(trim(coalesce(p_action_id, '')), '');
  v_prev jsonb;
  v_xray boolean;
  v_dd integer;
BEGIN
  s := public._classic_session_get(p_session, false);
  IF v_action IS NOT NULL THEN
    SELECT result INTO v_prev FROM public.classic_run_actions WHERE session_id = s.id AND action_id = v_action;
    IF v_prev IS NOT NULL THEN RETURN v_prev; END IF;
  END IF;

  IF s.spin_team IS NULL OR s.spin_era IS NULL THEN
    RAISE EXCEPTION 'no_spin' USING ERRCODE = 'P0001';
  END IF;
  IF length(v_player) < 4 OR v_slot NOT IN ('PG','SG','SF','PF','C') THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(s.picks) p WHERE p ->> 'slot' = v_slot) THEN
    RAISE EXCEPTION 'duplicate_slot' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(s.picks) p WHERE p ->> 'player_id' = v_player) THEN
    RAISE EXCEPTION 'duplicate_player' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO pool FROM public.franchise_player_pool WHERE player_id = v_player;
  IF pool.player_id IS NULL
     OR lower(pool.team_id) IS DISTINCT FROM lower(s.spin_team)
     OR pool.era IS DISTINCT FROM s.spin_era
     OR NOT (v_slot = ANY (pool.eligible)) THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = 'P0001';
  END IF;

  v_value := public.classic_seat_value(v_player, v_slot);
  IF v_value IS NULL THEN RAISE EXCEPTION 'unknown_player' USING ERRCODE = 'P0001'; END IF;

  v_dd := coalesce((s.perks ->> 'double_draft_left')::int, 0);

  UPDATE public.classic_run_sessions
  SET picks = picks || jsonb_build_array(jsonb_build_object(
        'slot', v_slot, 'player_id', v_player, 'value', v_value,
        'team', s.spin_team, 'era', s.spin_era, 'spin_seq', s.spin_seq
      )),
      spin_team = CASE WHEN v_dd > 1 THEN spin_team ELSE NULL END,
      spin_era = CASE WHEN v_dd > 1 THEN spin_era ELSE NULL END,
      perks = CASE WHEN v_dd > 0
        THEN jsonb_set(perks, '{double_draft_left}', to_jsonb(greatest(0, v_dd - 1)))
        ELSE perks END
  WHERE id = s.id RETURNING * INTO s;

  v_xray := coalesce((s.perks ->> 'xray')::boolean, false);
  v_prev := jsonb_build_object(
    'session_id', s.id,
    'picks', public._classic_public_picks(s.picks, v_xray),
    'spin_team', CASE WHEN s.spin_team IS NULL THEN NULL ELSE upper(s.spin_team) END,
    'spin_era', s.spin_era,
    'boosts_used', s.boosts_used
  );
  IF v_action IS NOT NULL THEN
    INSERT INTO public.classic_run_actions (session_id, action_id, kind, result)
    VALUES (s.id, v_action, 'pick', v_prev)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_prev;
END;
$$;
REVOKE ALL ON FUNCTION public.classic_pick_commit(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_pick_commit(uuid, text, text, text) TO authenticated;
-- Keep 3-arg overload for older clients.
CREATE OR REPLACE FUNCTION public.classic_pick_commit(p_session uuid, p_player_id text, p_slot text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RETURN public.classic_pick_commit(p_session, p_player_id, p_slot, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.classic_pick_commit(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_pick_commit(uuid, text, text) TO authenticated;

-- 5) Real Player Swap effect
CREATE OR REPLACE FUNCTION public.classic_swap_commit(
  p_session uuid, p_out_slot text, p_in_player_id text, p_action_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  s public.classic_run_sessions%ROWTYPE;
  pool public.franchise_player_pool%ROWTYPE;
  v_slot text := upper(trim(coalesce(p_out_slot, '')));
  v_player text := trim(coalesce(p_in_player_id, ''));
  v_action text := trim(coalesce(p_action_id, ''));
  v_value bigint;
  v_prev jsonb;
  v_xray boolean;
  v_new_picks jsonb := '[]'::jsonb;
  v_item jsonb;
  v_found boolean := false;
BEGIN
  IF length(v_action) < 8 OR length(v_action) > 80 THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;
  s := public._classic_session_get(p_session, false);
  SELECT result INTO v_prev FROM public.classic_run_actions WHERE session_id = s.id AND action_id = v_action;
  IF v_prev IS NOT NULL THEN RETURN v_prev; END IF;

  IF coalesce(s.perks ->> 'player_swap', 'false') <> 'true'
     OR coalesce(s.perks ->> 'player_swap_left', '0')::int <= 0 THEN
    RAISE EXCEPTION 'swap_not_active' USING ERRCODE = 'P0001';
  END IF;
  IF s.spin_team IS NULL OR s.spin_era IS NULL THEN
    RAISE EXCEPTION 'no_spin' USING ERRCODE = 'P0001';
  END IF;
  IF v_slot NOT IN ('PG','SG','SF','PF','C') THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO pool FROM public.franchise_player_pool WHERE player_id = v_player;
  IF pool.player_id IS NULL
     OR lower(pool.team_id) IS DISTINCT FROM lower(s.spin_team)
     OR pool.era IS DISTINCT FROM s.spin_era
     OR NOT (v_slot = ANY (pool.eligible)) THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(s.picks) p WHERE p ->> 'player_id' = v_player) THEN
    RAISE EXCEPTION 'duplicate_player' USING ERRCODE = '22023';
  END IF;

  v_value := public.classic_seat_value(v_player, v_slot);
  IF v_value IS NULL THEN RAISE EXCEPTION 'unknown_player' USING ERRCODE = 'P0001'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(s.picks)
  LOOP
    IF (v_item ->> 'slot') = v_slot THEN
      v_found := true;
      v_new_picks := v_new_picks || jsonb_build_array(jsonb_build_object(
        'slot', v_slot, 'player_id', v_player, 'value', v_value,
        'team', s.spin_team, 'era', s.spin_era, 'spin_seq', s.spin_seq, 'swapped', true
      ));
    ELSE
      v_new_picks := v_new_picks || jsonb_build_array(v_item);
    END IF;
  END LOOP;
  IF NOT v_found THEN RAISE EXCEPTION 'slot_empty' USING ERRCODE = 'P0001'; END IF;

  UPDATE public.classic_run_sessions
  SET picks = v_new_picks,
      spin_team = NULL,
      spin_era = NULL,
      perks = jsonb_set(
        jsonb_set(perks, '{player_swap_left}', to_jsonb(greatest(0, coalesce((perks ->> 'player_swap_left')::int, 0) - 1))),
        '{player_swap}', to_jsonb(greatest(0, coalesce((perks ->> 'player_swap_left')::int, 0) - 1) > 0)
      )
  WHERE id = s.id RETURNING * INTO s;

  v_xray := coalesce((s.perks ->> 'xray')::boolean, false);
  v_prev := jsonb_build_object(
    'session_id', s.id,
    'picks', public._classic_public_picks(s.picks, v_xray),
    'boosts_used', s.boosts_used,
    'perks', jsonb_build_object(
      'xray', coalesce((s.perks ->> 'xray')::boolean, false),
      'double_draft_left', coalesce((s.perks ->> 'double_draft_left')::int, 0),
      'player_swap_left', coalesce((s.perks ->> 'player_swap_left')::int, 0)
    )
  );
  INSERT INTO public.classic_run_actions (session_id, action_id, kind, result)
  VALUES (s.id, v_action, 'swap', v_prev);
  RETURN v_prev;
END;
$$;
REVOKE ALL ON FUNCTION public.classic_swap_commit(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_swap_commit(uuid, text, text, text) TO authenticated;

-- 3+4) Reroll preserves axis + stable action id; generates server spin
CREATE OR REPLACE FUNCTION public.classic_boost_reroll(p_session uuid, p_kind text, p_action_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  s public.classic_run_sessions%ROWTYPE;
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_action text := trim(coalesce(p_action_id, ''));
  v_free boolean := false;
  v_ref text;
  v_balance bigint;
  v_prev jsonb;
  v_picked text[];
  v_open text[];
  v_lock_team text;
  v_lock_era text;
  v_team text;
  v_era text;
  v_xray boolean;
BEGIN
  IF length(v_action) < 8 OR length(v_action) > 80 THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;
  s := public._classic_session_get(p_session, false);
  SELECT result INTO v_prev FROM public.classic_run_actions WHERE session_id = s.id AND action_id = v_action;
  IF v_prev IS NOT NULL THEN RETURN v_prev; END IF;

  IF v_kind NOT IN ('reroll_team', 'reroll_era') THEN
    RAISE EXCEPTION 'invalid_boost' USING ERRCODE = '22023';
  END IF;
  IF s.boosts_used >= 3 THEN
    RAISE EXCEPTION 'boost_limit' USING ERRCODE = 'P0001';
  END IF;
  -- Must have an active spin to reroll against.
  IF s.spin_team IS NULL OR s.spin_era IS NULL THEN
    RAISE EXCEPTION 'no_spin' USING ERRCODE = 'P0001';
  END IF;

  IF v_kind = 'reroll_team' AND s.free_team_left THEN
    v_free := true;
  ELSIF v_kind = 'reroll_era' AND s.free_era_left THEN
    v_free := true;
  END IF;

  IF NOT v_free THEN
    -- Stable spend key: session + action_id (retry-safe).
    v_ref := 'reroll:' || s.id::text || ':' || v_action;
    IF NOT public.coin_post(s.user_id, -100, 'spend', v_ref,
         jsonb_build_object('session_id', s.id, 'kind', v_kind, 'action_id', v_action)) THEN
      NULL; -- duplicate action spend already posted
    END IF;
  END IF;

  SELECT coalesce(array_agg(p ->> 'player_id'), ARRAY[]::text[]) INTO v_picked
  FROM jsonb_array_elements(s.picks) p;
  SELECT coalesce(array_agg(slot), ARRAY[]::text[]) INTO v_open
  FROM unnest(ARRAY['PG','SG','SF','PF','C']) slot
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.picks) p WHERE p ->> 'slot' = slot);

  IF v_kind = 'reroll_team' THEN
    -- Preserve era; pick a different team (pass current team as exclude via lock_team + lock_era both set with flag).
    SELECT lower(pool.team_id), pool.era INTO v_team, v_era
    FROM public.franchise_player_pool pool
    WHERE pool.era = s.spin_era
      AND pool.eligible && v_open
      AND NOT (pool.player_id = ANY (v_picked))
      AND lower(pool.team_id) IS DISTINCT FROM lower(s.spin_team)
    GROUP BY lower(pool.team_id), pool.era
    ORDER BY random() LIMIT 1;
  ELSE
    SELECT lower(pool.team_id), pool.era INTO v_team, v_era
    FROM public.franchise_player_pool pool
    WHERE lower(pool.team_id) = lower(s.spin_team)
      AND pool.eligible && v_open
      AND NOT (pool.player_id = ANY (v_picked))
      AND pool.era IS DISTINCT FROM s.spin_era
    GROUP BY lower(pool.team_id), pool.era
    ORDER BY random() LIMIT 1;
  END IF;
  -- silence unused
  v_lock_team := NULL; v_lock_era := NULL;
  IF false THEN
  SELECT p.team_id, p.era INTO v_team, v_era
  FROM public._classic_pick_fair_pair(v_open, v_picked, v_lock_team, v_lock_era) p;
  END IF;
  IF v_team IS NULL OR v_era IS NULL THEN
    RAISE EXCEPTION 'pool_unavailable' USING ERRCODE = 'P0001';
  END IF;
  -- Must actually change the rerolled axis.
  IF v_kind = 'reroll_team' AND lower(v_team) = lower(s.spin_team) THEN
    RAISE EXCEPTION 'reroll_unchanged' USING ERRCODE = 'P0001';
  END IF;
  IF v_kind = 'reroll_era' AND v_era = s.spin_era THEN
    RAISE EXCEPTION 'reroll_unchanged' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.classic_run_sessions
  SET boosts_used = boosts_used + 1,
      free_team_left = CASE WHEN v_kind = 'reroll_team' THEN false ELSE free_team_left END,
      free_era_left = CASE WHEN v_kind = 'reroll_era' THEN false ELSE free_era_left END,
      spin_team = v_team,
      spin_era = v_era,
      spin_seq = spin_seq + 1
  WHERE id = s.id RETURNING * INTO s;

  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = s.user_id;
  v_xray := coalesce((s.perks ->> 'xray')::boolean, false);
  v_prev := jsonb_build_object(
    'session_id', s.id,
    'boosts_used', s.boosts_used,
    'free', v_free,
    'spin_team', upper(s.spin_team),
    'spin_era', s.spin_era,
    'spin_seq', s.spin_seq,
    'coins_balance', coalesce(v_balance, 0),
    'picks', public._classic_public_picks(s.picks, v_xray)
  );
  INSERT INTO public.classic_run_actions (session_id, action_id, kind, result)
  VALUES (s.id, v_action, v_kind, v_prev);
  RETURN v_prev;
END;
$$;
REVOKE ALL ON FUNCTION public.classic_boost_reroll(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_boost_reroll(uuid, text, text) TO authenticated;

-- Compat 2-arg: require action via synthetic rejection
CREATE OR REPLACE FUNCTION public.classic_boost_reroll(p_session uuid, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RAISE EXCEPTION 'action_id_required' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.classic_boost_reroll(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_boost_reroll(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.classic_perk_activate(p_session uuid, p_perk text, p_action_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  s public.classic_run_sessions%ROWTYPE;
  v_perk text := lower(trim(coalesce(p_perk, '')));
  v_action text := trim(coalesce(p_action_id, ''));
  v_stock integer := 0;
  v_used_inv boolean := false;
  v_ref text;
  v_balance bigint;
  v_prev jsonb;
BEGIN
  IF length(v_action) < 8 OR length(v_action) > 80 THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;
  s := public._classic_session_get(p_session, false);
  SELECT result INTO v_prev FROM public.classic_run_actions WHERE session_id = s.id AND action_id = v_action;
  IF v_prev IS NOT NULL THEN RETURN v_prev; END IF;

  IF v_perk NOT IN ('double_draft', 'xray', 'player_swap') THEN
    RAISE EXCEPTION 'invalid_perk' USING ERRCODE = '22023';
  END IF;
  IF s.boosts_used >= 3 THEN RAISE EXCEPTION 'boost_limit' USING ERRCODE = 'P0001'; END IF;
  IF coalesce(s.perks ->> ('used_' || v_perk), 'false') = 'true' THEN
    RAISE EXCEPTION 'perk_already_used' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_perk_inventory (user_id) VALUES (s.user_id) ON CONFLICT DO NOTHING;
  SELECT CASE v_perk WHEN 'double_draft' THEN double_draft WHEN 'xray' THEN xray ELSE player_swap END
  INTO v_stock FROM public.user_perk_inventory WHERE user_id = s.user_id FOR UPDATE;

  IF coalesce(v_stock, 0) > 0 THEN
    IF v_perk = 'double_draft' THEN
      UPDATE public.user_perk_inventory SET double_draft = double_draft - 1, updated_at = now() WHERE user_id = s.user_id;
    ELSIF v_perk = 'xray' THEN
      UPDATE public.user_perk_inventory SET xray = xray - 1, updated_at = now() WHERE user_id = s.user_id;
    ELSE
      UPDATE public.user_perk_inventory SET player_swap = player_swap - 1, updated_at = now() WHERE user_id = s.user_id;
    END IF;
    INSERT INTO public.user_perk_consumptions (user_id, perk, run_ref)
    VALUES (s.user_id, v_perk, s.id::text) ON CONFLICT DO NOTHING;
    v_used_inv := true;
  ELSE
    v_ref := 'perk_activate:' || v_perk || ':' || s.id::text || ':' || v_action;
    IF NOT public.coin_post(s.user_id, -100, 'spend', v_ref,
         jsonb_build_object('session_id', s.id, 'perk', v_perk, 'action_id', v_action)) THEN
      NULL;
    END IF;
  END IF;

  UPDATE public.classic_run_sessions
  SET boosts_used = boosts_used + 1,
      perks = perks
        || jsonb_build_object('used_' || v_perk, true)
        || CASE
             WHEN v_perk = 'double_draft' THEN jsonb_build_object('double_draft_left', 2)
             WHEN v_perk = 'xray' THEN jsonb_build_object('xray', true)
             WHEN v_perk = 'player_swap' THEN jsonb_build_object('player_swap', true, 'player_swap_left', 1)
             ELSE '{}'::jsonb
           END
  WHERE id = s.id RETURNING * INTO s;

  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = s.user_id;
  v_prev := jsonb_build_object(
    'session_id', s.id,
    'boosts_used', s.boosts_used,
    'used_inventory', v_used_inv,
    'perks', jsonb_build_object(
      'xray', coalesce((s.perks ->> 'xray')::boolean, false),
      'double_draft_left', coalesce((s.perks ->> 'double_draft_left')::int, 0),
      'player_swap_left', coalesce((s.perks ->> 'player_swap_left')::int, 0)
    ),
    'coins_balance', coalesce(v_balance, 0),
    'inventory', public.perk_inventory_get(),
    'picks', public._classic_public_picks(s.picks, coalesce((s.perks ->> 'xray')::boolean, false))
  );
  INSERT INTO public.classic_run_actions (session_id, action_id, kind, result)
  VALUES (s.id, v_action, 'perk_' || v_perk, v_prev);
  RETURN v_prev;
END;
$$;
REVOKE ALL ON FUNCTION public.classic_perk_activate(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_perk_activate(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.classic_perk_activate(p_session uuid, p_perk text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  RAISE EXCEPTION 'action_id_required' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.classic_perk_activate(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_perk_activate(uuid, text) TO authenticated;

-- 7) Submit: allow completed retry before open-session gate
CREATE OR REPLACE FUNCTION public.classic_run_submit(p_session uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  s public.classic_run_sessions%ROWTYPE;
  v_uid uuid;
  v_total bigint := 0;
  v_item jsonb;
  v_slot text;
  v_player text;
  v_value bigint;
  v_seen_slots text[] := ARRAY[]::text[];
  v_seen_players text[] := ARRAY[]::text[];
  v_lineup jsonb := '[]'::jsonb;
  v_run_id uuid;
  v_prev_best bigint;
  v_is_new_best boolean := false;
  v_balance bigint;
  v_amount bigint;
  v_today integer;
BEGIN
  -- Allow completed sessions through for idempotent retry.
  s := public._classic_session_get(p_session, true);
  v_uid := s.user_id;

  IF s.leaderboard_run_id IS NOT NULL THEN
    SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = v_uid;
    RETURN jsonb_build_object(
      'ok', true, 'session_id', s.id, 'verified_value', s.verified_value,
      'run_id', s.leaderboard_run_id, 'duplicate', true,
      'coins_balance', coalesce(v_balance, 0)
    );
  END IF;

  IF s.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'run_session_closed' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(s.picks) IS DISTINCT FROM 'array' OR jsonb_array_length(s.picks) <> 5 THEN
    RAISE EXCEPTION 'incomplete_lineup' USING ERRCODE = 'P0001';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(s.picks)
  LOOP
    v_player := v_item ->> 'player_id';
    v_slot := upper(coalesce(v_item ->> 'slot', ''));
    IF v_slot NOT IN ('PG','SG','SF','PF','C') OR v_slot = ANY (v_seen_slots) OR v_player = ANY (v_seen_players) THEN
      RAISE EXCEPTION 'invalid_lineup' USING ERRCODE = '22023';
    END IF;
    v_value := public.classic_seat_value(v_player, v_slot);
    IF v_value IS NULL THEN RAISE EXCEPTION 'unknown_player' USING ERRCODE = 'P0001'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.franchise_player_pool pool
      WHERE pool.player_id = v_player
        AND lower(pool.team_id) = lower(coalesce(v_item ->> 'team', ''))
        AND pool.era = coalesce(v_item ->> 'era', '')
        AND v_slot = ANY (pool.eligible)
    ) THEN
      RAISE EXCEPTION 'invalid_pick_history' USING ERRCODE = 'P0001';
    END IF;
    v_seen_slots := array_append(v_seen_slots, v_slot);
    v_seen_players := array_append(v_seen_players, v_player);
    v_total := v_total + v_value;
    v_lineup := v_lineup || jsonb_build_array(jsonb_build_object('player_id', v_player, 'slot', v_slot));
  END LOOP;

  INSERT INTO public.user_leaderboard_runs (user_id, verified_value, lineup, client_run_id, achieved_at)
  VALUES (v_uid, v_total, v_lineup, s.id::text, now())
  RETURNING id INTO v_run_id;

  SELECT verified_best INTO v_prev_best FROM public.user_leaderboard_pb WHERE user_id = v_uid;
  IF v_prev_best IS NULL OR v_total > v_prev_best THEN
    v_is_new_best := true;
    INSERT INTO public.user_leaderboard_pb (user_id, verified_best, best_run_id, achieved_at, updated_at)
    VALUES (v_uid, v_total, v_run_id, now(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET verified_best = EXCLUDED.verified_best,
          best_run_id = EXCLUDED.best_run_id,
          achieved_at = EXCLUDED.achieved_at,
          updated_at = EXCLUDED.updated_at;
  END IF;

  SELECT count(*)::integer INTO v_today
  FROM public.coin_ledger
  WHERE user_id = v_uid AND kind = 'run_award'
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc');
  IF v_today < 40 THEN
    v_amount := 20 + CASE WHEN v_total >= 1000000000 THEN 30 ELSE 0 END;
    PERFORM public.coin_post(
      v_uid, v_amount, 'run_award', 'run:' || s.id::text,
      jsonb_build_object('verified_value', v_total, 'session_id', s.id)
    );
  END IF;

  UPDATE public.classic_run_sessions
  SET status = 'completed', completed_at = now(), verified_value = v_total,
      leaderboard_run_id = v_run_id, spin_team = NULL, spin_era = NULL
  WHERE id = s.id;

  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = v_uid;
  RETURN jsonb_build_object(
    'ok', true, 'session_id', s.id, 'verified_value', v_total,
    'is_new_best', v_is_new_best, 'run_id', v_run_id,
    'verified_best', CASE WHEN v_is_new_best THEN v_total ELSE coalesce(v_prev_best, 0) END,
    'coins_balance', coalesce(v_balance, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.classic_run_submit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_run_submit(uuid) TO authenticated;

-- 2) coin_award_classic_run enforces daily cap (compat wrapper; no bypass of submit cap)
CREATE OR REPLACE FUNCTION public.coin_award_classic_run(p_client_run_id text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  v_ref text := trim(coalesce(p_client_run_id, ''));
  s public.classic_run_sessions%ROWTYPE;
  v_balance bigint;
  v_today integer;
  v_amount bigint;
BEGIN
  PERFORM public._user_xact_lock(v_uid);
  IF v_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'run_session_required' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO s FROM public.classic_run_sessions WHERE id = v_ref::uuid AND user_id = v_uid FOR UPDATE;
  IF s.id IS NULL OR s.leaderboard_run_id IS NULL OR s.verified_value IS NULL THEN
    RAISE EXCEPTION 'run_not_verified' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer INTO v_today
  FROM public.coin_ledger
  WHERE user_id = v_uid AND kind = 'run_award'
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc');

  -- Idempotent: if this session already awarded, just return balance.
  IF EXISTS (
    SELECT 1 FROM public.coin_ledger
    WHERE user_id = v_uid AND kind = 'run_award' AND source_ref = 'run:' || s.id::text
  ) THEN
    SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = v_uid;
    RETURN coalesce(v_balance, 0);
  END IF;

  IF v_today >= 40 THEN
    RAISE EXCEPTION 'run_award_daily_cap' USING ERRCODE = 'P0001';
  END IF;

  v_amount := 20 + CASE WHEN s.verified_value >= 1000000000 THEN 30 ELSE 0 END;
  PERFORM public.coin_post(
    v_uid, v_amount, 'run_award', 'run:' || s.id::text,
    jsonb_build_object('verified_value', s.verified_value, 'session_id', s.id)
  );
  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = v_uid;
  RETURN coalesce(v_balance, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.coin_award_classic_run(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coin_award_classic_run(text) TO authenticated;

-- 13) Trivia shuffle must be VOLATILE (random()).
CREATE OR REPLACE FUNCTION public._trivia_shuffle_choices(p_choices jsonb, p_correct smallint)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SET search_path = public
AS $$
DECLARE
  v_items text[];
  v_order int[] := ARRAY[0,1,2,3];
  v_i int;
  v_j int;
  v_tmp int;
  v_out jsonb := '[]'::jsonb;
  v_new_correct smallint;
BEGIN
  IF jsonb_typeof(p_choices) IS DISTINCT FROM 'array' OR jsonb_array_length(p_choices) <> 4 THEN
    RAISE EXCEPTION 'invalid_choices' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(value #>> '{}') INTO v_items
  FROM jsonb_array_elements(p_choices);
  FOR v_i IN REVERSE 3..1 LOOP
    v_j := floor(random() * (v_i + 1))::int;
    v_tmp := v_order[v_i + 1];
    v_order[v_i + 1] := v_order[v_j + 1];
    v_order[v_j + 1] := v_tmp;
  END LOOP;
  v_new_correct := NULL;
  FOR v_i IN 0..3 LOOP
    v_out := v_out || jsonb_build_array(v_items[v_order[v_i + 1] + 1]);
    IF v_order[v_i + 1] = p_correct THEN
      v_new_correct := v_i;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('choices', v_out, 'correct_index', v_new_correct);
END;
$$;
REVOKE ALL ON FUNCTION public._trivia_shuffle_choices(jsonb, smallint) FROM PUBLIC, anon, authenticated;

-- 9+10) Entitlements recomputed from valid transaction history; refund debts audited.
CREATE OR REPLACE FUNCTION public._iap_collect_refund_debts(p_user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  d public.iap_refund_debts%ROWTYPE;
  v_bal bigint;
  v_take bigint;
BEGIN
  FOR d IN
    SELECT * FROM public.iap_refund_debts
    WHERE user_id = p_user AND amount_remaining > 0
    ORDER BY created_at
    FOR UPDATE
  LOOP
    SELECT balance INTO v_bal FROM public.coin_accounts WHERE user_id = p_user FOR UPDATE;
    v_bal := coalesce(v_bal, 0);
    IF v_bal <= 0 THEN EXIT; END IF;
    v_take := least(v_bal, d.amount_remaining);
    BEGIN
      PERFORM public.coin_post(
        p_user, -v_take, 'iap_refund',
        'iap_refund_debt:' || d.transaction_id || ':' || d.amount_remaining::text,
        jsonb_build_object('transaction_id', d.transaction_id, 'partial', true, 'taken', v_take)
      );
    EXCEPTION WHEN others THEN
      -- Next credit/spend cycle will retry; debt row remains authoritative.
      CONTINUE;
    END;
    IF v_take >= d.amount_remaining THEN
      DELETE FROM public.iap_refund_debts WHERE transaction_id = d.transaction_id;
    ELSE
      UPDATE public.iap_refund_debts
      SET amount_remaining = amount_remaining - v_take, updated_at = now()
      WHERE transaction_id = d.transaction_id;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._iap_collect_refund_debts(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._iap_recompute_entitlements(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_remove boolean := false;
  v_premium boolean := false;
  v_pro_until timestamptz := NULL;
  r record;
BEGIN
  FOR r IN
    SELECT t.status, t.expires_at, c.kind
    FROM public.iap_transactions t
    JOIN public.iap_product_catalog c ON c.product_id = t.product_id
    WHERE t.user_id = p_user AND t.status = 'granted'
  LOOP
    IF r.kind = 'remove_ads' THEN
      v_remove := true;
    ELSIF r.kind = 'premium' THEN
      v_premium := true;
      v_remove := true;
    ELSIF r.kind IN ('pro_monthly', 'pro_yearly') THEN
      IF coalesce(r.expires_at, now()) > now() THEN
        v_remove := true;
        v_pro_until := GREATEST(v_pro_until, r.expires_at);
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.user_entitlements (user_id) VALUES (p_user) ON CONFLICT DO NOTHING;
  UPDATE public.user_entitlements SET
    remove_ads = v_remove,
    premium = v_premium,
    pro_active_until = v_pro_until,
    updated_at = now()
  WHERE user_id = p_user;

  RETURN jsonb_build_object(
    'remove_ads', v_remove,
    'premium', v_premium,
    'pro_active_until', v_pro_until,
    'pro_active', coalesce(v_pro_until, now()) > now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public._iap_recompute_entitlements(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._iap_recompute_entitlements(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.coin_grant_iap(
  p_user uuid,
  p_transaction_id text,
  p_product_id text,
  p_original_transaction_id text DEFAULT NULL,
  p_environment text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_tx text := trim(coalesce(p_transaction_id, ''));
  v_product text := trim(coalesce(p_product_id, ''));
  v_cat public.iap_product_catalog%ROWTYPE;
  v_balance bigint;
  v_ok boolean;
  v_existing public.iap_transactions%ROWTYPE;
  v_ent jsonb;
  v_expires timestamptz;
BEGIN
  PERFORM public._require_service_role();
  IF p_user IS NULL OR length(v_tx) < 4 OR length(v_product) < 1 THEN
    RAISE EXCEPTION 'invalid_iap' USING ERRCODE = '22023';
  END IF;

  PERFORM public._user_xact_lock(p_user);

  SELECT * INTO v_existing FROM public.iap_transactions WHERE transaction_id = v_tx FOR UPDATE;
  IF v_existing.transaction_id IS NOT NULL THEN
    IF v_existing.user_id IS DISTINCT FROM p_user THEN
      RAISE EXCEPTION 'iap_account_mismatch' USING ERRCODE = '42501';
    END IF;
    PERFORM public._iap_collect_refund_debts(p_user);
    v_ent := public._iap_recompute_entitlements(p_user);
    SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = p_user;
    RETURN jsonb_build_object(
      'ok', true, 'granted', 0, 'duplicate', true,
      'coins_balance', coalesce(v_balance, 0),
      'product_id', v_existing.product_id, 'status', v_existing.status
    ) || v_ent;
  END IF;

  SELECT * INTO v_cat FROM public.iap_product_catalog WHERE product_id = v_product AND active;
  IF v_cat.product_id IS NULL THEN
    RAISE EXCEPTION 'unknown_product' USING ERRCODE = 'P0001';
  END IF;

  v_expires := CASE
    WHEN v_cat.kind IN ('pro_monthly', 'pro_yearly') THEN
      coalesce(p_expires_at, now() + CASE WHEN v_cat.kind = 'pro_yearly' THEN interval '366 days' ELSE interval '32 days' END)
    ELSE p_expires_at
  END;

  INSERT INTO public.iap_transactions (
    transaction_id, user_id, product_id, original_transaction_id, environment, status, granted_coins, expires_at
  ) VALUES (
    v_tx, p_user, v_product, nullif(trim(coalesce(p_original_transaction_id,'')), ''),
    nullif(trim(coalesce(p_environment,'')), ''), 'granted', v_cat.coins, v_expires
  );

  IF v_cat.coins > 0 THEN
    v_ok := public.coin_post(
      p_user, v_cat.coins, 'iap_grant', 'iap_tx:' || v_tx,
      jsonb_build_object('product_id', v_product, 'kind', v_cat.kind)
    );
  ELSE
    v_ok := true;
  END IF;

  PERFORM public._iap_collect_refund_debts(p_user);
  v_ent := public._iap_recompute_entitlements(p_user);
  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = p_user;
  RETURN jsonb_build_object(
    'ok', true,
    'granted', CASE WHEN v_ok AND v_cat.coins > 0 THEN v_cat.coins ELSE 0 END,
    'duplicate', NOT v_ok,
    'coins_balance', coalesce(v_balance, 0),
    'product_id', v_product,
    'kind', v_cat.kind,
    'billing', v_cat.billing
  ) || v_ent;
END;
$$;
REVOKE ALL ON FUNCTION public.coin_grant_iap(uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coin_grant_iap(uuid, text, text, text, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.coin_grant_iap(p_user uuid, p_transaction_id text, p_product_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RETURN public.coin_grant_iap(p_user, p_transaction_id, p_product_id, NULL, NULL, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.coin_grant_iap(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coin_grant_iap(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.iap_revoke_transaction(p_transaction_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_tx text := trim(coalesce(p_transaction_id, ''));
  t public.iap_transactions%ROWTYPE;
  v_owed bigint;
  v_bal bigint;
  v_take bigint;
  v_debt bigint := 0;
  v_debited boolean := false;
  v_ent jsonb;
BEGIN
  PERFORM public._require_service_role();
  SELECT * INTO t FROM public.iap_transactions WHERE transaction_id = v_tx FOR UPDATE;
  IF t.transaction_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'ignored', true);
  END IF;
  IF t.status IN ('refunded', 'revoked') THEN
    v_ent := public._iap_recompute_entitlements(t.user_id);
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'status', t.status) || v_ent;
  END IF;

  UPDATE public.iap_transactions
  SET status = 'revoked', updated_at = now()
  WHERE transaction_id = v_tx;

  v_owed := coalesce(t.granted_coins, 0);
  IF v_owed > 0 THEN
    SELECT coalesce(balance, 0) INTO v_bal FROM public.coin_accounts WHERE user_id = t.user_id FOR UPDATE;
    v_take := least(v_bal, v_owed);
    IF v_take > 0 THEN
      BEGIN
        PERFORM public.coin_post(
          t.user_id, -v_take, 'iap_refund', 'iap_refund:' || v_tx,
          jsonb_build_object('transaction_id', v_tx, 'product_id', t.product_id, 'owed', v_owed)
        );
        v_debited := true;
      EXCEPTION WHEN others THEN
        -- Fall through to full debt if ledger reject (should be rare after balance check).
        v_take := 0;
      END;
    END IF;
    v_debt := v_owed - v_take;
    IF v_debt > 0 THEN
      INSERT INTO public.iap_refund_debts (transaction_id, user_id, amount_remaining)
      VALUES (v_tx, t.user_id, v_debt)
      ON CONFLICT (transaction_id) DO UPDATE
        SET amount_remaining = EXCLUDED.amount_remaining, updated_at = now();
    ELSE
      DELETE FROM public.iap_refund_debts WHERE transaction_id = v_tx;
    END IF;
  END IF;

  -- Recompute from remaining granted history (does not wipe unrelated entitlements).
  v_ent := public._iap_recompute_entitlements(t.user_id);
  RETURN jsonb_build_object(
    'ok', true,
    'revoked', v_tx,
    'debited', v_debited,
    'debt_remaining', v_debt
  ) || v_ent;
END;
$$;
REVOKE ALL ON FUNCTION public.iap_revoke_transaction(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iap_revoke_transaction(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
BEGIN
  RETURN public._iap_recompute_entitlements(v_uid);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated;

-- Spend path also collects refund debts so refunded coins do not stay freely spendable.
CREATE OR REPLACE FUNCTION public._coin_post_with_debt_collect(
  p_user uuid, p_amount bigint, p_kind text, p_source_ref text, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE v_ok boolean;
BEGIN
  v_ok := public.coin_post(p_user, p_amount, p_kind, p_source_ref, p_metadata);
  IF p_amount > 0 THEN
    PERFORM public._iap_collect_refund_debts(p_user);
  END IF;
  RETURN v_ok;
END;
$$;
REVOKE ALL ON FUNCTION public._coin_post_with_debt_collect(uuid, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- 12) Legacy leaderboard / reward RPCs cannot bypass authoritative submit.
CREATE OR REPLACE FUNCTION public.submit_classic_leaderboard_lineup(p_lineup jsonb, p_client_run_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RAISE EXCEPTION 'use_classic_run_submit' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.submit_classic_leaderboard_lineup(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_classic_leaderboard_lineup(jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_leaderboard_run(p_verified_value bigint, p_lineup jsonb, p_client_run_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RAISE EXCEPTION 'use_classic_run_submit' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.submit_leaderboard_run(bigint, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_leaderboard_run(bigint, jsonb, text) TO authenticated;

-- Explicit service_role EXECUTE for monetary / IAP internals (no authenticated EXECUTE).
GRANT EXECUTE ON FUNCTION public.coin_post(uuid, bigint, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.bank_post(uuid, bigint, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._iap_collect_refund_debts(uuid) TO service_role;


-- =============================================================================
-- V4 FIXES (release blockers) — same transaction; replaces surfaces above.
-- =============================================================================

-- 8) Ensure production coin_ledger kinds include every secure kind (incl. iap_refund).
DO $$
BEGIN
  ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_kind_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;
ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_kind_check;
DO $$
BEGIN
  ALTER TABLE public.coin_ledger
    ADD CONSTRAINT coin_ledger_kind_check CHECK (kind IN (
      'admin_adjustment', 'iap_grant', 'iap_refund', 'welcome', 'run_award', 'spend'
    ));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 6) Allow abandoned status for interrupted runs (keep completed/expired).
ALTER TABLE public.classic_run_sessions DROP CONSTRAINT IF EXISTS classic_run_sessions_status_check;
ALTER TABLE public.classic_run_sessions
  ADD CONSTRAINT classic_run_sessions_status_check
  CHECK (status IN ('open', 'completed', 'expired', 'abandoned'));

-- 4) coin_post always collects refund debts (credits after; spends before),
--    skipping nested collect on iap_refund rows to avoid recursion.
CREATE OR REPLACE FUNCTION public.coin_post(
  p_user uuid,
  p_amount bigint,
  p_kind text,
  p_source_ref text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_balance bigint;
  v_entry bigint;
  v_collect boolean := (p_kind IS DISTINCT FROM 'iap_refund');
BEGIN
  IF p_user IS NULL OR p_amount IS NULL OR p_amount = 0 THEN
    RETURN false;
  END IF;
  IF length(trim(coalesce(p_source_ref, ''))) < 1 OR length(p_source_ref) > 200 THEN
    RAISE EXCEPTION 'invalid_source_ref' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.coin_accounts (user_id) VALUES (p_user)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.coin_accounts
  WHERE user_id = p_user
  FOR UPDATE;

  -- Before a spend, claw back outstanding refund debt so refunded coins are not spendable.
  IF v_collect AND p_amount < 0 THEN
    PERFORM public._iap_collect_refund_debts(p_user);
    SELECT balance INTO v_balance
    FROM public.coin_accounts
    WHERE user_id = p_user
    FOR UPDATE;
  END IF;

  INSERT INTO public.coin_ledger (user_id, amount, kind, source_ref, metadata)
  VALUES (p_user, p_amount, p_kind, p_source_ref, coalesce(p_metadata, '{}'::jsonb))
  ON CONFLICT ON CONSTRAINT coin_ledger_unique_source DO NOTHING
  RETURNING id INTO v_entry;

  IF v_entry IS NULL THEN
    RETURN false;
  END IF;

  IF v_balance + p_amount < 0 THEN
    DELETE FROM public.coin_ledger WHERE id = v_entry;
    RAISE EXCEPTION 'insufficient_coins' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.coin_accounts
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user;

  -- After a credit, collect any remaining refund debt.
  IF v_collect AND p_amount > 0 THEN
    PERFORM public._iap_collect_refund_debts(p_user);
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.coin_post(uuid, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coin_post(uuid, bigint, text, text, jsonb) TO service_role;

-- Keep wrapper as alias (now redundant but harmless for callers).
CREATE OR REPLACE FUNCTION public._coin_post_with_debt_collect(
  p_user uuid, p_amount bigint, p_kind text, p_source_ref text, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RETURN public.coin_post(p_user, p_amount, p_kind, p_source_ref, p_metadata);
END;
$$;
REVOKE ALL ON FUNCTION public._coin_post_with_debt_collect(uuid, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- 3) Do not treat missing subscription expiry as active; require real expires_at on grant.
CREATE OR REPLACE FUNCTION public._iap_recompute_entitlements(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_remove boolean := false;
  v_premium boolean := false;
  v_pro_until timestamptz := NULL;
  r record;
BEGIN
  FOR r IN
    SELECT t.status, t.expires_at, c.kind
    FROM public.iap_transactions t
    JOIN public.iap_product_catalog c ON c.product_id = t.product_id
    WHERE t.user_id = p_user AND t.status = 'granted'
  LOOP
    IF r.kind = 'remove_ads' THEN
      v_remove := true;
    ELSIF r.kind = 'premium' THEN
      v_premium := true;
      v_remove := true;
    ELSIF r.kind IN ('pro_monthly', 'pro_yearly') THEN
      -- Never fabricate expiry: NULL expires_at does not grant Pro / ads removal.
      IF r.expires_at IS NOT NULL AND r.expires_at > now() THEN
        v_remove := true;
        v_pro_until := GREATEST(v_pro_until, r.expires_at);
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.user_entitlements (user_id) VALUES (p_user) ON CONFLICT DO NOTHING;
  UPDATE public.user_entitlements SET
    remove_ads = v_remove,
    premium = v_premium,
    pro_active_until = v_pro_until,
    updated_at = now()
  WHERE user_id = p_user;

  RETURN jsonb_build_object(
    'remove_ads', v_remove,
    'premium', v_premium,
    'pro_active_until', v_pro_until,
    'pro_active', coalesce(v_pro_until, now()) > now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public._iap_recompute_entitlements(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._iap_recompute_entitlements(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.coin_grant_iap(
  p_user uuid,
  p_transaction_id text,
  p_product_id text,
  p_original_transaction_id text DEFAULT NULL,
  p_environment text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_tx text := trim(coalesce(p_transaction_id, ''));
  v_product text := trim(coalesce(p_product_id, ''));
  v_env text := nullif(trim(coalesce(p_environment, '')), '');
  v_cat public.iap_product_catalog%ROWTYPE;
  v_balance bigint;
  v_ok boolean;
  v_existing public.iap_transactions%ROWTYPE;
  v_ent jsonb;
  v_expires timestamptz;
BEGIN
  PERFORM public._require_service_role();
  IF p_user IS NULL OR length(v_tx) < 4 OR length(v_product) < 1 THEN
    RAISE EXCEPTION 'invalid_iap' USING ERRCODE = '22023';
  END IF;
  IF v_env IS NOT NULL AND v_env NOT IN ('Sandbox', 'Production') THEN
    RAISE EXCEPTION 'invalid_iap_environment' USING ERRCODE = '22023';
  END IF;

  PERFORM public._user_xact_lock(p_user);

  SELECT * INTO v_existing FROM public.iap_transactions WHERE transaction_id = v_tx FOR UPDATE;
  IF v_existing.transaction_id IS NOT NULL THEN
    IF v_existing.user_id IS DISTINCT FROM p_user THEN
      RAISE EXCEPTION 'iap_account_mismatch' USING ERRCODE = '42501';
    END IF;
    -- Restore / retry: recompute from history (preserves other valid entitlements).
    v_ent := public._iap_recompute_entitlements(p_user);
    SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = p_user;
    RETURN jsonb_build_object(
      'ok', true, 'granted', 0, 'duplicate', true,
      'coins_balance', coalesce(v_balance, 0),
      'product_id', v_existing.product_id, 'status', v_existing.status
    ) || v_ent;
  END IF;

  SELECT * INTO v_cat FROM public.iap_product_catalog WHERE product_id = v_product AND active;
  IF v_cat.product_id IS NULL THEN
    RAISE EXCEPTION 'unknown_product' USING ERRCODE = 'P0001';
  END IF;

  IF v_cat.kind IN ('pro_monthly', 'pro_yearly') THEN
    IF p_expires_at IS NULL THEN
      RAISE EXCEPTION 'subscription_expires_required' USING ERRCODE = 'P0001';
    END IF;
    v_expires := p_expires_at;
  ELSE
    v_expires := NULL;
  END IF;

  INSERT INTO public.iap_transactions (
    transaction_id, user_id, product_id, original_transaction_id, environment, status, granted_coins, expires_at
  ) VALUES (
    v_tx, p_user, v_product, nullif(trim(coalesce(p_original_transaction_id,'')), ''),
    v_env, 'granted', v_cat.coins, v_expires
  );

  IF v_cat.coins > 0 THEN
    v_ok := public.coin_post(
      p_user, v_cat.coins, 'iap_grant', 'iap_tx:' || v_tx,
      jsonb_build_object('product_id', v_product, 'kind', v_cat.kind, 'environment', v_env)
    );
  ELSE
    v_ok := true;
  END IF;

  v_ent := public._iap_recompute_entitlements(p_user);
  SELECT coalesce(a.balance, 0) INTO v_balance FROM public.coin_accounts a WHERE a.user_id = p_user;
  RETURN jsonb_build_object(
    'ok', true,
    'granted', CASE WHEN v_ok AND v_cat.coins > 0 THEN v_cat.coins ELSE 0 END,
    'duplicate', NOT v_ok,
    'coins_balance', coalesce(v_balance, 0),
    'product_id', v_product,
    'kind', v_cat.kind,
    'billing', v_cat.billing,
    'environment', v_env
  ) || v_ent;
END;
$$;
REVOKE ALL ON FUNCTION public.coin_grant_iap(uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coin_grant_iap(uuid, text, text, text, text, timestamptz) TO service_role;

-- 6) Abandoned-run recovery: free slots without waiting for 2h expiry.
CREATE OR REPLACE FUNCTION public.classic_run_abandon(p_session uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  v_id uuid;
  v_n integer := 0;
BEGIN
  PERFORM public._user_xact_lock(v_uid);
  IF p_session IS NOT NULL THEN
    UPDATE public.classic_run_sessions
    SET status = 'abandoned', completed_at = coalesce(completed_at, now())
    WHERE id = p_session AND user_id = v_uid AND status = 'open'
      AND jsonb_typeof(picks) = 'array' AND jsonb_array_length(picks) < 5
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'abandon_not_allowed' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object('ok', true, 'abandoned', ARRAY[v_id]);
  END IF;

  WITH doomed AS (
    SELECT id FROM public.classic_run_sessions
    WHERE user_id = v_uid AND status = 'open'
      AND jsonb_typeof(picks) = 'array' AND jsonb_array_length(picks) < 5
    ORDER BY started_at ASC
  )
  UPDATE public.classic_run_sessions s
  SET status = 'abandoned', completed_at = coalesce(completed_at, now())
  FROM doomed d WHERE s.id = d.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'abandoned_count', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.classic_run_abandon(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_run_abandon(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.classic_run_begin()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
DECLARE
  v_uid uuid := public._require_permanent_uid();
  v_open integer;
  v_id uuid;
  v_victim uuid;
BEGIN
  PERFORM public._user_xact_lock(v_uid);

  UPDATE public.classic_run_sessions
  SET status = 'expired', completed_at = coalesce(completed_at, now())
  WHERE user_id = v_uid AND status = 'open' AND expires_at < now();

  SELECT count(*)::integer INTO v_open
  FROM public.classic_run_sessions
  WHERE user_id = v_uid AND status = 'open';

  -- Auto-abandon oldest incomplete open runs until under the cap (no 2h lockout).
  WHILE v_open >= 3 LOOP
    SELECT id INTO v_victim
    FROM public.classic_run_sessions
    WHERE user_id = v_uid AND status = 'open'
      AND jsonb_typeof(picks) = 'array' AND jsonb_array_length(picks) < 5
    ORDER BY started_at ASC
    LIMIT 1;
    EXIT WHEN v_victim IS NULL;
    UPDATE public.classic_run_sessions
    SET status = 'abandoned', completed_at = coalesce(completed_at, now())
    WHERE id = v_victim;
    SELECT count(*)::integer INTO v_open
    FROM public.classic_run_sessions
    WHERE user_id = v_uid AND status = 'open';
  END LOOP;

  IF v_open >= 3 THEN
    RAISE EXCEPTION 'too_many_open_runs' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.classic_run_sessions (user_id)
  VALUES (v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.classic_run_begin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_run_begin() TO authenticated;

COMMIT;

-- Verify (manual / staging):
--   select to_regprocedure('public.classic_run_abandon(uuid)');
--   select conname from pg_constraint where conname='coin_ledger_kind_check';
--   select has_function_privilege('authenticated', 'public.coin_post(uuid,bigint,text,text,jsonb)', 'execute'); -- false
