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
