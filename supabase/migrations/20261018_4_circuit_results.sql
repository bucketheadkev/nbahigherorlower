-- The Circuit — rankings, results and prizes. Requires 20261018_3_the_circuit.sql.
--
-- Rankings
--   Verified team value DESC → earliest submission → user id (stable, no ties).
--   One run per entry; a run can count for one entry only (unique run_id); the run must
--   land after the player entered and before the deadline.
--
-- Prizes (funded only by entry fees — no Cash is created)
--   Minimum 3 submitted runs. Pool split 1st 50% · 2nd 30% · 3rd 20%; remainder dollars to 1st.
--   Fewer than 3 runs at the deadline → competition cancelled, every entry fee refunded.
--   An operator can cancel early with circuit_cancel() (refunds everyone).
--   All credits post through bank_post() keyed by competition, so nothing pays twice.
--
-- Finalization
--   circuit_settle_due() runs every minute via pg_cron (scheduled below when available),
--   and also on every get_circuit() read as a fallback.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Schema upgrades
-- ---------------------------------------------------------------------------

ALTER TABLE public.circuit_formats
  ADD COLUMN IF NOT EXISTS min_runs smallint NOT NULL DEFAULT 3 CHECK (min_runs >= 1);

ALTER TABLE public.circuit_competitions
  ADD COLUMN IF NOT EXISTS min_runs smallint NOT NULL DEFAULT 3 CHECK (min_runs >= 1),
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.circuit_competitions DROP CONSTRAINT IF EXISTS circuit_competitions_status_check;
ALTER TABLE public.circuit_competitions
  ADD CONSTRAINT circuit_competitions_status_check CHECK (status IN ('open', 'settled', 'cancelled'));

-- A verified run can be the official entry for one competition only.
CREATE UNIQUE INDEX IF NOT EXISTS circuit_entries_run_uidx
  ON public.circuit_entries (run_id) WHERE run_id IS NOT NULL;

DROP INDEX IF EXISTS public.circuit_entries_rank_idx;
CREATE INDEX IF NOT EXISTS circuit_entries_rank_idx
  ON public.circuit_entries (competition_id, run_value DESC, submitted_at ASC, user_id ASC);

-- ---------------------------------------------------------------------------
-- Prize math (single source for cards, standings and settlement)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.circuit_prizes(p_pool bigint)
RETURNS bigint[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    p_pool - (p_pool * 30) / 100 - (p_pool * 20) / 100,
    (p_pool * 30) / 100,
    (p_pool * 20) / 100
  ]::bigint[];
$$;

-- ---------------------------------------------------------------------------
-- Creation now carries the format's minimum
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

  INSERT INTO public.circuit_competitions (format, entry_fee, rerolls_allowed, starts_at, ends_at, min_runs)
  VALUES (f.key, f.entry_fee, f.rerolls_allowed, v_start, v_start + f.duration, f.min_runs)
  ON CONFLICT (format, starts_at) DO NOTHING;

  SELECT * INTO c FROM public.circuit_competitions WHERE format = f.key AND starts_at = v_start;
  RETURN c;
END;
$$;

-- ---------------------------------------------------------------------------
-- Refunds, cancellation, settlement
-- ---------------------------------------------------------------------------

