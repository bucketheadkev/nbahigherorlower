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
