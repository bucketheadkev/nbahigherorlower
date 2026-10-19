-- The Circuit: Cash Leagues paid with virtual Bank money. Requires 20261017_1_bank_ledger.sql.
--
-- Formats (rolling windows, created on demand)
--   open_run     $500,000 entry   · Classic rules           · 24h
--   no_reroll    $500,000 entry   · team + era rerolls off  · 24h
--   high_stakes  $5,000,000 entry · Classic rules           · 72h
--
-- Flow
--   enter_circuit(competition)     one entry per player; fee posted through bank_post()
--                                  ('league_entry', keyed by competition) — no double charge.
--   start_circuit_run(competition) issues the entry's attempt id (stable until a run lands).
--   The Classic run is submitted with that id as client_run_id; a trigger on
--   user_leaderboard_runs records the server-priced value as the official entry (once).
--   get_circuit()                  current competitions, live standings, my entries; settles
--                                  any competition past its deadline.
--
-- Prize pool = every entry fee in the competition (zero-sum: no Cash is created).
--   Paid to submitted runs by team value (ties: earliest run):
--   3+ runs: 50/30/20 · 2 runs: 70/30 · 1 run: 100%. Remainder dollars go to 1st.
--   No submitted runs: every fee is refunded ('league_refund').
--
-- Trust note: verified runs prove a lineup's value, not that it came from real spins or
-- that rerolls were skipped (No Reroll is enforced in the client). Server-issued runs
-- would close this.
--
-- All Cash is fictional in-game currency. Apply manually in the Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.circuit_formats (
  key text PRIMARY KEY CHECK (key IN ('open_run', 'no_reroll', 'high_stakes')),
  name text NOT NULL,
  entry_fee bigint NOT NULL CHECK (entry_fee > 0),
  rerolls_allowed boolean NOT NULL,
  duration interval NOT NULL CHECK (duration >= interval '1 hour'),
  sort smallint NOT NULL
);

INSERT INTO public.circuit_formats (key, name, entry_fee, rerolls_allowed, duration, sort) VALUES
  ('open_run', 'Open Run', 500000, true, interval '24 hours', 1),
  ('no_reroll', 'No Reroll', 500000, false, interval '24 hours', 2),
  ('high_stakes', 'High Stakes', 5000000, true, interval '72 hours', 3)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    entry_fee = EXCLUDED.entry_fee,
    rerolls_allowed = EXCLUDED.rerolls_allowed,
    duration = EXCLUDED.duration,
    sort = EXCLUDED.sort;

CREATE TABLE IF NOT EXISTS public.circuit_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  format text NOT NULL REFERENCES public.circuit_formats (key),
  entry_fee bigint NOT NULL CHECK (entry_fee > 0),
  rerolls_allowed boolean NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  settled_at timestamptz,
  UNIQUE (format, starts_at)
);

CREATE INDEX IF NOT EXISTS circuit_competitions_due_idx
  ON public.circuit_competitions (status, ends_at);

CREATE TABLE IF NOT EXISTS public.circuit_entries (
  competition_id uuid NOT NULL REFERENCES public.circuit_competitions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  entry_fee bigint NOT NULL CHECK (entry_fee > 0),
  entered_at timestamptz NOT NULL DEFAULT now(),
  attempt_id text UNIQUE,
  attempt_started_at timestamptz,
  run_id uuid REFERENCES public.user_leaderboard_runs (id) ON DELETE SET NULL,
  run_value bigint,
  submitted_at timestamptz,
  final_rank integer,
  payout bigint NOT NULL DEFAULT 0 CHECK (payout >= 0),
  PRIMARY KEY (competition_id, user_id)
);

