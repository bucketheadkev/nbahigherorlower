-- Franchise v5: sell duplicate jerseys (2026-11-02). Requires 20261101_1_franchise_v5_chests.sql.
--
--   * A card can be sold when the account owns another card of the exact same player version
--     (same player, team and era) — so at least one copy always stays.
--   * Cards in the starting five are never sold.
--   * It sells for its tier's pack price (franchise_chests: pro, all_star, superstar, legend,
--     goat), paid once (ledger key = card id) and the card leaves the collection.
--
-- In-game Cash only. Apply manually in the Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.bank_ledger DROP CONSTRAINT IF EXISTS bank_ledger_kind_check;
ALTER TABLE public.bank_ledger ADD CONSTRAINT bank_ledger_kind_check CHECK (kind IN (
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
  'franchise_card_sale'
));

CREATE OR REPLACE FUNCTION public.franchise_v5_sell_duplicate(p_card uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  c public.franchise_cards%ROWTYPE;
  v_price bigint;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);
  SELECT * INTO c FROM public.franchise_cards WHERE id = p_card AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    -- Already sold (double tap) or not this player's card.
    RETURN public.franchise_v5_snapshot(v_uid) || jsonb_build_object('paid_now', 0, 'sold', 0);
  END IF;
  IF EXISTS (SELECT 1 FROM public.franchise_lineup WHERE user_id = v_uid AND card_id = c.id) THEN
    RAISE EXCEPTION 'card_in_lineup' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.franchise_cards WHERE user_id = v_uid AND player_id = c.player_id AND id <> c.id
  ) THEN
    RAISE EXCEPTION 'not_duplicate' USING ERRCODE = 'P0001';
  END IF;
  SELECT price INTO v_price FROM public.franchise_chests WHERE id = c.tier;
  IF coalesce(v_price, 0) <= 0 THEN
    RAISE EXCEPTION 'not_sellable' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.franchise_cards WHERE id = c.id;
  PERFORM public.bank_post(v_uid, v_price, 'franchise_card_sale', c.id::text,
    jsonb_build_object('player_id', c.player_id, 'tier', c.tier, 'price', v_price));

  RETURN public.franchise_v5_snapshot(v_uid) || jsonb_build_object('paid_now', 0, 'sold', v_price);
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_v5_sell_duplicate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.franchise_v5_sell_duplicate(uuid) TO authenticated;
