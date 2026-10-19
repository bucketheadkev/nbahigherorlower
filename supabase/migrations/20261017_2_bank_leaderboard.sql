-- Bank leaderboard RPCs. Requires 20261017_1_bank_ledger.sql.
-- Ranks permanent accounts by current Bank balance (bank_accounts, ledger-backed).
-- Exposes username + balance only. Apply manually in the Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Top N (default 100, max 200). Ties: alphabetical by username.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_bank_leaderboard_top(p_limit integer DEFAULT 100)
RETURNS TABLE (
  rank bigint,
  username text,
  bank_total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    row_number() OVER (ORDER BY a.balance DESC, p.username_normalized ASC) AS rank,
    p.username,
    a.balance AS bank_total
  FROM public.bank_accounts a
  INNER JOIN public.profiles p ON p.user_id = a.user_id
  WHERE a.balance > 0
  ORDER BY a.balance DESC, p.username_normalized ASC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 100), 200));
$$;

REVOKE ALL ON FUNCTION public.get_bank_leaderboard_top(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bank_leaderboard_top(integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signed-in player's rank (empty for guests, anonymous users, or a $0 Bank)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_bank_leaderboard_rank()
RETURNS TABLE (
  rank bigint,
  username text,
  bank_total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance bigint;
  v_username text;
  v_normalized text;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RETURN;
  END IF;

  SELECT a.balance, p.username, p.username_normalized
  INTO v_balance, v_username, v_normalized
  FROM public.bank_accounts a
  INNER JOIN public.profiles p ON p.user_id = a.user_id
  WHERE a.user_id = v_uid AND a.balance > 0;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT 1 + count(*)::bigint INTO rank
  FROM public.bank_accounts o
  INNER JOIN public.profiles op ON op.user_id = o.user_id
  WHERE o.balance > 0
    AND (
      o.balance > v_balance
      OR (o.balance = v_balance AND op.username_normalized < v_normalized)
    );

  username := v_username;
  bank_total := v_balance;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_bank_leaderboard_rank() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_bank_leaderboard_rank() TO authenticated;

-- ---------------------------------------------------------------------------
-- Signed-in player's authoritative balance (0 when no account row yet)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_bank_balance()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce(
    (SELECT a.balance FROM public.bank_accounts a WHERE a.user_id = auth.uid()),
    0
  )::bigint;
$$;

REVOKE ALL ON FUNCTION public.get_my_bank_balance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_bank_balance() TO authenticated;
