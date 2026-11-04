-- Admin grant (2026-11-02): $999,000,000,000 in-game Bank Cash to the player "eazy_pickens".
-- Run in the Supabase SQL Editor. Safe to run more than once: the ledger key
-- 'admin-2026-11-02-eazy-pickens-999b' pays only the first time (bank_post returns false after).
-- Fails loudly unless exactly one profile matches the username (any capitalization).

DO $$
DECLARE
  v_user uuid;
  v_matches integer;
  v_paid boolean;
BEGIN
  SELECT count(*) INTO v_matches FROM public.profiles WHERE username_normalized = 'eazy_pickens';
  IF v_matches <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one profile named eazy_pickens, found %', v_matches;
  END IF;
  SELECT user_id INTO v_user FROM public.profiles WHERE username_normalized = 'eazy_pickens';

  v_paid := public.bank_post(
    v_user,
    999000000000,
    'admin_adjustment',
    'admin-2026-11-02-eazy-pickens-999b',
    jsonb_build_object('note', 'Manual grant: $999,000,000,000', 'granted_at', now())
  );
  RAISE NOTICE 'eazy_pickens (%): % — balance now %', v_user,
    CASE WHEN v_paid THEN 'credited $999,000,000,000' ELSE 'already credited earlier, nothing added' END,
    (SELECT balance FROM public.bank_accounts WHERE user_id = v_user);
END;
$$;
