-- My Rank v2: rank by peak Bank balance (2026-10-25). Paste after 20261024_3 and 20261024_4.
--
-- Ranks (names, colors, thresholds) live in lib/tradeup/rank/config.ts:
--   Rookie $0 · Pro $1,000,000 · All-Star $10,000,000 · Superstar $50,000,000 ·
--   Legend $250,000,000 · GOAT $1,000,000,000
-- The rank is set by the most Cash a player has ever had in their Bank — the highest running total
-- of their ledger — so spending never lowers it. A Wall of Fame induction counts as a $1B+ peak.
-- Ranks no longer pay rewards (a reward would raise the very number that sets the rank), so the
-- rank pieces of 20261024_3 are removed. Rank rewards already credited stay in players' Banks.
--
-- In-game Cash only. Apply manually in the Supabase SQL Editor. Safe to re-run.

CREATE OR REPLACE FUNCTION public.bank_peak(p_uid uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT greatest(
    coalesce((
      SELECT max(running) FROM (
        SELECT sum(amount) OVER (ORDER BY id) AS running
        FROM public.bank_ledger
        WHERE user_id = p_uid
      ) t
    ), 0),
    coalesce((SELECT balance FROM public.bank_accounts WHERE user_id = p_uid), 0),
    coalesce((SELECT balance_at_induction FROM public.wall_of_fame WHERE user_id = p_uid), 0)
  )::bigint;
$$;

REVOKE ALL ON FUNCTION public.bank_peak(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_rank()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
BEGIN
  RETURN jsonb_build_object(
    'balance', coalesce((SELECT balance FROM public.bank_accounts WHERE user_id = v_uid), 0),
    'peak', public.bank_peak(v_uid)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_rank() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_rank() TO authenticated;

-- ---------------------------------------------------------------------------
-- Earnings summary without rank rewards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.earnings_items(p_uid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce(jsonb_agg(item ORDER BY ord), '[]'::jsonb)
  FROM (
    SELECT 1 AS ord, jsonb_build_object(
      'kind', 'franchise_income', 'ref', c.id, 'team_id', c.team_id,
      'hours', public.franchise_hours_earned(c) - c.hours_paid,
      'amount', (public.franchise_hours_earned(c) - c.hours_paid)::bigint * c.hourly_rate
    ) AS item
    FROM public.franchise_cycles c
    WHERE c.user_id = p_uid AND c.status = 'earning' AND public.franchise_hours_earned(c) > c.hours_paid
    UNION ALL
    SELECT 2, jsonb_build_object(
      'kind', 'franchise_bonus', 'ref', c.id, 'team_id', c.team_id, 'amount', c.completion_bonus
    )
    FROM public.franchise_cycles c
    WHERE c.user_id = p_uid AND c.status = 'earning' AND NOT c.bonus_paid
      AND public.franchise_bonus_earned(c) AND coalesce(c.completion_bonus, 0) > 0
    UNION ALL
    SELECT 3, jsonb_build_object('kind', 'franchise_refund', 'ref', s.ownership_id, 'team_id', s.team_id,
                                 'amount', s.proceeds + s.income_paid, 'credited', true)
    FROM public.franchise_sales s
    WHERE s.user_id = p_uid AND s.reason = 'legacy_consolidation' AND s.acknowledged_at IS NULL
  ) items;
$$;

REVOKE ALL ON FUNCTION public.earnings_items(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_pending_earnings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
BEGIN
  RETURN jsonb_build_object('server_time', now(), 'items', public.earnings_items(v_uid));
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_earnings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_earnings() TO authenticated;

-- Pays every pending item exactly once and returns what this call credited.
CREATE OR REPLACE FUNCTION public.collect_earnings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  c record;
  s record;
  v_settle jsonb;
  v_items jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);

  FOR c IN SELECT id FROM public.franchise_cycles WHERE user_id = v_uid AND status = 'earning' LOOP
    v_settle := public.franchise_settle(c.id);
    IF (v_settle ->> 'income')::bigint > 0 THEN
      v_items := v_items || jsonb_build_object('kind', 'franchise_income', 'ref', c.id,
        'team_id', v_settle ->> 'team_id', 'hours', (v_settle ->> 'hours')::integer,
        'amount', (v_settle ->> 'income')::bigint);
    END IF;
    IF (v_settle ->> 'bonus')::bigint > 0 THEN
      v_items := v_items || jsonb_build_object('kind', 'franchise_bonus', 'ref', c.id,
        'team_id', v_settle ->> 'team_id', 'amount', (v_settle ->> 'bonus')::bigint);
    END IF;
  END LOOP;

  FOR s IN
    UPDATE public.franchise_sales SET acknowledged_at = now()
    WHERE user_id = v_uid AND reason = 'legacy_consolidation' AND acknowledged_at IS NULL
    RETURNING ownership_id, team_id, proceeds, income_paid
  LOOP
    v_items := v_items || jsonb_build_object('kind', 'franchise_refund', 'ref', s.ownership_id,
      'team_id', s.team_id, 'amount', s.proceeds + s.income_paid, 'credited', true);
  END LOOP;

  RETURN jsonb_build_object(
    'server_time', now(),
    'items', v_items,
    'balance', coalesce((SELECT balance FROM public.bank_accounts WHERE user_id = v_uid), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.collect_earnings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.collect_earnings() TO authenticated;

-- ---------------------------------------------------------------------------
-- Retire the gameplay-based rank tables and helpers
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rank_sync(uuid);
DROP FUNCTION IF EXISTS public.rank_level_for(jsonb);
DROP FUNCTION IF EXISTS public.rank_metrics(uuid);
DROP TABLE IF EXISTS public.user_rank;
DROP TABLE IF EXISTS public.rank_requirements;