CREATE INDEX IF NOT EXISTS circuit_entries_user_idx ON public.circuit_entries (user_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS circuit_entries_rank_idx
  ON public.circuit_entries (competition_id, run_value DESC, submitted_at ASC);

ALTER TABLE public.circuit_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circuit_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circuit_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.circuit_formats, public.circuit_competitions, public.circuit_entries
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internals
-- ---------------------------------------------------------------------------

-- Current window for a format (created on first read). Windows align to the epoch.
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

  INSERT INTO public.circuit_competitions (format, entry_fee, rerolls_allowed, starts_at, ends_at)
  VALUES (f.key, f.entry_fee, f.rerolls_allowed, v_start, v_start + f.duration)
  ON CONFLICT (format, starts_at) DO NOTHING;

  SELECT * INTO c FROM public.circuit_competitions WHERE format = f.key AND starts_at = v_start;
  RETURN c;
END;
$$;

-- Pays out (or refunds) one finished competition exactly once.
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
  v_shares integer[];
  v_paid bigint := 0;
  v_amount bigint;
  e record;
  v_rank integer := 0;
BEGIN
  SELECT * INTO c FROM public.circuit_competitions WHERE id = p_competition FOR UPDATE;
  IF NOT FOUND OR c.status = 'settled' OR c.ends_at > now() THEN
    RETURN;
  END IF;

  SELECT coalesce(sum(entry_fee), 0) INTO v_pool FROM public.circuit_entries WHERE competition_id = c.id;
  SELECT count(*) INTO v_runs FROM public.circuit_entries
  WHERE competition_id = c.id AND run_value IS NOT NULL;

  IF v_runs = 0 THEN
    FOR e IN SELECT user_id, entry_fee FROM public.circuit_entries WHERE competition_id = c.id LOOP
      PERFORM public.bank_post(e.user_id, e.entry_fee, 'league_refund', c.id::text,
        jsonb_build_object('competition_id', c.id, 'format', c.format));
      UPDATE public.circuit_entries SET payout = e.entry_fee
      WHERE competition_id = c.id AND user_id = e.user_id;
    END LOOP;
  ELSE
    v_shares := CASE
      WHEN v_runs >= 3 THEN ARRAY[50, 30, 20]
      WHEN v_runs = 2 THEN ARRAY[70, 30]
      ELSE ARRAY[100]
    END;

    FOR e IN
      SELECT user_id FROM public.circuit_entries
      WHERE competition_id = c.id AND run_value IS NOT NULL
      ORDER BY run_value DESC, submitted_at ASC, user_id
    LOOP
      v_rank := v_rank + 1;
      v_amount := 0;
      IF v_rank <= array_length(v_shares, 1) THEN
        v_amount := (v_pool * v_shares[v_rank]) / 100;
        v_paid := v_paid + v_amount;
      END IF;
      UPDATE public.circuit_entries SET final_rank = v_rank, payout = v_amount
      WHERE competition_id = c.id AND user_id = e.user_id;
    END LOOP;

    -- Integer remainder goes to first place.
    UPDATE public.circuit_entries SET payout = payout + (v_pool - v_paid)
    WHERE competition_id = c.id AND final_rank = 1;

    FOR e IN
      SELECT user_id, payout FROM public.circuit_entries
      WHERE competition_id = c.id AND payout > 0
    LOOP
      PERFORM public.bank_post(e.user_id, e.payout, 'league_payout', c.id::text,
        jsonb_build_object('competition_id', c.id, 'format', c.format));
    END LOOP;
  END IF;

  UPDATE public.circuit_competitions SET status = 'settled', settled_at = now() WHERE id = c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.circuit_settle_due()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id FROM public.circuit_competitions WHERE status = 'open' AND ends_at <= now()
  LOOP
    PERFORM public.circuit_settle(v_id);
  END LOOP;
END;
$$;

-- One competition as the client sees it.
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
  v_rank integer;
BEGIN
  SELECT * INTO f FROM public.circuit_formats WHERE key = c.format;
  IF p_uid IS NOT NULL THEN
    SELECT * INTO me FROM public.circuit_entries WHERE competition_id = c.id AND user_id = p_uid;
    IF FOUND AND me.run_value IS NOT NULL THEN
      SELECT count(*) + 1 INTO v_rank FROM public.circuit_entries o
      WHERE o.competition_id = c.id AND o.run_value IS NOT NULL
        AND (o.run_value > me.run_value
          OR (o.run_value = me.run_value AND o.submitted_at < me.submitted_at));
    END IF;
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
    'participants', (SELECT count(*) FROM public.circuit_entries WHERE competition_id = c.id),
    'submitted', (SELECT count(*) FROM public.circuit_entries
                  WHERE competition_id = c.id AND run_value IS NOT NULL),
    'prize_pool', (SELECT coalesce(sum(entry_fee), 0) FROM public.circuit_entries
                   WHERE competition_id = c.id),
    'standings', coalesce((
      SELECT jsonb_agg(jsonb_build_object('username', s.username, 'run_value', s.run_value,
        'is_me', s.user_id = p_uid) ORDER BY s.run_value DESC, s.submitted_at ASC)
      FROM (
        SELECT e.user_id, e.run_value, e.submitted_at, p.username
        FROM public.circuit_entries e
        INNER JOIN public.profiles p ON p.user_id = e.user_id
        WHERE e.competition_id = c.id AND e.run_value IS NOT NULL
        ORDER BY e.run_value DESC, e.submitted_at ASC
        LIMIT 10
      ) s
    ), '[]'::jsonb),
    'me', CASE WHEN me.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'attempt_id', me.attempt_id,
      'run_value', me.run_value,
      'rank', coalesce(me.final_rank, v_rank),
      'payout', me.payout
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.circuit_current(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_settle(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_settle_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_card(public.circuit_competitions, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

-- { competitions: [...current, by format], results: [...my last settled entries] }
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
      SELECT jsonb_agg(r ORDER BY r ->> 'ends_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'competition_id', cc.id,
          'name', cf.name,
          'ends_at', cc.ends_at,
          'rank', e.final_rank,
          'entrants', (SELECT count(*) FROM public.circuit_entries x
                       WHERE x.competition_id = cc.id AND x.run_value IS NOT NULL),
          'run_value', e.run_value,
          'entry_fee', e.entry_fee,
          'payout', e.payout
        ) AS r
        FROM public.circuit_entries e
        INNER JOIN public.circuit_competitions cc ON cc.id = e.competition_id
        INNER JOIN public.circuit_formats cf ON cf.key = cc.format
        WHERE e.user_id = v_uid AND cc.status = 'settled'
        ORDER BY cc.ends_at DESC
        LIMIT 5
      ) t
    ), '[]'::jsonb) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_circuit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_circuit() TO anon, authenticated;

-- Pay the fee and register. Repeat calls return the existing entry without charging.
CREATE OR REPLACE FUNCTION public.enter_circuit(p_competition uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  c public.circuit_competitions%ROWTYPE;
  v_rows integer := 0;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'profile_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO c FROM public.circuit_competitions WHERE id = p_competition FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'competition_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.circuit_entries WHERE competition_id = c.id AND user_id = v_uid) THEN
    -- Leave time to play the entry run.
    IF c.status <> 'open' OR now() > c.ends_at - interval '10 minutes' THEN
      RAISE EXCEPTION 'entries_closed' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.circuit_entries (competition_id, user_id, entry_fee)
    VALUES (c.id, v_uid, c.entry_fee)
    ON CONFLICT (competition_id, user_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      -- Raises insufficient_funds (rolling back the entry) when the Bank is short.
      PERFORM public.bank_post(v_uid, -c.entry_fee, 'league_entry', c.id::text,
        jsonb_build_object('competition_id', c.id, 'format', c.format));
    END IF;
  END IF;

  RETURN public.circuit_card(c, v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.enter_circuit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enter_circuit(uuid) TO authenticated;

-- Attempt id for the official entry run (stable until a run is recorded).
CREATE OR REPLACE FUNCTION public.start_circuit_run(p_competition uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  c public.circuit_competitions%ROWTYPE;
  e public.circuit_entries%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'permanent_account_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.circuit_competitions WHERE id = p_competition;
  SELECT * INTO e FROM public.circuit_entries
  WHERE competition_id = p_competition AND user_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_entered' USING ERRCODE = 'P0001';
  END IF;
  IF e.run_value IS NOT NULL THEN
    RAISE EXCEPTION 'entry_already_played' USING ERRCODE = 'P0001';
  END IF;
  IF c.status <> 'open' OR now() >= c.ends_at THEN
    RAISE EXCEPTION 'competition_closed' USING ERRCODE = 'P0001';
  END IF;

  IF e.attempt_id IS NULL THEN
    UPDATE public.circuit_entries
    SET attempt_id = 'circuit_' || replace(gen_random_uuid()::text, '-', ''),
        attempt_started_at = now()
    WHERE competition_id = p_competition AND user_id = v_uid
    RETURNING * INTO e;
  END IF;

  RETURN jsonb_build_object(
    'attempt_id', e.attempt_id,
    'competition_id', c.id,
    'format', c.format,
    'rerolls_allowed', c.rerolls_allowed,
    'ends_at', c.ends_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_circuit_run(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_circuit_run(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Record the official entry when its verified run lands (once, before the deadline)
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
  -- Serialize with circuit_settle (which holds FOR UPDATE on the competition).
  PERFORM 1 FROM public.circuit_competitions WHERE id = v_comp FOR SHARE;
  UPDATE public.circuit_entries e
  SET run_id = NEW.id,
      run_value = NEW.verified_value,
      submitted_at = NEW.achieved_at
  FROM public.circuit_competitions c
  WHERE e.attempt_id = NEW.client_run_id
    AND e.user_id = NEW.user_id
    AND e.run_value IS NULL
    AND c.id = e.competition_id
    AND c.status = 'open'
    AND NEW.achieved_at <= c.ends_at;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.circuit_record_run() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS circuit_record_run_trg ON public.user_leaderboard_runs;
CREATE TRIGGER circuit_record_run_trg
  AFTER INSERT ON public.user_leaderboard_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.circuit_record_run();
