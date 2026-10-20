-- Cash Leagues v2 + verified seat-price fixes (2026-10-19).
-- Requires 20261018_3_the_circuit.sql and 20261018_4_circuit_results.sql.
--
-- Cash Leagues
--   * No minimum number of runs. Any league with at least one submitted run pays out —
--     a lone runner takes 1st place and its prize. A league where nobody submits a run is
--     still refunded (there is no winner to pay).
--   * Open Run and No Reroll reset every 2 hours with fixed prizes:
--       1st $2,500,000 · 2nd $1,500,000 · 3rd $1,000,000 (house-funded game Cash).
--     The leagues open right now move onto the new 2-hour schedule (entries are kept).
--   * High Stakes keeps its entry-fee pool (50 / 30 / 20). Places nobody reached roll up to 1st,
--     so the whole pool is always paid out.
--   * Every credit still posts once through bank_post() keyed by competition.
--
-- Seat prices
--   Five catalog rows priced the server differently from the app (Reggie Miller in three eras,
--   James Harden in two). They now match lib/tradeup/billionDollar.ts exactly, so verified team
--   values — Surplus Spin, Bet on Yourself and leaderboards — agree with what players see.
--
-- In-game Cash only. Apply manually in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Fixed prizes
-- ---------------------------------------------------------------------------

ALTER TABLE public.circuit_formats ADD COLUMN IF NOT EXISTS fixed_prizes bigint[];
ALTER TABLE public.circuit_competitions ADD COLUMN IF NOT EXISTS fixed_prizes bigint[];

UPDATE public.circuit_formats
SET duration = interval '2 hours',
    fixed_prizes = ARRAY[2500000, 1500000, 1000000]::bigint[],
    min_runs = 1
WHERE key IN ('open_run', 'no_reroll');

UPDATE public.circuit_formats SET min_runs = 1 WHERE key = 'high_stakes';

-- Prize list for one competition: fixed amounts, or the 50/30/20 split of its pool.
CREATE OR REPLACE FUNCTION public.circuit_prize_list(c public.circuit_competitions, p_pool bigint)
RETURNS bigint[]
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN c.fixed_prizes IS NOT NULL THEN c.fixed_prizes
    ELSE public.circuit_prizes(p_pool)
  END;
$$;

REVOKE ALL ON FUNCTION public.circuit_prize_list(public.circuit_competitions, bigint) FROM PUBLIC, anon, authenticated;

-- What the card calls the prize pool: the fixed prizes' total, or the fees collected.
CREATE OR REPLACE FUNCTION public.circuit_pool_shown(c public.circuit_competitions, p_pool bigint)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN c.fixed_prizes IS NOT NULL THEN (SELECT coalesce(sum(x), 0) FROM unnest(c.fixed_prizes) x)::bigint
    ELSE p_pool
  END;
$$;

REVOKE ALL ON FUNCTION public.circuit_pool_shown(public.circuit_competitions, bigint) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Creation carries the format's prizes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.circuit_current(p_format text)
RETURNS public.circuit_competitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  f public.circuit_formats%ROWTYPE;
  v_secs bigint;
  v_start timestamptz;
  c public.circuit_competitions%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.circuit_formats WHERE key = p_format;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_format' USING ERRCODE = '22023';
  END IF;
  v_secs := extract(epoch FROM f.duration)::bigint;
  v_start := to_timestamp((floor(extract(epoch FROM now()) / v_secs) * v_secs)::double precision);

  INSERT INTO public.circuit_competitions
    (format, entry_fee, rerolls_allowed, starts_at, ends_at, min_runs, fixed_prizes)
  VALUES (f.key, f.entry_fee, f.rerolls_allowed, v_start, v_start + f.duration, f.min_runs, f.fixed_prizes)
  ON CONFLICT (format, starts_at) DO NOTHING;

  SELECT * INTO c FROM public.circuit_competitions WHERE format = f.key AND starts_at = v_start;
  RETURN c;
END;
$$;

-- Leagues open right now: Open Run / No Reroll move onto the current 2-hour window with the new
-- prizes (keeping every entry); High Stakes drops its minimum.
DO $$
DECLARE
  v_start timestamptz := to_timestamp((floor(extract(epoch FROM now()) / 7200) * 7200)::double precision);
  k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['open_run', 'no_reroll'] LOOP
    UPDATE public.circuit_competitions c
    SET starts_at = v_start,
        ends_at = v_start + interval '2 hours'
    WHERE c.format = k
      AND c.status = 'open'
      AND c.ends_at > now()
      AND c.starts_at <> v_start
      AND c.ends_at - c.starts_at > interval '2 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.circuit_competitions x WHERE x.format = k AND x.starts_at = v_start
      );
  END LOOP;

  UPDATE public.circuit_competitions
  SET fixed_prizes = ARRAY[2500000, 1500000, 1000000]::bigint[], min_runs = 1
  WHERE format IN ('open_run', 'no_reroll') AND status = 'open';

  UPDATE public.circuit_competitions SET min_runs = 1 WHERE format = 'high_stakes' AND status = 'open';
