-- One-off: grant +100,000 gold coins to username kevbucket via coin_post().
-- Requires coin_accounts / coin_post (supabase/migrations/20261122_1_coin_ledger.sql).
-- Paste into the Supabase SQL Editor after that migration. Safe to re-run:
-- the same source_ref never posts twice.
-- Does not change welcome/starting coins for any other player.

DO $$
DECLARE
  v_user uuid;
  v_before bigint;
  v_paid boolean;
BEGIN
  SELECT p.user_id INTO v_user
  FROM public.profiles p
  WHERE p.username_normalized = 'kevbucket';

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No profile with username kevbucket';
  END IF;

  SELECT coalesce((SELECT a.balance FROM public.coin_accounts a WHERE a.user_id = v_user), 0)
  INTO v_before;

  v_paid := public.coin_post(
    v_user,
    100000,
    'admin_adjustment',
    'admin-kevbucket-100k-coins-2026-11-22',
    jsonb_build_object(
      'reason', 'manual +100000 coins',
      'previous_balance', v_before,
      'username', 'kevbucket'
    )
  );

  RAISE NOTICE 'kevbucket coins before=% paid=%', v_before, v_paid;
END;
$$;

SELECT
  p.username,
  p.username_normalized,
  p.user_id,
  coalesce(a.balance, 0) AS coin_balance
FROM public.profiles p
LEFT JOIN public.coin_accounts a ON a.user_id = p.user_id
WHERE p.username_normalized = 'kevbucket';
