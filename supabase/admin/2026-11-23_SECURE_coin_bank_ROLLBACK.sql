-- SAFE FORWARD-RECOVERY / ROLLBACK companion for SECURE coin_bank REVIEW.
--
-- This script does NOT:
--   • DELETE coin/bank balances or ledger history
--   • DROP iap_transactions / iap_refund_debts / user_entitlements
--   • DROP trivia_challenges / classic_run_sessions / classic_run_actions
--   • DROP user_perk_inventory / user_perk_consumptions
--   • Re-enable credit_my_coins, spend_my_coins minting, or client-chosen spins
--
-- Prefer forward fixes on staging/production. Use this only to restore
-- non-exploitable RPC surfaces if a deploy must be walked back.
--
-- After running, re-apply coin_post/bank_post bodies from
--   2026-11-23_coin_post_bank_post_REFERENCE.sql
-- if those functions were damaged (still NO client EXECUTE).

BEGIN;

-- Keep data tables. Only replace gameplay RPCs with safe stubs where needed.

-- Legacy mint surfaces stay dropped / rejected.
CREATE OR REPLACE FUNCTION public.spend_my_coins(p_amount bigint, p_source_ref text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RAISE EXCEPTION 'use_dedicated_rpc' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.spend_my_coins(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_my_coins(bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_my_trivia_bonus(p_source_ref text, p_difficulty text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RAISE EXCEPTION 'use_trivia_answer' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.post_my_trivia_bonus(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_my_trivia_bonus(text, text) TO authenticated;

-- Client-chosen spin remains rejected (do not reopen fabrication).
CREATE OR REPLACE FUNCTION public.classic_spin_commit(p_session uuid, p_team text, p_era text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RAISE EXCEPTION 'use_classic_spin' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.classic_spin_commit(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classic_spin_commit(uuid, text, text) TO authenticated;

-- Legacy leaderboard submit stays blocked (authoritative classic_run_submit only).
CREATE OR REPLACE FUNCTION public.submit_classic_leaderboard_lineup(p_lineup jsonb, p_client_run_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RAISE EXCEPTION 'use_classic_run_submit' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.submit_classic_leaderboard_lineup(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_classic_leaderboard_lineup(jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_leaderboard_run(p_verified_value bigint, p_lineup jsonb, p_client_run_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off
AS $$
BEGIN
  RAISE EXCEPTION 'use_classic_run_submit' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION public.submit_leaderboard_run(bigint, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_leaderboard_run(bigint, jsonb, text) TO authenticated;

-- Re-assert permissions: never grant coin_post/bank_post to clients.
REVOKE ALL ON FUNCTION public.coin_post(uuid, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bank_post(uuid, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coin_post(uuid, bigint, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.bank_post(uuid, bigint, text, text, jsonb) TO service_role;

-- Intentionally PRESERVED (do not drop):
--   classic_run_sessions, classic_run_actions, trivia_challenges,
--   iap_transactions, iap_refund_debts, user_entitlements, iap_product_catalog,
--   user_perk_inventory, user_perk_consumptions,
--   coin_accounts, coin_ledger, bank_accounts, bank_ledger,
--   user_leaderboard_runs / user_leaderboard_pb,
--   secure RPCs: classic_spin, classic_run_submit, classic_run_abandon,
--   coin_grant_iap, iap_revoke_transaction, _iap_recompute_entitlements, etc.

COMMIT;

-- If coin_post/bank_post bodies must be restored verbatim, paste
-- supabase/admin/2026-11-23_coin_post_bank_post_REFERENCE.sql next,
-- then re-apply the V4 coin_post debt-collection body from REVIEW.sql
-- (search for "V4 FIXES") so refund debts stay enforced.