END;
$$;

-- ---------------------------------------------------------------------------
-- Settlement: no minimum; lone runner wins; nobody ran → refund
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.circuit_settle(p_competition uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  c public.circuit_competitions%ROWTYPE;
  v_pool bigint;
  v_runs integer;
  v_prizes bigint[];
  v_unclaimed bigint := 0;
  v_rank integer := 0;
  e record;
BEGIN
  SELECT * INTO c FROM public.circuit_competitions WHERE id = p_competition FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' OR c.ends_at > now() THEN
    RETURN;
  END IF;

  SELECT coalesce(sum(entry_fee), 0) INTO v_pool FROM public.circuit_entries WHERE competition_id = c.id;
  SELECT count(*) INTO v_runs FROM public.circuit_entries
  WHERE competition_id = c.id AND run_value IS NOT NULL;

  IF v_runs = 0 THEN
    PERFORM public.circuit_refund_all(c.id, 'no_runs');
    RETURN;
  END IF;

  v_prizes := public.circuit_prize_list(c, v_pool);

  -- Pool leagues pay the whole pool: shares for places nobody reached go to 1st.
  IF c.fixed_prizes IS NULL AND v_runs < 3 THEN
    SELECT coalesce(sum(v_prizes[i]), 0) INTO v_unclaimed
    FROM generate_series(v_runs + 1, 3) AS i;
  END IF;

  FOR e IN
    SELECT user_id FROM public.circuit_entries
    WHERE competition_id = c.id AND run_value IS NOT NULL
    ORDER BY run_value DESC, submitted_at ASC, user_id ASC
  LOOP
    v_rank := v_rank + 1;
    UPDATE public.circuit_entries
    SET final_rank = v_rank,
        payout = CASE
          WHEN v_rank = 1 THEN v_prizes[1] + v_unclaimed
          WHEN v_rank <= 3 THEN v_prizes[v_rank]
          ELSE 0
        END
    WHERE competition_id = c.id AND user_id = e.user_id;
  END LOOP;

  FOR e IN
    SELECT user_id, payout FROM public.circuit_entries
    WHERE competition_id = c.id AND payout > 0
  LOOP
    PERFORM public.bank_post(e.user_id, e.payout, 'league_payout', c.id::text,
      jsonb_build_object('competition_id', c.id, 'format', c.format));
  END LOOP;

  UPDATE public.circuit_competitions SET status = 'settled', settled_at = now() WHERE id = c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.circuit_settle(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cards and results report the right prizes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.circuit_card(c public.circuit_competitions, p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  f public.circuit_formats%ROWTYPE;
  me public.circuit_entries%ROWTYPE;
  v_pool bigint;
BEGIN
  SELECT * INTO f FROM public.circuit_formats WHERE key = c.format;
  SELECT coalesce(sum(entry_fee), 0) INTO v_pool FROM public.circuit_entries WHERE competition_id = c.id;
  IF p_uid IS NOT NULL THEN
    SELECT * INTO me FROM public.circuit_entries WHERE competition_id = c.id AND user_id = p_uid;
  END IF;

  RETURN jsonb_build_object(
    'id', c.id,
    'format', c.format,
    'name', f.name,
    'entry_fee', c.entry_fee,
    'rerolls_allowed', c.rerolls_allowed,
    'starts_at', c.starts_at,
    'ends_at', c.ends_at,
    'status', c.status,
    'cancel_reason', c.cancel_reason,
    'min_runs', c.min_runs,
    'fixed_prizes', c.fixed_prizes IS NOT NULL,
    'participants', (SELECT count(*) FROM public.circuit_entries WHERE competition_id = c.id),
    'submitted', (SELECT count(*) FROM public.circuit_entries
                  WHERE competition_id = c.id AND run_value IS NOT NULL),
    'prize_pool', public.circuit_pool_shown(c, v_pool),
    'prizes', to_jsonb(public.circuit_prize_list(c, v_pool)),
    'standings', coalesce((
      SELECT jsonb_agg(jsonb_build_object('rank', s.rank, 'username', s.username,
        'run_value', s.run_value, 'is_me', s.user_id = p_uid) ORDER BY s.rank)
      FROM (
        SELECT e.user_id, e.run_value, p.username,
          row_number() OVER (ORDER BY e.run_value DESC, e.submitted_at ASC, e.user_id ASC) AS rank
        FROM public.circuit_entries e
        INNER JOIN public.profiles p ON p.user_id = e.user_id
        WHERE e.competition_id = c.id AND e.run_value IS NOT NULL
        ORDER BY rank
        LIMIT 10
      ) s
    ), '[]'::jsonb),
    'me', CASE WHEN me.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'attempt_id', me.attempt_id,
      'run_value', me.run_value,
      'rank', coalesce(me.final_rank, public.circuit_live_rank(c.id, p_uid)),
      'payout', me.payout
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.circuit_card(public.circuit_competitions, uuid) FROM PUBLIC, anon, authenticated;

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
  FOR f IN SELECT key FROM public.circuit_formats ORDER BY sort LOOP
    c := public.circuit_current(f.key);
    v_cards := v_cards || jsonb_build_array(public.circuit_card(c, v_uid));
  END LOOP;

  RETURN jsonb_build_object(
    'server_time', now(),
    'competitions', v_cards,
    'results', CASE WHEN v_uid IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(t.r ORDER BY t.ends_at DESC)
      FROM (
        SELECT cc.ends_at, jsonb_build_object(
          'competition_id', cc.id,
          'format', cc.format,
          'name', cf.name,
          'status', cc.status,
          'cancel_reason', cc.cancel_reason,
          'ends_at', cc.ends_at,
          'settled_at', cc.settled_at,
          'min_runs', cc.min_runs,
          'participants', (SELECT count(*) FROM public.circuit_entries x WHERE x.competition_id = cc.id),
          'entrants', (SELECT count(*) FROM public.circuit_entries x
                       WHERE x.competition_id = cc.id AND x.run_value IS NOT NULL),
          'prize_pool', public.circuit_pool_shown(cc, (SELECT coalesce(sum(x.entry_fee), 0)::bigint
                         FROM public.circuit_entries x WHERE x.competition_id = cc.id)),
          'rank', e.final_rank,
          'run_value', e.run_value,
          'entry_fee', e.entry_fee,
          'payout', e.payout,
          'podium', CASE WHEN cc.status = 'settled' THEN coalesce((
            SELECT jsonb_agg(jsonb_build_object('rank', w.final_rank, 'username', p.username,
              'run_value', w.run_value, 'payout', w.payout, 'is_me', w.user_id = v_uid)
              ORDER BY w.final_rank)
            FROM public.circuit_entries w
            INNER JOIN public.profiles p ON p.user_id = w.user_id
            WHERE w.competition_id = cc.id AND w.final_rank BETWEEN 1 AND 3
          ), '[]'::jsonb) ELSE '[]'::jsonb END
        ) AS r
        FROM public.circuit_entries e
        INNER JOIN public.circuit_competitions cc ON cc.id = e.competition_id
        INNER JOIN public.circuit_formats cf ON cf.key = cc.format
        WHERE e.user_id = v_uid AND cc.status IN ('settled', 'cancelled')
        ORDER BY cc.ends_at DESC
        LIMIT 8
      ) t
    ), '[]'::jsonb) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_circuit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_circuit() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seat prices: match the app
-- ---------------------------------------------------------------------------

INSERT INTO public.classic_player_seat_values (
  player_id, primary_position, value_pg, value_sg, value_sf, value_pf, value_c
) VALUES
  ('hist_1980s_IND_reggie_miller', 'SG', 192000000, 198000000, 192000000, 192000000, 192000000),
  ('hist_1990s_IND_reggie_miller', 'SG', 192000000, 198000000, 192000000, 192000000, 192000000),
  ('hist_2000s_IND_reggie_miller', 'SG', 192000000, 198000000, 192000000, 192000000, 192000000),
  ('hist_2010s_HOU_james_harden', 'SG', 198000000, 204000000, 198000000, 198000000, 198000000),
  ('hist_2010s_OKC_james_harden', 'SG', 184000000, 190000000, 184000000, 184000000, 184000000)
ON CONFLICT (player_id) DO UPDATE
  SET primary_position = EXCLUDED.primary_position,
      value_pg = EXCLUDED.value_pg,
      value_sg = EXCLUDED.value_sg,
      value_sf = EXCLUDED.value_sf,
      value_pf = EXCLUDED.value_pf,
      value_c = EXCLUDED.value_c;
