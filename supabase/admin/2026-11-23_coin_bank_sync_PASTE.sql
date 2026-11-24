-- =============================================================================
-- SUPERSEDED — DO NOT USE
-- =============================================================================
-- The earlier paste installed credit_my_coins(amount, kind, ref), which lets any
-- authenticated client mint coins. That design is rejected.
--
-- Use instead (review, then paste):
--   supabase/admin/2026-11-23_SECURE_coin_bank_REVIEW.sql
-- Rollback twin:
--   supabase/admin/2026-11-23_SECURE_coin_bank_ROLLBACK.sql
--
-- Target project (from app .env.local):
--   rqogjyjfatnyuoorvyix.supabase.co
-- =============================================================================

DO $$
BEGIN
  RAISE EXCEPTION
    'Obsolete paste blocked. Apply 2026-11-23_SECURE_coin_bank_REVIEW.sql instead.';
END $$;
