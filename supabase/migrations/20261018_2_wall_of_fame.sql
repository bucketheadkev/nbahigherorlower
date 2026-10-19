-- Wall of Fame: permanent recognition the first time a player's server Bank reaches
-- $1,000,000,000. Spending afterwards never removes the entry. One row per player.
-- Requires 20261017_1_bank_ledger.sql. Apply manually in the Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.wall_of_fame (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  inducted_at timestamptz NOT NULL DEFAULT now(),
  balance_at_induction bigint NOT NULL CHECK (balance_at_induction >= 1000000000)
);

CREATE INDEX IF NOT EXISTS wall_of_fame_inducted_idx ON public.wall_of_fame (inducted_at);

ALTER TABLE public.wall_of_fame ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wall_of_fame FROM PUBLIC, anon, authenticated;

-- Induct on any balance change that crosses the goal.
CREATE OR REPLACE FUNCTION public.wall_of_fame_induct()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NEW.balance >= 1000000000 THEN
    INSERT INTO public.wall_of_fame (user_id, balance_at_induction)
    VALUES (NEW.user_id, NEW.balance)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.wall_of_fame_induct() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wall_of_fame_induct_trg ON public.bank_accounts;
CREATE TRIGGER wall_of_fame_induct_trg
  AFTER INSERT OR UPDATE OF balance ON public.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.wall_of_fame_induct();

-- Backfill anyone already at the goal.
INSERT INTO public.wall_of_fame (user_id, balance_at_induction)
SELECT user_id, balance FROM public.bank_accounts WHERE balance >= 1000000000
ON CONFLICT (user_id) DO NOTHING;

-- Public list: username + induction date only, oldest first.
CREATE OR REPLACE FUNCTION public.get_wall_of_fame(p_limit integer DEFAULT 500)
RETURNS TABLE (username text, inducted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT p.username, w.inducted_at
  FROM public.wall_of_fame w
  INNER JOIN public.profiles p ON p.user_id = w.user_id
  ORDER BY w.inducted_at ASC, p.username_normalized ASC
  LIMIT greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

REVOKE ALL ON FUNCTION public.get_wall_of_fame(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_wall_of_fame(integer) TO anon, authenticated;

-- Caller's own induction (null when not inducted).
CREATE OR REPLACE FUNCTION public.get_my_wall_of_fame()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT inducted_at FROM public.wall_of_fame WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_wall_of_fame() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_wall_of_fame() TO authenticated;
