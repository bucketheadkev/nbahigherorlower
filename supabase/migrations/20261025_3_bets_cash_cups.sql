-- Bet on Yourself rule changes + $25,000 Cash Cups (2026-10-25).
-- Requires 20261018_6_wager_slips.sql and 20261019_1_cash_leagues_v2.sql.
--
-- Bet on Yourself (keep in step with lib/tradeup/wagers.ts)
--   * Billion or Bust also takes $5,000,000 and $10,000,000 stakes.
--   * No Rerolls pays 1.3× (was 1.6×).
--   * Superteam needs all five players at $190,000,000 or more (was $170,000,000); still 1.45×.
--   * Clutch Pick is retired: it can't be placed any more. Its catalog row stays so past slips
--     keep their history.
--   Slips already placed keep the multiplier they were placed at.
--
-- Cash Cups
--   * Every cup costs $25,000 to enter. Cups open right now switch too; players already entered
--     keep the fee they paid (refunds return exactly that).
--
-- In-game Cash only. Apply manually in the Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.wager_catalog ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

UPDATE public.wager_catalog SET max_stake = 10000000 WHERE id = 'billion_or_bust';
UPDATE public.wager_catalog SET multiplier_x100 = 130 WHERE id = 'no_rerolls';
UPDATE public.wager_catalog SET multiplier_x100 = 145 WHERE id = 'superteam';
UPDATE public.wager_catalog SET active = false WHERE id = 'clutch_pick';

CREATE OR REPLACE FUNCTION public.wager_wins(
  p_wager text,
  p_total bigint,
  p_values bigint[],
  p_fifth bigint,
  p_rerolls_used boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_wager
    WHEN 'billion_or_bust' THEN p_total >= 1000000000
    WHEN 'high_roller' THEN p_total >= 1010000000
    WHEN 'star_hunter' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 200000000) >= 1
    WHEN 'dynamic_duo' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 190000000) >= 2
    WHEN 'triple_threat' THEN (SELECT count(*) FROM unnest(p_values) v WHERE v >= 185000000) >= 3
    WHEN 'superteam' THEN cardinality(p_values) = 5
      AND (SELECT count(*) FROM unnest(p_values) v WHERE v >= 190000000) = 5
    WHEN 'clutch_pick' THEN coalesce(p_fifth, 0) >= 190000000
    WHEN 'no_rerolls' THEN NOT coalesce(p_rerolls_used, true) AND p_total >= 900000000
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.wager_wins(text, bigint, bigint[], bigint, boolean) FROM PUBLIC, anon, authenticated;

-- p_picks: [{ "id": "star_hunter", "stake": 500000 }, ...]
CREATE OR REPLACE FUNCTION public.place_wager_slip(p_client_run_id text, p_picks jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slip uuid;
  v_total bigint := 0;
  v_count integer;
  p record;
  c public.wager_catalog%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(length(trim(p_client_run_id)), 0) = 0 THEN
    RAISE EXCEPTION 'invalid_run' USING ERRCODE = '22023';
  END IF;

  -- Idempotent: the same run returns the slip already placed.
  SELECT id INTO v_slip FROM public.wager_slips WHERE user_id = v_uid AND client_run_id = p_client_run_id;
  IF v_slip IS NOT NULL THEN
    RETURN public.wager_slip_json(v_slip);
  END IF;

  IF jsonb_typeof(p_picks) <> 'array' THEN
    RAISE EXCEPTION 'invalid_slip' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_picks);
  IF v_count < 1 OR v_count > 3
     OR (SELECT count(DISTINCT x ->> 'id') FROM jsonb_array_elements(p_picks) x) <> v_count THEN
    RAISE EXCEPTION 'invalid_slip' USING ERRCODE = '22023';
  END IF;

  -- Any earlier slip whose run never landed is forfeited (its stake was already taken).
  UPDATE public.wager_slips SET status = 'forfeited', settled_at = now()
  WHERE user_id = v_uid AND status = 'open';

  FOR p IN SELECT x ->> 'id' AS id, (x ->> 'stake')::bigint AS stake FROM jsonb_array_elements(p_picks) x LOOP
    SELECT * INTO c FROM public.wager_catalog WHERE id = p.id;
    IF NOT FOUND OR NOT c.active OR p.stake IS NULL
       OR p.stake NOT IN (100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000)
       OR p.stake > c.max_stake THEN
      RAISE EXCEPTION 'invalid_slip' USING ERRCODE = '22023';
    END IF;
    v_total := v_total + p.stake;
  END LOOP;

  INSERT INTO public.wager_slips (user_id, client_run_id, total_stake)
  VALUES (v_uid, p_client_run_id, v_total)
  RETURNING id INTO v_slip;

  INSERT INTO public.wager_slip_items (slip_id, wager_id, stake, multiplier_x100)
  SELECT v_slip, x ->> 'id', (x ->> 'stake')::bigint, wc.multiplier_x100
  FROM jsonb_array_elements(p_picks) x
  INNER JOIN public.wager_catalog wc ON wc.id = x ->> 'id';

  -- Raises insufficient_funds (rolling everything back) when the Bank is short.
  PERFORM public.bank_post(v_uid, -v_total, 'cash_table_wager', v_slip::text,
    jsonb_build_object('slip_id', v_slip, 'client_run_id', p_client_run_id));

  RETURN public.wager_slip_json(v_slip);
END;
$$;

REVOKE ALL ON FUNCTION public.place_wager_slip(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_wager_slip(text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Cash Cups: $25,000 entry everywhere
-- ---------------------------------------------------------------------------

UPDATE public.circuit_formats SET entry_fee = 25000;
UPDATE public.circuit_competitions SET entry_fee = 25000 WHERE status = 'open' AND entry_fee <> 25000;
