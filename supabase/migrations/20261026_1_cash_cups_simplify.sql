-- Cash Cups: one simple screen (2026-10-26). Requires 20261019_1_cash_leagues_v2.sql and 20261025_3.
--
--   * High Stakes is retired. It's no longer listed; anyone entered in an open High Stakes cup
--     gets their entry fee back now (once, via circuit_refund_all).
--   * get_circuit no longer returns past results, so no app build pops up results any more.
--     Prizes and refunds are still credited to the Bank exactly as before.
--
-- In-game Cash only. Apply manually in the Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.circuit_formats ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
UPDATE public.circuit_formats SET active = false WHERE key = 'high_stakes';

DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT c.id FROM public.circuit_competitions c
    JOIN public.circuit_formats f ON f.key = c.format
    WHERE NOT f.active AND c.status = 'open'
    FOR UPDATE OF c
  LOOP
    PERFORM public.circuit_refund_all(v_id, 'retired');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_circuit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  f record;
  c public.circuit_competitions%ROWTYPE;
  v_cards jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.circuit_settle_due();
  FOR f IN SELECT key FROM public.circuit_formats WHERE active ORDER BY sort LOOP
    c := public.circuit_current(f.key);
    v_cards := v_cards || jsonb_build_array(public.circuit_card(c, v_uid));
  END LOOP;

  RETURN jsonb_build_object(
    'server_time', now(),
    'competitions', v_cards,
    'results', '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_circuit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_circuit() TO anon, authenticated;
