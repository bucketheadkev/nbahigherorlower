-- Admin (2026-11-23):
--   1) Clear the Wall of Fame (nobody signed / listed).
--   2) Set Bank Cash for Kevbucket and easy_pickenz to exactly $25,000,000.
--
-- Paste into the Supabase SQL Editor and run once.
-- Bank set uses a unique ledger key so re-runs after a balance change can adjust again;
-- same key won't double-apply if the balance is already at the target from this script.

-- ---------------------------------------------------------------------------
-- 1) Empty Wall of Fame
-- ---------------------------------------------------------------------------
DELETE FROM public.wall_of_fame;

-- ---------------------------------------------------------------------------
-- 2) Set balances to $25,000,000 via ledger delta
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_target bigint := 25000000;
  v_user uuid;
  v_matches integer;
  v_current bigint;
  v_delta bigint;
  v_paid boolean;
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['kevbucket', 'easy_pickenz'] LOOP
    SELECT count(*) INTO v_matches
    FROM public.profiles
    WHERE username_normalized = v_name;

    IF v_matches <> 1 THEN
      RAISE EXCEPTION 'Expected exactly one profile named %, found %', v_name, v_matches;
    END IF;

    SELECT user_id INTO v_user
    FROM public.profiles
    WHERE username_normalized = v_name;

    SELECT coalesce((SELECT balance FROM public.bank_accounts WHERE user_id = v_user), 0)
      INTO v_current;

    v_delta := v_target - v_current;

    IF v_delta = 0 THEN
      RAISE NOTICE '% (%): already at $25,000,000 — no change', v_name, v_user;
      CONTINUE;
    END IF;

    v_paid := public.bank_post(
      v_user,
      v_delta,
      'admin_adjustment',
      'admin-2026-11-23-set-25m-' || v_name,
      jsonb_build_object(
        'note', 'Set Bank to $25,000,000',
        'from_balance', v_current,
        'to_balance', v_target,
        'granted_at', now()
      )
    );

    RAISE NOTICE '% (%): % — balance now %',
      v_name,
      v_user,
      CASE
        WHEN v_paid THEN format('adjusted by %s to $25,000,000', v_delta)
        ELSE 'ledger key already used — balance unchanged by this script'
      END,
      (SELECT balance FROM public.bank_accounts WHERE user_id = v_user);
  END LOOP;
END;
$$;
