-- =============================================================================
-- ROLLBACK for 2026-11-23_coin_bank_sync_PASTE.sql
-- Paste into Supabase SQL Editor only if you need to undo that paste.
--
-- SAFETY
-- -----------------------------------------------------------------------------
-- • Does NOT delete bank_accounts, bank_ledger rows, coin balances, leaderboards,
--   wall_of_fame, or any player/game data.
-- • Drops only the three client RPCs added/replaced by the paste.
-- • Restores bank_ledger_kind_check to the pre-trivia list (classic_wins_daily).
-- • If any trivia_bonus ledger rows already exist, the constraint restore will
--   FAIL (by design) — those credits stay; either keep trivia_bonus in the CHECK
--   or leave the new constraint. Do not delete trivia rows to “force” rollback
--   unless you intentionally reverse those Bank credits.
-- =============================================================================

BEGIN;

-- Keep trivia rows intact; only restore constraint if none exist yet.
DO $$
DECLARE
  v_trivia bigint;
BEGIN
  SELECT count(*) INTO v_trivia
  FROM public.bank_ledger
  WHERE kind = 'trivia_bonus';

  ALTER TABLE public.bank_ledger DROP CONSTRAINT IF EXISTS bank_ledger_kind_check;

  IF v_trivia > 0 THEN
    -- Cannot shrink the CHECK without orphaning rows — re-add WITH trivia_bonus.
    ALTER TABLE public.bank_ledger
      ADD CONSTRAINT bank_ledger_kind_check CHECK (kind IN (
        'achievement',
        'classic_run_bonus',
        'cash_table_wager',
        'cash_table_payout',
        'cash_table_refund',
        'league_entry',
        'league_payout',
        'league_refund',
        'admin_adjustment',
        'franchise_purchase',
        'franchise_payout',
        'franchise_income',
        'franchise_sale',
        'rank_reward',
        'run_bonus',
        'franchise_chest',
        'franchise_paycheck',
        'franchise_card_sale',
        'daily_wins_payout',
        'trivia_bonus'
      ));
    RAISE NOTICE
      'Rollback: % trivia_bonus ledger row(s) exist — kept trivia_bonus in CHECK; dropped RPCs only.',
      v_trivia;
  ELSE
    ALTER TABLE public.bank_ledger
      ADD CONSTRAINT bank_ledger_kind_check CHECK (kind IN (
        'achievement',
        'classic_run_bonus',
        'cash_table_wager',
        'cash_table_payout',
        'cash_table_refund',
        'league_entry',
        'league_payout',
        'league_refund',
        'admin_adjustment',
        'franchise_purchase',
        'franchise_payout',
        'franchise_income',
        'franchise_sale',
        'rank_reward',
        'run_bonus',
        'franchise_chest',
        'franchise_paycheck',
        'franchise_card_sale',
        'daily_wins_payout'
      ));
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.post_my_trivia_bonus(text, text);
DROP FUNCTION IF EXISTS public.spend_my_coins(bigint, text);
DROP FUNCTION IF EXISTS public.credit_my_coins(bigint, text, text);

COMMIT;
