-- 1B Run — Bank, leaderboard, Surplus Spin, Wall of Fame, The Circuit, Bet on Yourself.
-- Paste this whole file into Supabase → SQL Editor → New query, then Run. Safe to run more than once.
-- Generated from supabase/migrations (20261017_1 … 20261018_6), in order. Requires the earlier
-- profiles / achievements / classic leaderboard / seat lookup migrations (already live).

-- ============================================================================
-- 20261017_1_bank_ledger.sql
-- ============================================================================
-- Bank ledger: authoritative, server-side in-game Cash for permanent 1B Run accounts.
--
-- Model
--   bank_ledger    append-only entries (credits > 0, debits < 0), one per unique source.
--   bank_accounts  cached balance per user, maintained only by public.bank_post().
--   Clients can read their own ledger rows. Nothing is client-writable.
--
-- Sources wired here
--   achievement        credited by trigger when user_achievement_progress gains an ID.
--   classic_run_bonus  credited by trigger on verified runs (OFF until enabled — see bank_settings).
-- Reserved for features that post through bank_post() in their own RPCs
--   cash_table_wager / cash_table_payout / cash_table_refund
--   league_entry / league_payout / league_refund
--   admin_adjustment
--
-- Existing balances are preserved by the backfill at the bottom: every achievement already
-- synced to user_achievement_progress is paid once at the same tier amounts the app uses.
--
-- All Cash is fictional in-game currency.
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bank_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Verified Classic runs prove the lineup's value, not that it was drafted from real spins.
  -- Keep OFF until runs are server-issued; otherwise bonuses can be farmed.
  run_bonus_enabled boolean NOT NULL DEFAULT false,
  run_bonus_daily_cap integer NOT NULL DEFAULT 3 CHECK (run_bonus_daily_cap >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bank_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.bank_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bank_settings FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ledger + accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_accounts_rank_idx
  ON public.bank_accounts (balance DESC, user_id);

CREATE TABLE IF NOT EXISTS public.bank_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount <> 0),
  kind text NOT NULL CHECK (kind IN (
    'achievement',
    'classic_run_bonus',
    'cash_table_wager',
    'cash_table_payout',
    'cash_table_refund',
    'league_entry',
    'league_payout',
    'league_refund',
    'admin_adjustment'
  )),
  -- Idempotency key within (user, kind): achievement ID, run UUID, wager ID, league entry ID…
  source_ref text NOT NULL CHECK (length(source_ref) BETWEEN 1 AND 200),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_ledger_unique_source UNIQUE (user_id, kind, source_ref)
);

CREATE INDEX IF NOT EXISTS bank_ledger_user_created_idx
  ON public.bank_ledger (user_id, created_at DESC);

COMMENT ON TABLE public.bank_ledger IS
  'Append-only in-game Cash ledger. Written only by bank_post(). Fictional currency.';
COMMENT ON TABLE public.bank_accounts IS
  'Cached Bank balance = sum(bank_ledger.amount). Written only by bank_post().';

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_ledger_select_own ON public.bank_ledger;
CREATE POLICY bank_ledger_select_own
  ON public.bank_ledger
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Balances are public only through the leaderboard RPCs (no user_id exposure).
REVOKE ALL ON TABLE public.bank_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bank_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bank_ledger TO authenticated;