-- Caller must hold the competition row lock.
CREATE OR REPLACE FUNCTION public.circuit_refund_all(p_competition uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  e record;
BEGIN
  FOR e IN SELECT user_id, entry_fee FROM public.circuit_entries WHERE competition_id = p_competition LOOP
    PERFORM public.bank_post(e.user_id, e.entry_fee, 'league_refund', p_competition::text,
      jsonb_build_object('competition_id', p_competition, 'reason', p_reason));
    UPDATE public.circuit_entries SET payout = e.entry_fee, final_rank = NULL
    WHERE competition_id = p_competition AND user_id = e.user_id;
  END LOOP;
  UPDATE public.circuit_competitions
  SET status = 'cancelled', cancel_reason = p_reason, settled_at = now()
  WHERE id = p_competition;
END;
$$;

-- Operator-only early cancellation (SQL Editor / service role). Refunds everyone once.
CREATE OR REPLACE FUNCTION public.circuit_cancel(p_competition uuid, p_reason text DEFAULT 'cancelled')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  c public.circuit_competitions%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.circuit_competitions WHERE id = p_competition FOR UPDATE;
  IF NOT FOUND OR c.status <> 'open' THEN
    RETURN;
  END IF;
  PERFORM public.circuit_refund_all(c.id, coalesce(nullif(trim(p_reason), ''), 'cancelled'));
END;
$$;

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

  IF v_runs < c.min_runs THEN
    PERFORM public.circuit_refund_all(c.id, 'not_enough_runs');
    RETURN;
  END IF;

  v_prizes := public.circuit_prizes(v_pool);

  FOR e IN
    SELECT user_id FROM public.circuit_entries
    WHERE competition_id = c.id AND run_value IS NOT NULL
    ORDER BY run_value DESC, submitted_at ASC, user_id ASC
  LOOP
    v_rank := v_rank + 1;
    UPDATE public.circuit_entries
    SET final_rank = v_rank,
        payout = CASE WHEN v_rank <= 3 THEN v_prizes[v_rank] ELSE 0 END
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

REVOKE ALL ON FUNCTION public.circuit_refund_all(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_cancel(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_settle(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_prizes(bigint) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Live rank (same order as settlement)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.circuit_live_rank(p_competition uuid, p_uid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT r.rank::integer FROM (
    SELECT user_id, row_number() OVER (ORDER BY run_value DESC, submitted_at ASC, user_id ASC) AS rank
    FROM public.circuit_entries
    WHERE competition_id = p_competition AND run_value IS NOT NULL
  ) r
  WHERE r.user_id = p_uid;
$$;

REVOKE ALL ON FUNCTION public.circuit_live_rank(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Card JSON: adds status, minimum, prize amounts; standings use the shared order.
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
    'participants', (SELECT count(*) FROM public.circuit_entries WHERE competition_id = c.id),
    'submitted', (SELECT count(*) FROM public.circuit_entries
                  WHERE competition_id = c.id AND run_value IS NOT NULL),
    'prize_pool', v_pool,
    'prizes', to_jsonb(public.circuit_prizes(v_pool)),
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

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

-- Full standings (top N plus the caller's own row) for a live or finished competition.
CREATE OR REPLACE FUNCTION public.get_circuit_standings(p_competition uuid, p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  c public.circuit_competitions%ROWTYPE;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
BEGIN
  SELECT * INTO c FROM public.circuit_competitions WHERE id = p_competition;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'competition_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN public.circuit_card(c, v_uid) || jsonb_build_object(
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'rank', r.rank, 'username', r.username, 'run_value', r.run_value,
        'payout', r.payout, 'is_me', r.user_id = v_uid) ORDER BY r.rank)
      FROM (
        SELECT ranked.* FROM (
          SELECT e.user_id, e.run_value, e.payout, p.username,
            row_number() OVER (ORDER BY e.run_value DESC, e.submitted_at ASC, e.user_id ASC) AS rank
          FROM public.circuit_entries e
          INNER JOIN public.profiles p ON p.user_id = e.user_id
          WHERE e.competition_id = c.id AND e.run_value IS NOT NULL
        ) ranked
        WHERE ranked.rank <= v_limit OR ranked.user_id = v_uid
      ) r
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_circuit_standings(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_circuit_standings(uuid, integer) TO anon, authenticated;

-- Current competitions + the caller's finished leagues (with podium) for results screens.
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
          'prize_pool', (SELECT coalesce(sum(x.entry_fee), 0) FROM public.circuit_entries x
                         WHERE x.competition_id = cc.id),
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
-- Entry recording: one run per entry, after entering, before the deadline
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.circuit_record_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_comp uuid;
BEGIN
  IF NEW.client_run_id IS NULL OR NEW.client_run_id NOT LIKE 'circuit\_%' THEN
    RETURN NEW;
  END IF;
  SELECT competition_id INTO v_comp FROM public.circuit_entries
  WHERE attempt_id = NEW.client_run_id AND user_id = NEW.user_id;
  IF v_comp IS NULL THEN
    RETURN NEW;
  END IF;
  -- Serialize with settlement (FOR UPDATE on the competition).
  PERFORM 1 FROM public.circuit_competitions WHERE id = v_comp FOR SHARE;
  UPDATE public.circuit_entries e
  SET run_id = NEW.id,
      run_value = NEW.verified_value,
      submitted_at = NEW.achieved_at
  FROM public.circuit_competitions c
  WHERE e.attempt_id = NEW.client_run_id
    AND e.user_id = NEW.user_id
    AND e.run_value IS NULL
    AND e.run_id IS NULL
    AND NEW.achieved_at >= e.entered_at
    AND c.id = e.competition_id
    AND c.status = 'open'
    AND NEW.achieved_at <= c.ends_at
    AND NOT EXISTS (SELECT 1 FROM public.circuit_entries o WHERE o.run_id = NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.circuit_record_run() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Finalize on time even when nobody has the app open (pg_cron, every minute)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron unavailable (%). Enable it under Database → Extensions, then re-run this block.', SQLERRM;
    RETURN;
  END;

  BEGIN
    PERFORM cron.unschedule('circuit-settle-due');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- not scheduled yet
  END;

  PERFORM cron.schedule('circuit-settle-due', '* * * * *', 'SELECT public.circuit_settle_due();');
END;
$$;
