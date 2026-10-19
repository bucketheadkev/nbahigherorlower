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