-- ---------------------------------------------------------------------------
-- Achievement payouts — must match lib/tradeup/bank.ts (TIER_CASH / CHALLENGE_TIER)
-- Unknown IDs pay 0, so a tampered progress row can never mint arbitrary Cash.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.achievement_cash_reward(p_id text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_id
    -- Rookie
    WHEN 'halfway-home' THEN 10000
    WHEN 'closing-in' THEN 10000
    WHEN 'h2h-first-win' THEN 10000
    -- Pro
    WHEN 'near-miss-950m' THEN 25000
    WHEN 'hit-1b' THEN 25000
    WHEN 'all-in' THEN 25000
    WHEN 'league-tour' THEN 25000
    WHEN 'generational-wealth' THEN 25000
    WHEN 'h2h-statement' THEN 25000
    -- All-Star
    WHEN 'no-second-chances' THEN 50000
    WHEN 'just-enough' THEN 50000
    WHEN 'hit-1-05b' THEN 50000
    WHEN 'billion-and-beyond' THEN 50000
    WHEN 'no-headliners' THEN 50000
    WHEN 'double-trouble' THEN 50000
    WHEN 'triple-threat' THEN 50000
    WHEN 'back-to-back-billions' THEN 50000
    WHEN 'h2h-billion' THEN 50000
    WHEN 'h2h-three-wins' THEN 50000
    -- MVP
    WHEN 'elite-company' THEN 100000
    WHEN 'two-hundred-m-club' THEN 100000
    WHEN 'balanced-books' THEN 100000
    WHEN 'five-star-portfolio' THEN 100000
    WHEN 'top-of-the-market' THEN 100000
    WHEN 'clutch-investment' THEN 100000
    WHEN 'perfect-range' THEN 100000
    WHEN 'three-peat' THEN 100000
    WHEN 'h2h-clean-sweep' THEN 100000
    -- Legend
    WHEN 'five-runs-1-1b' THEN 250000
    WHEN 'ten-billion-runs' THEN 250000
    ELSE 0
  END::bigint;
$$;

REVOKE ALL ON FUNCTION public.achievement_cash_reward(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Single write path. Idempotent per (user, kind, source_ref). Rejects overdrafts.
-- Internal only: not executable by anon/authenticated. Feature RPCs call it.
-- ---------------------------------------------------------------------------

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

  INSERT INTO public.bank_accounts (user_id) VALUES (p_user)
  ON CONFLICT (user_id) DO NOTHING;

  -- Serialize all postings for this user.
  SELECT balance INTO v_balance
  FROM public.bank_accounts
  WHERE user_id = p_user
  FOR UPDATE;

  INSERT INTO public.bank_ledger (user_id, amount, kind, source_ref, metadata)
  VALUES (p_user, p_amount, p_kind, p_source_ref, coalesce(p_metadata, '{}'::jsonb))
  ON CONFLICT ON CONSTRAINT bank_ledger_unique_source DO NOTHING
  RETURNING id INTO v_entry;

  IF v_entry IS NULL THEN
    RETURN false; -- already posted
  END IF;

  IF v_balance + p_amount < 0 THEN
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

-- ---------------------------------------------------------------------------
-- Achievement credits — fire when the synced unlock ledger gains IDs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bank_credit_achievements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_id text;
  v_reward bigint;
  v_prev text[] := '{}'::text[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_prev := coalesce(OLD.completed_ids, '{}'::text[]);
  END IF;

  FOR v_id IN
    SELECT unnest(coalesce(NEW.completed_ids, '{}'::text[]))
    EXCEPT
    SELECT unnest(v_prev)
  LOOP
    v_reward := public.achievement_cash_reward(v_id);
    IF v_reward > 0 THEN
      PERFORM public.bank_post(NEW.user_id, v_reward, 'achievement', v_id,
        jsonb_build_object('achievement_id', v_id));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bank_credit_achievements() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bank_credit_achievements_trg ON public.user_achievement_progress;
CREATE TRIGGER bank_credit_achievements_trg
  AFTER INSERT OR UPDATE OF completed_ids ON public.user_achievement_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.bank_credit_achievements();

-- ---------------------------------------------------------------------------
-- Classic run bonus — Cash above the $1B team goal on server-verified runs.
-- Gated by bank_settings.run_bonus_enabled (default OFF) and a daily cap.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bank_credit_run_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_enabled boolean;
  v_cap integer;
  v_today integer;
  v_bonus bigint := NEW.verified_value - 1000000000;
BEGIN
  IF v_bonus <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT run_bonus_enabled, run_bonus_daily_cap INTO v_enabled, v_cap
  FROM public.bank_settings WHERE id;

  IF NOT coalesce(v_enabled, false) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_today
  FROM public.bank_ledger
  WHERE user_id = NEW.user_id
    AND kind = 'classic_run_bonus'
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';

  IF v_today >= coalesce(v_cap, 0) THEN
    RETURN NEW;
  END IF;

  PERFORM public.bank_post(NEW.user_id, v_bonus, 'classic_run_bonus', NEW.id::text,
    jsonb_build_object('run_id', NEW.id, 'verified_value', NEW.verified_value));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bank_credit_run_bonus() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bank_credit_run_bonus_trg ON public.user_leaderboard_runs;
CREATE TRIGGER bank_credit_run_bonus_trg
  AFTER INSERT ON public.user_leaderboard_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.bank_credit_run_bonus();

-- ---------------------------------------------------------------------------
-- Integrity check (admin / SQL Editor only): rows where cache ≠ ledger sum
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bank_audit_balances()
RETURNS TABLE (user_id uuid, cached bigint, ledger_sum bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT a.user_id, a.balance, coalesce(sum(l.amount), 0)::bigint
  FROM public.bank_accounts a
  LEFT JOIN public.bank_ledger l ON l.user_id = a.user_id
  GROUP BY a.user_id, a.balance
  HAVING a.balance <> coalesce(sum(l.amount), 0);
$$;

REVOKE ALL ON FUNCTION public.bank_audit_balances() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: pay every achievement already synced, once, at current tier amounts.
-- Re-running is a no-op (unique source keys).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.user_id, a.id AS achievement_id
    FROM public.user_achievement_progress p
    CROSS JOIN LATERAL (SELECT DISTINCT unnest(p.completed_ids) AS id) a
    WHERE public.achievement_cash_reward(a.id) > 0
  LOOP
    PERFORM public.bank_post(r.user_id, public.achievement_cash_reward(r.achievement_id),
      'achievement', r.achievement_id,
      jsonb_build_object('achievement_id', r.achievement_id, 'backfill', true));
  END LOOP;
END;
$$;


-- ============================================================================
-- 20261017_2_bank_leaderboard.sql
-- ============================================================================
-- Bank leaderboard RPCs. Requires 20261017_1_bank_ledger.sql.
-- Ranks permanent accounts by current Bank balance (bank_accounts, ledger-backed).
-- Exposes username + balance only. Apply manually in the Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Top N (default 100, max 200). Ties: alphabetical by username.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_bank_leaderboard_top(p_limit integer DEFAULT 100)
RETURNS TABLE (
  rank bigint,
  username text,
  bank_total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    row_number() OVER (ORDER BY a.balance DESC, p.username_normalized ASC) AS rank,
    p.username,
    a.balance AS bank_total
  FROM public.bank_accounts a
  INNER JOIN public.profiles p ON p.user_id = a.user_id
  WHERE a.balance > 0
  ORDER BY a.balance DESC, p.username_normalized ASC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 100), 200));
$$;

REVOKE ALL ON FUNCTION public.get_bank_leaderboard_top(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bank_leaderboard_top(integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signed-in player's rank (empty for guests, anonymous users, or a $0 Bank)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_bank_leaderboard_rank()
RETURNS TABLE (
  rank bigint,
  username text,
  bank_total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance bigint;
  v_username text;
  v_normalized text;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RETURN;
  END IF;

  SELECT a.balance, p.username, p.username_normalized
  INTO v_balance, v_username, v_normalized
  FROM public.bank_accounts a
  INNER JOIN public.profiles p ON p.user_id = a.user_id
  WHERE a.user_id = v_uid AND a.balance > 0;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT 1 + count(*)::bigint INTO rank
  FROM public.bank_accounts o
  INNER JOIN public.profiles op ON op.user_id = o.user_id
  WHERE o.balance > 0
    AND (
      o.balance > v_balance
      OR (o.balance = v_balance AND op.username_normalized < v_normalized)
    );

  username := v_username;
  bank_total := v_balance;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_bank_leaderboard_rank() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_bank_leaderboard_rank() TO authenticated;

-- ---------------------------------------------------------------------------
-- Signed-in player's authoritative balance (0 when no account row yet)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_bank_balance()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce(
    (SELECT a.balance FROM public.bank_accounts a WHERE a.user_id = auth.uid()),
    0
  )::bigint;
$$;

REVOKE ALL ON FUNCTION public.get_my_bank_balance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_bank_balance() TO authenticated;


-- ============================================================================
-- 20261017_3_cash_table.sql
-- ============================================================================
-- Cash Table: bet on your next Classic run. Requires 20261017_1_bank_ledger.sql.
--
-- Offer (fixed server-side; the client cannot change terms)
--   Stake $100,000 · finish over $900,000,000 · prize $250,000
--
-- Flow
--   place_cash_table_wager()  debits the stake through bank_post() and opens one wager.
--   The next server-verified run (user_leaderboard_runs insert) settles it:
--     verified_value > target  → status 'won', prize credited
--     otherwise                → status 'lost'
--   A wager cannot be cancelled once placed (prevents backing out of a bad run).
--
-- Trust note: verified runs prove the lineup's value, not that it came from real spins.
-- Settlement shares that limitation until Classic runs are server-issued.
--
-- All Cash is fictional in-game currency. Apply manually in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.cash_table_wagers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  stake bigint NOT NULL CHECK (stake > 0),
  target bigint NOT NULL CHECK (target > 0),
  payout bigint NOT NULL CHECK (payout > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  run_id uuid REFERENCES public.user_leaderboard_runs (id) ON DELETE SET NULL,
  settled_value bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

-- One open wager per player.
CREATE UNIQUE INDEX IF NOT EXISTS cash_table_wagers_one_open_uidx
  ON public.cash_table_wagers (user_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS cash_table_wagers_user_created_idx
  ON public.cash_table_wagers (user_id, created_at DESC);

ALTER TABLE public.cash_table_wagers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_table_wagers_select_own ON public.cash_table_wagers;
CREATE POLICY cash_table_wagers_select_own
  ON public.cash_table_wagers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.cash_table_wagers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cash_table_wagers TO authenticated;

-- ---------------------------------------------------------------------------
-- Place the standard wager. Idempotent: returns the open wager if one exists.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_cash_table_wager()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_stake constant bigint := 100000;
  v_target constant bigint := 900000000;
  v_payout constant bigint := 250000;
  v_wager uuid;
  v_balance bigint;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = v_uid) THEN
    RAISE EXCEPTION 'profile_required' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_wager
  FROM public.cash_table_wagers
  WHERE user_id = v_uid AND status = 'open';

  IF v_wager IS NULL THEN
    INSERT INTO public.cash_table_wagers (user_id, stake, target, payout)
    VALUES (v_uid, v_stake, v_target, v_payout)
    RETURNING id INTO v_wager;

    -- Raises insufficient_funds (rolling back the wager) when the Bank is short.
    PERFORM public.bank_post(v_uid, -v_stake, 'cash_table_wager', v_wager::text,
      jsonb_build_object('wager_id', v_wager, 'target', v_target, 'payout', v_payout));
  END IF;

  SELECT balance INTO v_balance FROM public.bank_accounts WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'wager_id', v_wager,
    'stake', v_stake,
    'target', v_target,
    'payout', v_payout,
    'balance', coalesce(v_balance, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_cash_table_wager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_cash_table_wager() TO authenticated;

-- ---------------------------------------------------------------------------
-- Current open wager (empty when none)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_cash_table_wager()
RETURNS TABLE (
  wager_id uuid,
  stake bigint,
  target bigint,
  payout bigint,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT w.id, w.stake, w.target, w.payout, w.created_at
  FROM public.cash_table_wagers w
  WHERE w.user_id = auth.uid() AND w.status = 'open';
$$;

REVOKE ALL ON FUNCTION public.get_my_cash_table_wager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_cash_table_wager() TO authenticated;

-- ---------------------------------------------------------------------------
-- Settle on the next verified Classic run
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cash_table_settle_on_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  w public.cash_table_wagers%ROWTYPE;
BEGIN
  SELECT * INTO w
  FROM public.cash_table_wagers
  WHERE user_id = NEW.user_id
    AND status = 'open'
    AND created_at <= NEW.achieved_at
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.verified_value > w.target THEN
    UPDATE public.cash_table_wagers
    SET status = 'won', run_id = NEW.id, settled_value = NEW.verified_value, settled_at = now()
    WHERE id = w.id;
    PERFORM public.bank_post(NEW.user_id, w.payout, 'cash_table_payout', w.id::text,
      jsonb_build_object('wager_id', w.id, 'run_id', NEW.id, 'verified_value', NEW.verified_value));
  ELSE
    UPDATE public.cash_table_wagers
    SET status = 'lost', run_id = NEW.id, settled_value = NEW.verified_value, settled_at = now()
    WHERE id = w.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.cash_table_settle_on_run() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cash_table_settle_on_run_trg ON public.user_leaderboard_runs;
CREATE TRIGGER cash_table_settle_on_run_trg
  AFTER INSERT ON public.user_leaderboard_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.cash_table_settle_on_run();


-- ============================================================================
-- 20261018_1_surplus_spin.sql
-- ============================================================================
-- Surplus Spin: after a verified Classic run over $1,000,000,000 the player chooses once
--   BANK IT  → credit the full surplus (verified_value − $1B)
--   RISK IT  → server rolls a weighted multiplier; credit floor(surplus × multiplier)
-- Only the run's surplus is at stake; existing Bank money is never debited.
--
-- Requires 20261017_1_bank_ledger.sql. Replaces the automatic run bonus: the old
-- bank_credit_run_bonus trigger is removed so the surplus is paid only by a decision.
-- (If 20261017_4_run_bonus_on.sql was applied, runs it already paid show as "banked".)
--
-- Integrity
--   * Surplus comes from user_leaderboard_runs.verified_value (server-priced), never the client.
--   * One decision row per run (PK) — retries, double taps and second devices return the
--     stored result. The payout posts through bank_post() keyed by run ID ('classic_run_bonus').
--   * Randomness: gen_random_uuid() (cryptographically random) → uniform 32-bit roll.
--   * Odds live in surplus_spin_odds (mirrored for guests in lib/tradeup/surplusSpin.ts).
--   * Only runs on/after the Bank launch (Oct 17, 2026 Pacific) qualify.
--
-- Trust note: verified runs prove a lineup's value, not that it was drafted from real
-- spins. Until runs are server-issued, a forged lineup can still qualify.
--
-- All Cash is fictional in-game currency. No purchase, no cash-out.
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Retire the automatic run bonus
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS bank_credit_run_bonus_trg ON public.user_leaderboard_runs;

UPDATE public.bank_settings
SET run_bonus_enabled = false,
    updated_at = now()
WHERE id;

-- ---------------------------------------------------------------------------
-- Odds (weights out of 10,000). Expected multiplier 0.945×.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.surplus_spin_odds (
  multiplier_tenths smallint PRIMARY KEY CHECK (multiplier_tenths BETWEEN 0 AND 100),
  weight integer NOT NULL CHECK (weight >= 0)
);

INSERT INTO public.surplus_spin_odds (multiplier_tenths, weight) VALUES
  (0, 3500),
  (5, 2300),
  (10, 2000),
  (20, 1300),
  (30, 450),
  (40, 200),
  (50, 110),
  (60, 60),
  (70, 35),
  (80, 20),
  (90, 15),
  (100, 10)
ON CONFLICT (multiplier_tenths) DO UPDATE SET weight = EXCLUDED.weight;

ALTER TABLE public.surplus_spin_odds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS surplus_spin_odds_read ON public.surplus_spin_odds;
CREATE POLICY surplus_spin_odds_read
  ON public.surplus_spin_odds
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.surplus_spin_odds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.surplus_spin_odds TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Decisions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.surplus_decisions (
  run_id uuid PRIMARY KEY REFERENCES public.user_leaderboard_runs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  surplus bigint NOT NULL CHECK (surplus > 0),
  choice text NOT NULL CHECK (choice IN ('bank', 'spin')),
  multiplier_tenths smallint NOT NULL CHECK (multiplier_tenths BETWEEN 0 AND 100),
  payout bigint NOT NULL CHECK (payout >= 0),
  roll bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS surplus_decisions_user_idx
  ON public.surplus_decisions (user_id, created_at DESC);

ALTER TABLE public.surplus_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS surplus_decisions_select_own ON public.surplus_decisions;
CREATE POLICY surplus_decisions_select_own
  ON public.surplus_decisions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.surplus_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.surplus_decisions TO authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.surplus_launch_at()
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$ SELECT timestamptz '2026-10-17 00:00:00 America/Los_Angeles' $$;

-- Shape returned to the client for one run.
CREATE OR REPLACE FUNCTION public.surplus_state(p_run public.user_leaderboard_runs)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_surplus bigint := p_run.verified_value - 1000000000;
  d public.surplus_decisions%ROWTYPE;
  v_legacy bigint;
BEGIN
  IF v_surplus <= 0 OR p_run.achieved_at < public.surplus_launch_at() THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  SELECT * INTO d FROM public.surplus_decisions WHERE run_id = p_run.id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'resolved',
      'client_run_id', p_run.client_run_id,
      'run_value', p_run.verified_value,
      'surplus', d.surplus,
      'choice', d.choice,
      'multiplier_tenths', d.multiplier_tenths,
      'payout', d.payout
    );
  END IF;

  -- Paid by the retired automatic bonus → treat as banked.
  SELECT amount INTO v_legacy
  FROM public.bank_ledger
  WHERE user_id = p_run.user_id AND kind = 'classic_run_bonus' AND source_ref = p_run.id::text;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'resolved',
      'client_run_id', p_run.client_run_id,
      'run_value', p_run.verified_value,
      'surplus', v_surplus,
      'choice', 'bank',
      'multiplier_tenths', 10,
      'payout', v_legacy
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'pending',
    'client_run_id', p_run.client_run_id,
    'run_value', p_run.verified_value,
    'surplus', v_surplus
  );
END;
$$;

REVOKE ALL ON FUNCTION public.surplus_state(public.user_leaderboard_runs) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

-- State for a run submitted with p_client_run_id: none | pending | resolved.
CREATE OR REPLACE FUNCTION public.get_surplus_decision(p_client_run_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  r public.user_leaderboard_runs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  SELECT * INTO r
  FROM public.user_leaderboard_runs
  WHERE user_id = auth.uid() AND client_run_id = p_client_run_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  RETURN public.surplus_state(r);
END;
$$;

REVOKE ALL ON FUNCTION public.get_surplus_decision(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_surplus_decision(text) TO authenticated;

-- Most recent undecided qualifying run (interrupted results screen), or status none.
CREATE OR REPLACE FUNCTION public.get_pending_surplus()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  r public.user_leaderboard_runs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  SELECT lr.* INTO r
  FROM public.user_leaderboard_runs lr
  WHERE lr.user_id = auth.uid()
    AND lr.verified_value > 1000000000
    AND lr.achieved_at >= public.surplus_launch_at()
    AND lr.client_run_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.surplus_decisions d WHERE d.run_id = lr.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.bank_ledger l
      WHERE l.user_id = lr.user_id AND l.kind = 'classic_run_bonus' AND l.source_ref = lr.id::text
    )
  ORDER BY lr.achieved_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  RETURN public.surplus_state(r);
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_surplus() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_surplus() TO authenticated;

-- Settle the decision once. Repeat calls return the stored result without paying again.
CREATE OR REPLACE FUNCTION public.resolve_surplus(p_client_run_id text, p_choice text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r public.user_leaderboard_runs%ROWTYPE;
  v_state jsonb;
  v_surplus bigint;
  v_total bigint;
  v_roll bigint;
  v_pick bigint;
  v_tenths smallint := 10;
  v_payout bigint;
  o record;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  IF p_choice NOT IN ('bank', 'spin') THEN
    RAISE EXCEPTION 'invalid_choice' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r
  FROM public.user_leaderboard_runs
  WHERE user_id = v_uid AND client_run_id = p_client_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_state := public.surplus_state(r);
  IF v_state ->> 'status' <> 'pending' THEN
    RETURN v_state;
  END IF;

  v_surplus := (v_state ->> 'surplus')::bigint;

  IF p_choice = 'spin' THEN
    SELECT sum(weight) INTO v_total FROM public.surplus_spin_odds WHERE weight > 0;
    IF coalesce(v_total, 0) <= 0 THEN
      RAISE EXCEPTION 'odds_unavailable' USING ERRCODE = 'P0001';
    END IF;
    v_roll := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint;
    v_pick := v_roll % v_total;
    FOR o IN
      SELECT multiplier_tenths, weight FROM public.surplus_spin_odds
      WHERE weight > 0 ORDER BY multiplier_tenths
    LOOP
      IF v_pick < o.weight THEN
        v_tenths := o.multiplier_tenths;
        EXIT;
      END IF;
      v_pick := v_pick - o.weight;
    END LOOP;
  END IF;

  v_payout := (v_surplus * v_tenths) / 10;

  INSERT INTO public.surplus_decisions (run_id, user_id, surplus, choice, multiplier_tenths, payout, roll)
  VALUES (r.id, v_uid, v_surplus, p_choice, v_tenths, v_payout, v_roll)
  ON CONFLICT (run_id) DO NOTHING;

  IF v_payout > 0 THEN
    PERFORM public.bank_post(v_uid, v_payout, 'classic_run_bonus', r.id::text,
      jsonb_build_object('run_id', r.id, 'choice', p_choice, 'multiplier_tenths', v_tenths,
        'surplus', v_surplus));
  END IF;

  RETURN public.surplus_state(r);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_surplus(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_surplus(text, text) TO authenticated;


-- ============================================================================
-- 20261018_2_wall_of_fame.sql
-- ============================================================================
-- Wall of Fame: permanent recognition the first time a player's server Bank reaches
-- $1,000,000,000. Spending afterwards never removes the entry. One row per player.
-- Requires 20261017_1_bank_ledger.sql. Apply manually in the Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.wall_of_fame (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  inducted_at timestamptz NOT NULL DEFAULT now(),
  balance_at_induction bigint NOT NULL CHECK (balance_at_induction >= 1000000000)
);

CREATE INDEX IF NOT EXISTS wall_of_fame_inducted_idx ON public.wall_of_fame (inducted_at);

ALTER TABLE public.wall_of_fame ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wall_of_fame FROM PUBLIC, anon, authenticated;

-- Induct on any balance change that crosses the goal.
CREATE OR REPLACE FUNCTION public.wall_of_fame_induct()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NEW.balance >= 1000000000 THEN
    INSERT INTO public.wall_of_fame (user_id, balance_at_induction)
    VALUES (NEW.user_id, NEW.balance)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.wall_of_fame_induct() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wall_of_fame_induct_trg ON public.bank_accounts;
CREATE TRIGGER wall_of_fame_induct_trg
  AFTER INSERT OR UPDATE OF balance ON public.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.wall_of_fame_induct();

-- Backfill anyone already at the goal.
INSERT INTO public.wall_of_fame (user_id, balance_at_induction)
SELECT user_id, balance FROM public.bank_accounts WHERE balance >= 1000000000
ON CONFLICT (user_id) DO NOTHING;

-- Public list: username + induction date only, oldest first.
CREATE OR REPLACE FUNCTION public.get_wall_of_fame(p_limit integer DEFAULT 500)
RETURNS TABLE (username text, inducted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT p.username, w.inducted_at
  FROM public.wall_of_fame w
  INNER JOIN public.profiles p ON p.user_id = w.user_id
  ORDER BY w.inducted_at ASC, p.username_normalized ASC
  LIMIT greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

REVOKE ALL ON FUNCTION public.get_wall_of_fame(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_wall_of_fame(integer) TO anon, authenticated;

-- Caller's own induction (null when not inducted).
CREATE OR REPLACE FUNCTION public.get_my_wall_of_fame()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT inducted_at FROM public.wall_of_fame WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_wall_of_fame() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_wall_of_fame() TO authenticated;


-- ============================================================================
-- 20261018_3_the_circuit.sql
-- ============================================================================
-- The Circuit: Cash Leagues paid with virtual Bank money. Requires 20261017_1_bank_ledger.sql.
--
-- Formats (rolling windows, created on demand)
--   open_run     $500,000 entry   · Classic rules           · 24h
--   no_reroll    $500,000 entry   · team + era rerolls off  · 24h
--   high_stakes  $5,000,000 entry · Classic rules           · 72h
--
-- Flow
--   enter_circuit(competition)     one entry per player; fee posted through bank_post()
--                                  ('league_entry', keyed by competition) — no double charge.
--   start_circuit_run(competition) issues the entry's attempt id (stable until a run lands).
--   The Classic run is submitted with that id as client_run_id; a trigger on
--   user_leaderboard_runs records the server-priced value as the official entry (once).
--   get_circuit()                  current competitions, live standings, my entries; settles
--                                  any competition past its deadline.
--
-- Prize pool = every entry fee in the competition (zero-sum: no Cash is created).
--   Paid to submitted runs by team value (ties: earliest run):
--   3+ runs: 50/30/20 · 2 runs: 70/30 · 1 run: 100%. Remainder dollars go to 1st.
--   No submitted runs: every fee is refunded ('league_refund').
--
-- Trust note: verified runs prove a lineup's value, not that it came from real spins or
-- that rerolls were skipped (No Reroll is enforced in the client). Server-issued runs
-- would close this.
--
-- All Cash is fictional in-game currency. Apply manually in the Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.circuit_formats (
  key text PRIMARY KEY CHECK (key IN ('open_run', 'no_reroll', 'high_stakes')),
  name text NOT NULL,
  entry_fee bigint NOT NULL CHECK (entry_fee > 0),
  rerolls_allowed boolean NOT NULL,
  duration interval NOT NULL CHECK (duration >= interval '1 hour'),
  sort smallint NOT NULL
);

INSERT INTO public.circuit_formats (key, name, entry_fee, rerolls_allowed, duration, sort) VALUES
  ('open_run', 'Open Run', 500000, true, interval '24 hours', 1),
  ('no_reroll', 'No Reroll', 500000, false, interval '24 hours', 2),
  ('high_stakes', 'High Stakes', 5000000, true, interval '72 hours', 3)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    entry_fee = EXCLUDED.entry_fee,
    rerolls_allowed = EXCLUDED.rerolls_allowed,
    duration = EXCLUDED.duration,
    sort = EXCLUDED.sort;

CREATE TABLE IF NOT EXISTS public.circuit_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  format text NOT NULL REFERENCES public.circuit_formats (key),
  entry_fee bigint NOT NULL CHECK (entry_fee > 0),
  rerolls_allowed boolean NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  settled_at timestamptz,
  UNIQUE (format, starts_at)
);

CREATE INDEX IF NOT EXISTS circuit_competitions_due_idx
  ON public.circuit_competitions (status, ends_at);

CREATE TABLE IF NOT EXISTS public.circuit_entries (
  competition_id uuid NOT NULL REFERENCES public.circuit_competitions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  entry_fee bigint NOT NULL CHECK (entry_fee > 0),
  entered_at timestamptz NOT NULL DEFAULT now(),
  attempt_id text UNIQUE,
  attempt_started_at timestamptz,
  run_id uuid REFERENCES public.user_leaderboard_runs (id) ON DELETE SET NULL,
  run_value bigint,
  submitted_at timestamptz,
  final_rank integer,
  payout bigint NOT NULL DEFAULT 0 CHECK (payout >= 0),
  PRIMARY KEY (competition_id, user_id)
);

CREATE INDEX IF NOT EXISTS circuit_entries_user_idx ON public.circuit_entries (user_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS circuit_entries_rank_idx
  ON public.circuit_entries (competition_id, run_value DESC, submitted_at ASC);

ALTER TABLE public.circuit_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circuit_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circuit_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.circuit_formats, public.circuit_competitions, public.circuit_entries
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internals
-- ---------------------------------------------------------------------------

-- Current window for a format (created on first read). Windows align to the epoch.
CREATE OR REPLACE FUNCTION public.circuit_current(p_format text)
RETURNS public.circuit_competitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  f public.circuit_formats%ROWTYPE;
  v_secs bigint;
  v_start timestamptz;
  c public.circuit_competitions%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.circuit_formats WHERE key = p_format;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_format' USING ERRCODE = '22023';
  END IF;
  v_secs := extract(epoch FROM f.duration)::bigint;
  v_start := to_timestamp((floor(extract(epoch FROM now()) / v_secs) * v_secs)::double precision);

  INSERT INTO public.circuit_competitions (format, entry_fee, rerolls_allowed, starts_at, ends_at)
  VALUES (f.key, f.entry_fee, f.rerolls_allowed, v_start, v_start + f.duration)
  ON CONFLICT (format, starts_at) DO NOTHING;

  SELECT * INTO c FROM public.circuit_competitions WHERE format = f.key AND starts_at = v_start;
  RETURN c;
END;
$$;

-- Pays out (or refunds) one finished competition exactly once.
CREATE OR REPLACE FUNCTION public.circuit_settle(p_competition uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  c public.circuit_competitions%ROWTYPE;
  v_pool bigint;
  v_runs integer;
  v_shares integer[];
  v_paid bigint := 0;
  v_amount bigint;
  e record;
  v_rank integer := 0;
BEGIN
  SELECT * INTO c FROM public.circuit_competitions WHERE id = p_competition FOR UPDATE;
  IF NOT FOUND OR c.status = 'settled' OR c.ends_at > now() THEN
    RETURN;
  END IF;

  SELECT coalesce(sum(entry_fee), 0) INTO v_pool FROM public.circuit_entries WHERE competition_id = c.id;
  SELECT count(*) INTO v_runs FROM public.circuit_entries
  WHERE competition_id = c.id AND run_value IS NOT NULL;

  IF v_runs = 0 THEN
    FOR e IN SELECT user_id, entry_fee FROM public.circuit_entries WHERE competition_id = c.id LOOP
      PERFORM public.bank_post(e.user_id, e.entry_fee, 'league_refund', c.id::text,
        jsonb_build_object('competition_id', c.id, 'format', c.format));
      UPDATE public.circuit_entries SET payout = e.entry_fee
      WHERE competition_id = c.id AND user_id = e.user_id;
    END LOOP;
  ELSE
    v_shares := CASE
      WHEN v_runs >= 3 THEN ARRAY[50, 30, 20]
      WHEN v_runs = 2 THEN ARRAY[70, 30]
      ELSE ARRAY[100]
    END;

    FOR e IN
      SELECT user_id FROM public.circuit_entries
      WHERE competition_id = c.id AND run_value IS NOT NULL
      ORDER BY run_value DESC, submitted_at ASC, user_id
    LOOP
      v_rank := v_rank + 1;
      v_amount := 0;
      IF v_rank <= array_length(v_shares, 1) THEN
        v_amount := (v_pool * v_shares[v_rank]) / 100;
        v_paid := v_paid + v_amount;
      END IF;
      UPDATE public.circuit_entries SET final_rank = v_rank, payout = v_amount
      WHERE competition_id = c.id AND user_id = e.user_id;
    END LOOP;

    -- Integer remainder goes to first place.
    UPDATE public.circuit_entries SET payout = payout + (v_pool - v_paid)
    WHERE competition_id = c.id AND final_rank = 1;

    FOR e IN
      SELECT user_id, payout FROM public.circuit_entries
      WHERE competition_id = c.id AND payout > 0
    LOOP
      PERFORM public.bank_post(e.user_id, e.payout, 'league_payout', c.id::text,
        jsonb_build_object('competition_id', c.id, 'format', c.format));
    END LOOP;
  END IF;

  UPDATE public.circuit_competitions SET status = 'settled', settled_at = now() WHERE id = c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.circuit_settle_due()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id FROM public.circuit_competitions WHERE status = 'open' AND ends_at <= now()
  LOOP
    PERFORM public.circuit_settle(v_id);
  END LOOP;
END;
$$;

-- One competition as the client sees it.
CREATE OR REPLACE FUNCTION public.circuit_card(c public.circuit_competitions, p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  f public.circuit_formats%ROWTYPE;
  me public.circuit_entries%ROWTYPE;
  v_rank integer;
BEGIN
  SELECT * INTO f FROM public.circuit_formats WHERE key = c.format;
  IF p_uid IS NOT NULL THEN
    SELECT * INTO me FROM public.circuit_entries WHERE competition_id = c.id AND user_id = p_uid;
    IF FOUND AND me.run_value IS NOT NULL THEN
      SELECT count(*) + 1 INTO v_rank FROM public.circuit_entries o
      WHERE o.competition_id = c.id AND o.run_value IS NOT NULL
        AND (o.run_value > me.run_value
          OR (o.run_value = me.run_value AND o.submitted_at < me.submitted_at));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', c.id,
    'format', c.format,
    'name', f.name,
    'entry_fee', c.entry_fee,
    'rerolls_allowed', c.rerolls_allowed,
    'starts_at', c.starts_at,
    'ends_at', c.ends_at,
    'status', c.status,
    'participants', (SELECT count(*) FROM public.circuit_entries WHERE competition_id = c.id),
    'submitted', (SELECT count(*) FROM public.circuit_entries
                  WHERE competition_id = c.id AND run_value IS NOT NULL),
    'prize_pool', (SELECT coalesce(sum(entry_fee), 0) FROM public.circuit_entries
                   WHERE competition_id = c.id),
    'standings', coalesce((
      SELECT jsonb_agg(jsonb_build_object('username', s.username, 'run_value', s.run_value,
        'is_me', s.user_id = p_uid) ORDER BY s.run_value DESC, s.submitted_at ASC)
      FROM (
        SELECT e.user_id, e.run_value, e.submitted_at, p.username
        FROM public.circuit_entries e
        INNER JOIN public.profiles p ON p.user_id = e.user_id
        WHERE e.competition_id = c.id AND e.run_value IS NOT NULL
        ORDER BY e.run_value DESC, e.submitted_at ASC
        LIMIT 10
      ) s
    ), '[]'::jsonb),
    'me', CASE WHEN me.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'attempt_id', me.attempt_id,
      'run_value', me.run_value,
      'rank', coalesce(me.final_rank, v_rank),
      'payout', me.payout
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.circuit_current(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_settle(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_settle_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_card(public.circuit_competitions, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

-- { competitions: [...current, by format], results: [...my last settled entries] }
CREATE OR REPLACE FUNCTION public.get_circuit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  f record;
  c public.circuit_competitions%ROWTYPE;
  v_cards jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.circuit_settle_due();
  FOR f IN SELECT key FROM public.circuit_formats ORDER BY sort LOOP
    c := public.circuit_current(f.key);
    v_cards := v_cards || jsonb_build_array(public.circuit_card(c, v_uid));
  END LOOP;

  RETURN jsonb_build_object(
    'server_time', now(),
    'competitions', v_cards,
    'results', CASE WHEN v_uid IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(r ORDER BY r ->> 'ends_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'competition_id', cc.id,
          'name', cf.name,
          'ends_at', cc.ends_at,
          'rank', e.final_rank,
          'entrants', (SELECT count(*) FROM public.circuit_entries x
                       WHERE x.competition_id = cc.id AND x.run_value IS NOT NULL),
          'run_value', e.run_value,
          'entry_fee', e.entry_fee,
          'payout', e.payout
        ) AS r
        FROM public.circuit_entries e
        INNER JOIN public.circuit_competitions cc ON cc.id = e.competition_id
        INNER JOIN public.circuit_formats cf ON cf.key = cc.format
        WHERE e.user_id = v_uid AND cc.status = 'settled'
        ORDER BY cc.ends_at DESC
        LIMIT 5
      ) t
    ), '[]'::jsonb) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_circuit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_circuit() TO anon, authenticated;

-- Pay the fee and register. Repeat calls return the existing entry without charging.
CREATE OR REPLACE FUNCTION public.enter_circuit(p_competition uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  c public.circuit_competitions%ROWTYPE;
  v_rows integer := 0;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'profile_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO c FROM public.circuit_competitions WHERE id = p_competition FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'competition_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.circuit_entries WHERE competition_id = c.id AND user_id = v_uid) THEN
    -- Leave time to play the entry run.
    IF c.status <> 'open' OR now() > c.ends_at - interval '10 minutes' THEN
      RAISE EXCEPTION 'entries_closed' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.circuit_entries (competition_id, user_id, entry_fee)
    VALUES (c.id, v_uid, c.entry_fee)
    ON CONFLICT (competition_id, user_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      -- Raises insufficient_funds (rolling back the entry) when the Bank is short.
      PERFORM public.bank_post(v_uid, -c.entry_fee, 'league_entry', c.id::text,
        jsonb_build_object('competition_id', c.id, 'format', c.format));
    END IF;
  END IF;

  RETURN public.circuit_card(c, v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.enter_circuit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enter_circuit(uuid) TO authenticated;

-- Attempt id for the official entry run (stable until a run is recorded).
CREATE OR REPLACE FUNCTION public.start_circuit_run(p_competition uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  c public.circuit_competitions%ROWTYPE;
  e public.circuit_entries%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.circuit_competitions WHERE id = p_competition;
  SELECT * INTO e FROM public.circuit_entries
  WHERE competition_id = p_competition AND user_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_entered' USING ERRCODE = 'P0001';
  END IF;
  IF e.run_value IS NOT NULL THEN
    RAISE EXCEPTION 'entry_already_played' USING ERRCODE = 'P0001';
  END IF;
  IF c.status <> 'open' OR now() >= c.ends_at THEN
    RAISE EXCEPTION 'competition_closed' USING ERRCODE = 'P0001';
  END IF;

  IF e.attempt_id IS NULL THEN
    UPDATE public.circuit_entries
    SET attempt_id = 'circuit_' || replace(gen_random_uuid()::text, '-', ''),
        attempt_started_at = now()
    WHERE competition_id = p_competition AND user_id = v_uid
    RETURNING * INTO e;
  END IF;

  RETURN jsonb_build_object(
    'attempt_id', e.attempt_id,
    'competition_id', c.id,
    'format', c.format,
    'rerolls_allowed', c.rerolls_allowed,
    'ends_at', c.ends_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_circuit_run(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_circuit_run(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Record the official entry when its verified run lands (once, before the deadline)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.circuit_record_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_comp uuid;
BEGIN
  IF NEW.client_run_id IS NULL OR NEW.client_run_id NOT LIKE 'circuit\_%' THEN
    RETURN NEW;
  END IF;
  SELECT competition_id INTO v_comp FROM public.circuit_entries
  WHERE attempt_id = NEW.client_run_id AND user_id = NEW.user_id;
  IF v_comp IS NULL THEN
    RETURN NEW;
  END IF;
  -- Serialize with circuit_settle (which holds FOR UPDATE on the competition).
  PERFORM 1 FROM public.circuit_competitions WHERE id = v_comp FOR SHARE;
  UPDATE public.circuit_entries e
  SET run_id = NEW.id,
      run_value = NEW.verified_value,
      submitted_at = NEW.achieved_at
  FROM public.circuit_competitions c
  WHERE e.attempt_id = NEW.client_run_id
    AND e.user_id = NEW.user_id
    AND e.run_value IS NULL
    AND c.id = e.competition_id
    AND c.status = 'open'
    AND NEW.achieved_at <= c.ends_at;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.circuit_record_run() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS circuit_record_run_trg ON public.user_leaderboard_runs;
CREATE TRIGGER circuit_record_run_trg
  AFTER INSERT ON public.user_leaderboard_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.circuit_record_run();


-- ============================================================================
-- 20261018_4_circuit_results.sql
-- ============================================================================
-- The Circuit — rankings, results and prizes. Requires 20261018_3_the_circuit.sql.
--
-- Rankings
--   Verified team value DESC → earliest submission → user id (stable, no ties).
--   One run per entry; a run can count for one entry only (unique run_id); the run must
--   land after the player entered and before the deadline.
--
-- Prizes (funded only by entry fees — no Cash is created)
--   Minimum 3 submitted runs. Pool split 1st 50% · 2nd 30% · 3rd 20%; remainder dollars to 1st.
--   Fewer than 3 runs at the deadline → competition cancelled, every entry fee refunded.
--   An operator can cancel early with circuit_cancel() (refunds everyone).
--   All credits post through bank_post() keyed by competition, so nothing pays twice.
--
-- Finalization
--   circuit_settle_due() runs every minute via pg_cron (scheduled below when available),
--   and also on every get_circuit() read as a fallback.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Schema upgrades
-- ---------------------------------------------------------------------------

ALTER TABLE public.circuit_formats
  ADD COLUMN IF NOT EXISTS min_runs smallint NOT NULL DEFAULT 3 CHECK (min_runs >= 1);

ALTER TABLE public.circuit_competitions
  ADD COLUMN IF NOT EXISTS min_runs smallint NOT NULL DEFAULT 3 CHECK (min_runs >= 1),
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.circuit_competitions DROP CONSTRAINT IF EXISTS circuit_competitions_status_check;
ALTER TABLE public.circuit_competitions
  ADD CONSTRAINT circuit_competitions_status_check CHECK (status IN ('open', 'settled', 'cancelled'));

-- A verified run can be the official entry for one competition only.
CREATE UNIQUE INDEX IF NOT EXISTS circuit_entries_run_uidx
  ON public.circuit_entries (run_id) WHERE run_id IS NOT NULL;

DROP INDEX IF EXISTS public.circuit_entries_rank_idx;
CREATE INDEX IF NOT EXISTS circuit_entries_rank_idx
  ON public.circuit_entries (competition_id, run_value DESC, submitted_at ASC, user_id ASC);

-- ---------------------------------------------------------------------------
-- Prize math (single source for cards, standings and settlement)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.circuit_prizes(p_pool bigint)
RETURNS bigint[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    p_pool - (p_pool * 30) / 100 - (p_pool * 20) / 100,
    (p_pool * 30) / 100,
    (p_pool * 20) / 100
  ]::bigint[];
$$;

-- ---------------------------------------------------------------------------
-- Creation now carries the format's minimum
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.circuit_current(p_format text)
RETURNS public.circuit_competitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  f public.circuit_formats%ROWTYPE;
  v_secs bigint;
  v_start timestamptz;
  c public.circuit_competitions%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.circuit_formats WHERE key = p_format;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_format' USING ERRCODE = '22023';
  END IF;
  v_secs := extract(epoch FROM f.duration)::bigint;
  v_start := to_timestamp((floor(extract(epoch FROM now()) / v_secs) * v_secs)::double precision);

  INSERT INTO public.circuit_competitions (format, entry_fee, rerolls_allowed, starts_at, ends_at, min_runs)
  VALUES (f.key, f.entry_fee, f.rerolls_allowed, v_start, v_start + f.duration, f.min_runs)
  ON CONFLICT (format, starts_at) DO NOTHING;

  SELECT * INTO c FROM public.circuit_competitions WHERE format = f.key AND starts_at = v_start;
  RETURN c;
END;
$$;

-- ---------------------------------------------------------------------------
-- Refunds, cancellation, settlement
-- ---------------------------------------------------------------------------

-- Caller must hold the competition row lock.
CREATE OR REPLACE FUNCTION public.circuit_refund_all(p_competition uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  e record;
BEGIN
  FOR e IN SELECT user_id, entry_fee FROM public.circuit_entries WHERE competition_id = p_competition LOOP
    PERFORM public.bank_post(e.user_id, e.entry_fee, 'league_refund', p_competition::text,
      jsonb_build_object('competition_id', p_competition, 'reason', p_reason));
    UPDATE public.circuit_entries SET payout = e.entry_fee, final_rank = NULL
    WHERE competition_id = p_competition AND user_id = e.user_id;
  END LOOP;
  UPDATE public.circuit_competitions
  SET status = 'cancelled', cancel_reason = p_reason, settled_at = now()
  WHERE id = p_competition;
END;
$$;

-- Operator-only early cancellation (SQL Editor / service role). Refunds everyone once.
CREATE OR REPLACE FUNCTION public.circuit_cancel(p_competition uuid, p_reason text DEFAULT 'cancelled')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  c public.circuit_competitions%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.circuit_competitions WHERE id = p_competition FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' THEN
    RETURN;
  END IF;
  PERFORM public.circuit_refund_all(c.id, coalesce(nullif(trim(p_reason), ''), 'cancelled'));
END;
$$;

CREATE OR REPLACE FUNCTION public.circuit_settle(p_competition uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  c public.circuit_competitions%ROWTYPE;
  v_pool bigint;
  v_runs integer;
  v_prizes bigint[];
  v_rank integer := 0;
  e record;
BEGIN
  SELECT * INTO c FROM public.circuit_competitions WHERE id = p_competition FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' OR c.ends_at > now() THEN
    RETURN;
  END IF;

  SELECT coalesce(sum(entry_fee), 0) INTO v_pool FROM public.circuit_entries WHERE competition_id = c.id;
  SELECT count(*) INTO v_runs FROM public.circuit_entries
  WHERE competition_id = c.id AND run_value IS NOT NULL;

  IF v_runs < c.min_runs THEN
    PERFORM public.circuit_refund_all(c.id, 'not_enough_runs');
    RETURN;
  END IF;

  v_prizes := public.circuit_prizes(v_pool);

  FOR e IN
    SELECT user_id FROM public.circuit_entries
    WHERE competition_id = c.id AND run_value IS NOT NULL
    ORDER BY run_value DESC, submitted_at ASC, user_id ASC
  LOOP
    v_rank := v_rank + 1;
    UPDATE public.circuit_entries
    SET final_rank = v_rank,
        payout = CASE WHEN v_rank <= 3 THEN v_prizes[v_rank] ELSE 0 END
    WHERE competition_id = c.id AND user_id = e.user_id;
  END LOOP;

  FOR e IN
    SELECT user_id, payout FROM public.circuit_entries
    WHERE competition_id = c.id AND payout > 0
  LOOP
    PERFORM public.bank_post(e.user_id, e.payout, 'league_payout', c.id::text,
      jsonb_build_object('competition_id', c.id, 'format', c.format));
  END LOOP;

  UPDATE public.circuit_competitions SET status = 'settled', settled_at = now() WHERE id = c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.circuit_refund_all(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_cancel(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_settle(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_prizes(bigint) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Live rank (same order as settlement)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.circuit_live_rank(p_competition uuid, p_uid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT r.rank::integer FROM (
    SELECT user_id, row_number() OVER (ORDER BY run_value DESC, submitted_at ASC, user_id ASC) AS rank
    FROM public.circuit_entries
    WHERE competition_id = p_competition AND run_value IS NOT NULL
  ) r
  WHERE r.user_id = p_uid;
$$;

REVOKE ALL ON FUNCTION public.circuit_live_rank(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Card JSON: adds status, minimum, prize amounts; standings use the shared order.
CREATE OR REPLACE FUNCTION public.circuit_card(c public.circuit_competitions, p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  f public.circuit_formats%ROWTYPE;
  me public.circuit_entries%ROWTYPE;
  v_pool bigint;
BEGIN
  SELECT * INTO f FROM public.circuit_formats WHERE key = c.format;
  SELECT coalesce(sum(entry_fee), 0) INTO v_pool FROM public.circuit_entries WHERE competition_id = c.id;
  IF p_uid IS NOT NULL THEN
    SELECT * INTO me FROM public.circuit_entries WHERE competition_id = c.id AND user_id = p_uid;
  END IF;

  RETURN jsonb_build_object(
    'id', c.id,
    'format', c.format,
    'name', f.name,
    'entry_fee', c.entry_fee,
    'rerolls_allowed', c.rerolls_allowed,
    'starts_at', c.starts_at,
    'ends_at', c.ends_at,
    'status', c.status,
    'cancel_reason', c.cancel_reason,
    'min_runs', c.min_runs,
    'participants', (SELECT count(*) FROM public.circuit_entries WHERE competition_id = c.id),
    'submitted', (SELECT count(*) FROM public.circuit_entries
                  WHERE competition_id = c.id AND run_value IS NOT NULL),
    'prize_pool', v_pool,
    'prizes', to_jsonb(public.circuit_prizes(v_pool)),
    'standings', coalesce((
      SELECT jsonb_agg(jsonb_build_object('rank', s.rank, 'username', s.username,
        'run_value', s.run_value, 'is_me', s.user_id = p_uid) ORDER BY s.rank)
      FROM (
        SELECT e.user_id, e.run_value, p.username,
          row_number() OVER (ORDER BY e.run_value DESC, e.submitted_at ASC, e.user_id ASC) AS rank
        FROM public.circuit_entries e
        INNER JOIN public.profiles p ON p.user_id = e.user_id
        WHERE e.competition_id = c.id AND e.run_value IS NOT NULL
        ORDER BY rank
        LIMIT 10
      ) s
    ), '[]'::jsonb),
    'me', CASE WHEN me.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'attempt_id', me.attempt_id,
      'run_value', me.run_value,
      'rank', coalesce(me.final_rank, public.circuit_live_rank(c.id, p_uid)),
      'payout', me.payout
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.circuit_card(public.circuit_competitions, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

-- Full standings (top N plus the caller's own row) for a live or finished competition.
CREATE OR REPLACE FUNCTION public.get_circuit_standings(p_competition uuid, p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  c public.circuit_competitions%ROWTYPE;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
BEGIN
  SELECT * INTO c FROM public.circuit_competitions WHERE id = p_competition;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'competition_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN public.circuit_card(c, v_uid) || jsonb_build_object(
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'rank', r.rank, 'username', r.username, 'run_value', r.run_value,
        'payout', r.payout, 'is_me', r.user_id = v_uid) ORDER BY r.rank)
      FROM (
        SELECT ranked.* FROM (
          SELECT e.user_id, e.run_value, e.payout, p.username,
            row_number() OVER (ORDER BY e.run_value DESC, e.submitted_at ASC, e.user_id ASC) AS rank
          FROM public.circuit_entries e
          INNER JOIN public.profiles p ON p.user_id = e.user_id
          WHERE e.competition_id = c.id AND e.run_value IS NOT NULL
        ) ranked
        WHERE ranked.rank <= v_limit OR ranked.user_id = v_uid
      ) r
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_circuit_standings(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_circuit_standings(uuid, integer) TO anon, authenticated;

-- Current competitions + the caller's finished leagues (with podium) for results screens.
CREATE OR REPLACE FUNCTION public.get_circuit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  f record;
  c public.circuit_competitions%ROWTYPE;
  v_cards jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.circuit_settle_due();
  FOR f IN SELECT key FROM public.circuit_formats ORDER BY sort LOOP
    c := public.circuit_current(f.key);
    v_cards := v_cards || jsonb_build_array(public.circuit_card(c, v_uid));
  END LOOP;

  RETURN jsonb_build_object(
    'server_time', now(),
    'competitions', v_cards,
    'results', CASE WHEN v_uid IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(t.r ORDER BY t.ends_at DESC)
      FROM (
        SELECT cc.ends_at, jsonb_build_object(
          'competition_id', cc.id,
          'format', cc.format,
          'name', cf.name,
          'status', cc.status,
          'cancel_reason', cc.cancel_reason,
          'ends_at', cc.ends_at,
          'settled_at', cc.settled_at,
          'min_runs', cc.min_runs,
          'participants', (SELECT count(*) FROM public.circuit_entries x WHERE x.competition_id = cc.id),
          'entrants', (SELECT count(*) FROM public.circuit_entries x
                       WHERE x.competition_id = cc.id AND x.run_value IS NOT NULL),
          'prize_pool', (SELECT coalesce(sum(x.entry_fee), 0) FROM public.circuit_entries x
                         WHERE x.competition_id = cc.id),
          'rank', e.final_rank,
          'run_value', e.run_value,
          'entry_fee', e.entry_fee,
          'payout', e.payout,
          'podium', CASE WHEN cc.status = 'settled' THEN coalesce((
            SELECT jsonb_agg(jsonb_build_object('rank', w.final_rank, 'username', p.username,
              'run_value', w.run_value, 'payout', w.payout, 'is_me', w.user_id = v_uid)
              ORDER BY w.final_rank)
            FROM public.circuit_entries w
            INNER JOIN public.profiles p ON p.user_id = w.user_id
            WHERE w.competition_id = cc.id AND w.final_rank BETWEEN 1 AND 3
          ), '[]'::jsonb) ELSE '[]'::jsonb END
        ) AS r
        FROM public.circuit_entries e
        INNER JOIN public.circuit_competitions cc ON cc.id = e.competition_id
        INNER JOIN public.circuit_formats cf ON cf.key = cc.format
        WHERE e.user_id = v_uid AND cc.status IN ('settled', 'cancelled')
        ORDER BY cc.ends_at DESC
        LIMIT 8
      ) t
    ), '[]'::jsonb) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_circuit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_circuit() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Entry recording: one run per entry, after entering, before the deadline
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.circuit_record_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_comp uuid;
BEGIN
  IF NEW.client_run_id IS NULL OR NEW.client_run_id NOT LIKE 'circuit\_%' THEN
    RETURN NEW;
  END IF;
  SELECT competition_id INTO v_comp FROM public.circuit_entries
  WHERE attempt_id = NEW.client_run_id AND user_id = NEW.user_id;
  IF v_comp IS NULL THEN
    RETURN NEW;
  END IF;
  -- Serialize with settlement (FOR UPDATE on the competition).
  PERFORM 1 FROM public.circuit_competitions WHERE id = v_comp FOR SHARE;
  UPDATE public.circuit_entries e
  SET run_id = NEW.id,
      run_value = NEW.verified_value,
      submitted_at = NEW.achieved_at
  FROM public.circuit_competitions c
  WHERE e.attempt_id = NEW.client_run_id
    AND e.user_id = NEW.user_id
    AND e.run_value IS NULL
    AND e.run_id IS NULL
    AND NEW.achieved_at >= e.entered_at
    AND c.id = e.competition_id
    AND c.status = 'open'
    AND NEW.achieved_at <= c.ends_at
    AND NOT EXISTS (SELECT 1 FROM public.circuit_entries o WHERE o.run_id = NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.circuit_record_run() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Finalize on time even when nobody has the app open (pg_cron, every minute)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron unavailable (%). Enable it under Database → Extensions, then re-run this block.', SQLERRM;
    RETURN;
  END;

  BEGIN
    PERFORM cron.unschedule('circuit-settle-due');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- not scheduled yet
  END;

  PERFORM cron.schedule('circuit-settle-due', '* * * * *', 'SELECT public.circuit_settle_due();');
END;
$$;


-- ============================================================================
-- 20261018_5_wall_signature.sql
-- ============================================================================
-- Wall of Fame signatures: an inducted player stamps the name shown on the wall, once.
-- Requires 20261018_2_wall_of_fame.sql. Apply manually in the Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.wall_of_fame
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz;

ALTER TABLE public.wall_of_fame DROP CONSTRAINT IF EXISTS wall_of_fame_display_name_check;
ALTER TABLE public.wall_of_fame
  ADD CONSTRAINT wall_of_fame_display_name_check
  CHECK (display_name IS NULL OR display_name ~ '^[[:alpha:][:digit:] .''-]{2,24}$');

-- Stamp once. Repeat calls return the stored signature unchanged.
CREATE OR REPLACE FUNCTION public.stamp_wall_of_fame(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  w public.wall_of_fame%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO w FROM public.wall_of_fame WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_inducted' USING ERRCODE = 'P0001';
  END IF;

  IF w.display_name IS NULL THEN
    IF v_name !~ '^[[:alpha:][:digit:] .''-]{2,24}$' THEN
      RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
    END IF;
    UPDATE public.wall_of_fame
    SET display_name = v_name, signed_at = now()
    WHERE user_id = v_uid
    RETURNING * INTO w;
  END IF;

  RETURN jsonb_build_object(
    'display_name', w.display_name,
    'signed_at', w.signed_at,
    'inducted_at', w.inducted_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_wall_of_fame(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stamp_wall_of_fame(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_wall_signature()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object('inducted_at', inducted_at, 'display_name', display_name, 'signed_at', signed_at)
    FROM public.wall_of_fame WHERE user_id = auth.uid()
  ), '{}'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.get_my_wall_signature() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_wall_signature() TO authenticated;

-- Public list shows the stamped name (falls back to the username until stamped).
CREATE OR REPLACE FUNCTION public.get_wall_of_fame(p_limit integer DEFAULT 500)
RETURNS TABLE (username text, inducted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce(w.display_name, p.username), w.inducted_at
  FROM public.wall_of_fame w
  INNER JOIN public.profiles p ON p.user_id = w.user_id
  ORDER BY w.inducted_at ASC, p.username_normalized ASC
  LIMIT greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

REVOKE ALL ON FUNCTION public.get_wall_of_fame(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_wall_of_fame(integer) TO anon, authenticated;


-- ============================================================================
-- 20261018_6_wager_slips.sql
-- ============================================================================
-- Bet on Yourself: multi-wager slips (1–3 wagers per Classic Run). Requires
-- 20261017_1_bank_ledger.sql and 20260927_classic_seat_lookup.sql. Replaces the single fixed
-- Cash Table bet (20261017_3_cash_table.sql), which is retired below.
--
-- Flow
--   place_wager_slip(run, picks)   at the first spin: validates 1–3 distinct wagers and stakes,
--                                  debits the total stake once ('cash_table_wager', slip id).
--   settle_wager_slip(run, ...)    after that run's verified submit: judges every wager from the
--                                  server-priced lineup and credits the total return once
--                                  ('cash_table_payout', slip id). Repeat calls return the stored result.
--   A slip whose run never lands is forfeited when the player locks a new slip (or after 6 hours).
--
-- Rules mirror lib/tradeup/wagers.ts. Seat values come from classic_seat_value(); team value is
-- the run's verified_value. Trust note: draft order (Clutch Pick) and rerolls (No Rerolls) are
-- reported by the client — the server checks the fifth pick is in the lineup but cannot see spins.
--
-- All Cash is fictional in-game currency. Apply manually in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Catalog (single source on the server; keep in step with lib/tradeup/wagers.ts)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wager_catalog (
  id text PRIMARY KEY,
  multiplier_x100 integer NOT NULL CHECK (multiplier_x100 > 100),
  max_stake bigint NOT NULL CHECK (max_stake > 0)
);

INSERT INTO public.wager_catalog (id, multiplier_x100, max_stake) VALUES
  ('billion_or_bust', 2000, 2500000),
  ('star_hunter', 115, 5000000),
  ('dynamic_duo', 105, 5000000),
  ('no_rerolls', 160, 5000000),
  ('clutch_pick', 270, 5000000),
  ('superteam', 145, 5000000),
  ('triple_threat', 105, 5000000),
  ('high_roller', 4000, 1000000)
ON CONFLICT (id) DO UPDATE
SET multiplier_x100 = EXCLUDED.multiplier_x100, max_stake = EXCLUDED.max_stake;

ALTER TABLE public.wager_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wager_catalog FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Slips
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wager_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_run_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'forfeited')),
  total_stake bigint NOT NULL CHECK (total_stake > 0),
  total_return bigint NOT NULL DEFAULT 0 CHECK (total_return >= 0),
  run_id uuid REFERENCES public.user_leaderboard_runs (id) ON DELETE SET NULL,
  placed_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (user_id, client_run_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS wager_slips_one_open_uidx ON public.wager_slips (user_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.wager_slip_items (
  slip_id uuid NOT NULL REFERENCES public.wager_slips (id) ON DELETE CASCADE,
  wager_id text NOT NULL REFERENCES public.wager_catalog (id),
  stake bigint NOT NULL CHECK (stake > 0),
  multiplier_x100 integer NOT NULL,
  won boolean,
  returned bigint NOT NULL DEFAULT 0 CHECK (returned >= 0),
  PRIMARY KEY (slip_id, wager_id)
);

ALTER TABLE public.wager_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wager_slip_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wager_slips, public.wager_slip_items FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wager_wins(
  p_wager text,
  p_total bigint,
  p_values bigint[],
  p_fifth bigint,
  p_rerolls_used boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_wager
    WHEN 'billion_or_bust' THEN p_total >= 1000000000
    WHEN 'high_roller' THEN p_total >= 1010000000
    WHEN 'star_hunter' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 200000000) >= 1
    WHEN 'dynamic_duo' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 190000000) >= 2
    WHEN 'triple_threat' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 185000000) >= 3
    WHEN 'superteam' THEN cardinality(p_values) = 5
      AND (SELECT count(*) FROM unnest(p_values) v WHERE v >= 170000000) = 5
    WHEN 'clutch_pick' THEN coalesce(p_fifth, 0) >= 190000000
    WHEN 'no_rerolls' THEN NOT coalesce(p_rerolls_used, true) AND p_total >= 900000000
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.wager_wins(text, bigint, bigint[], bigint, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.wager_slip_json(p_slip uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT jsonb_build_object(
    'slip_id', s.id,
    'client_run_id', s.client_run_id,
    'status', s.status,
    'total_stake', s.total_stake,
    'total_return', s.total_return,
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', i.wager_id, 'stake', i.stake,
        'multiplier_x100', i.multiplier_x100, 'won', i.won, 'returned', i.returned) ORDER BY i.wager_id)
      FROM public.wager_slip_items i WHERE i.slip_id = s.id
    ), '[]'::jsonb)
  )
  FROM public.wager_slips s WHERE s.id = p_slip;
$$;

REVOKE ALL ON FUNCTION public.wager_slip_json(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

-- p_picks: [{ "id": "star_hunter", "stake": 500000 }, ...]
CREATE OR REPLACE FUNCTION public.place_wager_slip(p_client_run_id text, p_picks jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slip uuid;
  v_total bigint := 0;
  v_count integer;
  p record;
  c public.wager_catalog%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(length(trim(p_client_run_id)), 0) = 0 THEN
    RAISE EXCEPTION 'invalid_run' USING ERRCODE = '22023';
  END IF;

  -- Idempotent: the same run returns the slip already placed.
  SELECT id INTO v_slip FROM public.wager_slips WHERE user_id = v_uid AND client_run_id = p_client_run_id;
  IF v_slip IS NOT NULL THEN
    RETURN public.wager_slip_json(v_slip);
  END IF;

  IF jsonb_typeof(p_picks) <> 'array' THEN
    RAISE EXCEPTION 'invalid_slip' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_picks);
  IF v_count < 1 OR v_count > 3
     OR (SELECT count(DISTINCT x ->> 'id') FROM jsonb_array_elements(p_picks) x) <> v_count THEN
    RAISE EXCEPTION 'invalid_slip' USING ERRCODE = '22023';
  END IF;

  -- Any earlier slip whose run never landed is forfeited (its stake was already taken).
  UPDATE public.wager_slips SET status = 'forfeited', settled_at = now()
  WHERE user_id = v_uid AND status = 'open';

  FOR p IN SELECT x ->> 'id' AS id, (x ->> 'stake')::bigint AS stake FROM jsonb_array_elements(p_picks) x LOOP
    SELECT * INTO c FROM public.wager_catalog WHERE id = p.id;
    IF NOT FOUND OR p.stake IS NULL OR p.stake NOT IN (100000, 250000, 500000, 1000000, 2500000, 5000000)
       OR p.stake > c.max_stake THEN
      RAISE EXCEPTION 'invalid_slip' USING ERRCODE = '22023';
    END IF;
    v_total := v_total + p.stake;
  END LOOP;

  INSERT INTO public.wager_slips (user_id, client_run_id, total_stake)
  VALUES (v_uid, p_client_run_id, v_total)
  RETURNING id INTO v_slip;

  INSERT INTO public.wager_slip_items (slip_id, wager_id, stake, multiplier_x100)
  SELECT v_slip, x ->> 'id', (x ->> 'stake')::bigint, wc.multiplier_x100
  FROM jsonb_array_elements(p_picks) x
  INNER JOIN public.wager_catalog wc ON wc.id = x ->> 'id';

  -- Raises insufficient_funds (rolling everything back) when the Bank is short.
  PERFORM public.bank_post(v_uid, -v_total, 'cash_table_wager', v_slip::text,
    jsonb_build_object('slip_id', v_slip, 'client_run_id', p_client_run_id));

  RETURN public.wager_slip_json(v_slip);
END;
$$;

REVOKE ALL ON FUNCTION public.place_wager_slip(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_wager_slip(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.settle_wager_slip(
  p_client_run_id text,
  p_fifth_player_id text,
  p_rerolls_used boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  s public.wager_slips%ROWTYPE;
  r public.user_leaderboard_runs%ROWTYPE;
  v_values bigint[];
  v_fifth bigint;
  v_return bigint := 0;
  i record;
  v_won boolean;
  v_paid bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO s FROM public.wager_slips
  WHERE user_id = v_uid AND client_run_id = p_client_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  IF s.status <> 'open' THEN
    RETURN public.wager_slip_json(s.id);
  END IF;
  IF s.placed_at < now() - interval '6 hours' THEN
    UPDATE public.wager_slips SET status = 'forfeited', settled_at = now() WHERE id = s.id;
    RETURN public.wager_slip_json(s.id);
  END IF;

  SELECT * INTO r FROM public.user_leaderboard_runs
  WHERE user_id = v_uid AND client_run_id = p_client_run_id AND achieved_at >= s.placed_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT array_agg(public.classic_seat_value(seat ->> 'player_id', seat ->> 'slot'))
  INTO v_values
  FROM jsonb_array_elements(r.lineup) seat;

  SELECT public.classic_seat_value(seat ->> 'player_id', seat ->> 'slot')
  INTO v_fifth
  FROM jsonb_array_elements(r.lineup) seat
  WHERE seat ->> 'player_id' = p_fifth_player_id;

  FOR i IN SELECT * FROM public.wager_slip_items WHERE slip_id = s.id LOOP
    v_won := public.wager_wins(i.wager_id, r.verified_value, v_values, v_fifth, p_rerolls_used);
    v_paid := CASE WHEN v_won THEN (i.stake * i.multiplier_x100) / 100 ELSE 0 END;
    UPDATE public.wager_slip_items SET won = v_won, returned = v_paid
    WHERE slip_id = s.id AND wager_id = i.wager_id;
    v_return := v_return + v_paid;
  END LOOP;

  UPDATE public.wager_slips
  SET status = 'settled', total_return = v_return, run_id = r.id, settled_at = now()
  WHERE id = s.id;

  IF v_return > 0 THEN
    PERFORM public.bank_post(v_uid, v_return, 'cash_table_payout', s.id::text,
      jsonb_build_object('slip_id', s.id, 'run_id', r.id));
  END IF;

  RETURN public.wager_slip_json(s.id);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_wager_slip(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_wager_slip(text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Retire the single fixed Cash Table bet (if 20261017_3 was applied)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  w record;
BEGIN
  IF to_regclass('public.cash_table_wagers') IS NULL THEN
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS cash_table_settle_on_run_trg ON public.user_leaderboard_runs;
  ALTER TABLE public.cash_table_wagers DROP CONSTRAINT IF EXISTS cash_table_wagers_status_check;
  ALTER TABLE public.cash_table_wagers
    ADD CONSTRAINT cash_table_wagers_status_check CHECK (status IN ('open', 'won', 'lost', 'refunded'));

  -- Open old bets get their stake back once.
  FOR w IN SELECT id, user_id, stake FROM public.cash_table_wagers WHERE status = 'open' LOOP
    PERFORM public.bank_post(w.user_id, w.stake, 'cash_table_refund', w.id::text,
      jsonb_build_object('wager_id', w.id, 'reason', 'retired'));
    UPDATE public.cash_table_wagers SET status = 'refunded', settled_at = now() WHERE id = w.id;
  END LOOP;

  REVOKE EXECUTE ON FUNCTION public.place_cash_table_wager() FROM authenticated;
END;
$$;



-- =====================================================================
-- 20261018_7_achievement_payouts.sql
-- =====================================================================

-- Achievement payouts v2 (2026-10-18).
--
-- New amounts — must match lib/tradeup/bank.ts (TIER_CASH / CHALLENGE_TIER):
--   $50,000     halfway-home, closing-in, h2h-first-win
--   $100,000    near-miss-950m, all-in, league-tour, generational-wealth, h2h-statement
--   $150,000    no-second-chances, just-enough, hit-1-05b, billion-and-beyond, no-headliners,
--               double-trouble, triple-threat, back-to-back-billions, h2h-billion, h2h-three-wins
--   $250,000    hit-1b, elite-company, two-hundred-m-club, balanced-books, five-star-portfolio,
--               top-of-the-market, clutch-investment, perfect-range, three-peat, h2h-clean-sweep
--   $1,000,000  ten-billion-runs
-- Removed: five-runs-1-1b ("Consistent Elite") pays nothing from now on. Cash already paid stays.
--
-- Every achievement still pays once per player (bank_ledger unique source).
-- Players who already earned an achievement at the old amount receive the difference once,
-- so signed-in Banks match what the app shows for the same achievements.
--
-- Requires 20261017_1_bank_ledger.sql. All Cash is fictional in-game currency.
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

CREATE OR REPLACE FUNCTION public.achievement_cash_reward(p_id text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_id
    WHEN 'halfway-home' THEN 50000
    WHEN 'closing-in' THEN 50000
    WHEN 'h2h-first-win' THEN 50000

    WHEN 'near-miss-950m' THEN 100000
    WHEN 'all-in' THEN 100000
    WHEN 'league-tour' THEN 100000
    WHEN 'generational-wealth' THEN 100000
    WHEN 'h2h-statement' THEN 100000

    WHEN 'no-second-chances' THEN 150000
    WHEN 'just-enough' THEN 150000
    WHEN 'hit-1-05b' THEN 150000
    WHEN 'billion-and-beyond' THEN 150000
    WHEN 'no-headliners' THEN 150000
    WHEN 'double-trouble' THEN 150000
    WHEN 'triple-threat' THEN 150000
    WHEN 'back-to-back-billions' THEN 150000
    WHEN 'h2h-billion' THEN 150000
    WHEN 'h2h-three-wins' THEN 150000

    WHEN 'hit-1b' THEN 250000
    WHEN 'elite-company' THEN 250000
    WHEN 'two-hundred-m-club' THEN 250000
    WHEN 'balanced-books' THEN 250000
    WHEN 'five-star-portfolio' THEN 250000
    WHEN 'top-of-the-market' THEN 250000
    WHEN 'clutch-investment' THEN 250000
    WHEN 'perfect-range' THEN 250000
    WHEN 'three-peat' THEN 250000
    WHEN 'h2h-clean-sweep' THEN 250000

    WHEN 'ten-billion-runs' THEN 1000000
    ELSE 0
  END::bigint;
$$;

REVOKE ALL ON FUNCTION public.achievement_cash_reward(text) FROM PUBLIC;

-- Top up achievements paid at the old amounts. Paid-so-far counts the original credit
-- (source_ref = id) plus any earlier top-ups (source_ref = id#…).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT l.user_id,
           split_part(l.source_ref, '#', 1) AS achievement_id,
           sum(l.amount)::bigint AS paid
    FROM public.bank_ledger l
    WHERE l.kind = 'achievement'
    GROUP BY l.user_id, split_part(l.source_ref, '#', 1)
  LOOP
    IF public.achievement_cash_reward(r.achievement_id) > r.paid THEN
      PERFORM public.bank_post(
        r.user_id,
        public.achievement_cash_reward(r.achievement_id) - r.paid,
        'achievement',
        r.achievement_id || '#payouts-2026-10-18',
        jsonb_build_object('achievement_id', r.achievement_id, 'top_up', true, 'previously_paid', r.paid)
      );
    END IF;
  END LOOP;
END;
$$;
