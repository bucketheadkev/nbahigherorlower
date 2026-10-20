-- One-off admin adjustment: set Eazy_Pickens' Bank to exactly $15,162,500.
-- Posts the difference through bank_post() as an 'admin_adjustment' ledger entry, so the
-- ledger and cached balance stay in sync. Safe to re-run: the same source key never posts twice.
-- In-game Cash only. Paste into the Supabase SQL Editor.

DO $$
DECLARE
  v_target constant bigint := 15162500;
  v_user uuid;
  v_balance bigint;
BEGIN
  SELECT p.user_id INTO v_user
  FROM public.profiles p
  WHERE p.username_normalized = 'eazy_pickens';

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No profile with username Eazy_Pickens';
  END IF;

  SELECT coalesce((SELECT a.balance FROM public.bank_accounts a WHERE a.user_id = v_user), 0)
  INTO v_balance;

  IF v_balance <> v_target THEN
    PERFORM public.bank_post(
      v_user,
      v_target - v_balance,
      'admin_adjustment',
      'admin-set-balance-2026-10-19',
      jsonb_build_object('reason', 'manual set to 15162500', 'previous_balance', v_balance)
    );
  END IF;
END;
$$;

SELECT p.username, a.balance
FROM public.bank_accounts a
JOIN public.profiles p ON p.user_id = a.user_id
WHERE p.username_normalized = 'eazy_pickens';
