-- Staging / optional: disable achievement → Bank Cash payouts.
-- Challenges/achievements are retired as an active reward system.
-- Does NOT delete historical bank_ledger rows or auth users.
-- Safe to re-run. Do NOT apply to production unless explicitly approved.

-- Stop automatic credits when user_achievement_progress.completed_ids changes.
DROP TRIGGER IF EXISTS bank_credit_achievements_trg ON public.user_achievement_progress;

CREATE OR REPLACE FUNCTION public.bank_credit_achievements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  -- Retired: no Bank Cash from achievements/challenges.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bank_credit_achievements() FROM PUBLIC, anon, authenticated;

-- Defense in depth: even a re-created trigger would pay $0.
CREATE OR REPLACE FUNCTION public.achievement_cash_reward(p_id text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 0::bigint;
$$;

REVOKE ALL ON FUNCTION public.achievement_cash_reward(text) FROM PUBLIC;

-- Verify
SELECT
  to_regprocedure('public.achievement_cash_reward(text)') IS NOT NULL AS reward_fn,
  public.achievement_cash_reward('elite-company') AS elite_company_pays,
  public.achievement_cash_reward('hit-1b') AS hit_1b_pays,
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'user_achievement_progress'
      AND t.tgname = 'bank_credit_achievements_trg'
      AND NOT t.tgisinternal
  ) AS trigger_still_present;
-- expect: reward_fn true, elite_company_pays 0, hit_1b_pays 0, trigger_still_present false
