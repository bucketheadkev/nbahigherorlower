-- Franchise Ownership v2 + My Rank (2026-10-24).
-- Requires 20261024_1_franchises.sql. Paste 20261024_4_franchise_seed.sql right after this file.
--
-- Franchises
--   * One franchise per player. Buying another requires selling the current one first.
--   * A locked 48-hour lineup earns an hourly rate for every completed hour (server clock, works
--     offline) plus a completion bonus at the final hour. Terms are snapshotted at lock:
--       cycle total = price paid × payout_bps(lineup value) / 10,000   (8%–15% by default)
--       hourly      = 70% of the total ÷ 48, rounded down to $10;  bonus = the remainder
--   * Earned money waits indefinitely and is paid by collect_earnings() — each hour once
--     (ledger key cycle:h<from>-<to>, guarded by hours_paid under a row lock) and the bonus once
--     (ledger key = cycle id). Drafting again requires the finished cycle to be collected.
--   * Selling pays resale_bps of the price paid (80% by default), settles every completed hour
--     (and the bonus if the cycle had already finished), ends the cycle, and forfeits only
--     the remaining hours and an unfinished cycle's bonus. Resale < 100%, so loops lose Cash.
--   * Migration of multi-franchise owners: the franchise with the most valuable live cycle is
--     kept. Every other franchise is refunded at 100% of its price, any old-rules paycheck it was
--     earning is paid in full now, and each refund is listed in the next earnings summary.
--     Old-rules cycles on the kept franchise convert to hourly + bonus with the same total.
--
-- My Rank
--   * Seven ranks from permanent records only: best verified Classic run, verified $1B runs,
--     completed achievements. Never Bank balance, purchases, or franchise income.
--   * user_rank.level only moves up. Each rank's reward posts once (ledger key rank:<level>);
--     rewards earned before this migration are paid through the same summary, never twice.
--
-- In-game Cash only. Apply manually in the Supabase SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Ledger kinds
-- ---------------------------------------------------------------------------

ALTER TABLE public.bank_ledger DROP CONSTRAINT IF EXISTS bank_ledger_kind_check;
ALTER TABLE public.bank_ledger ADD CONSTRAINT bank_ledger_kind_check CHECK (kind IN (
  'achievement',
  'classic_run_bonus',
  'cash_table_wager',
  'cash_table_payout',
  'cash_table_refund',
  'league_entry',
  'league_payout',
  'league_refund',
  'admin_adjustment',
  'franchise_purchase',
  'franchise_payout',
  'franchise_income',
  'franchise_sale',
  'rank_reward'
));

-- ---------------------------------------------------------------------------
-- Settings v2 (values come from 20261024_4_franchise_seed.sql)
-- ---------------------------------------------------------------------------

ALTER TABLE public.franchise_settings ALTER COLUMN max_active DROP NOT NULL;
ALTER TABLE public.franchise_settings ALTER COLUMN bonus_max DROP NOT NULL;
ALTER TABLE public.franchise_settings ALTER COLUMN bonus_floor DROP NOT NULL;
ALTER TABLE public.franchise_settings ALTER COLUMN bonus_full DROP NOT NULL;
ALTER TABLE public.franchise_settings ALTER COLUMN bonus_step DROP NOT NULL;
ALTER TABLE public.franchise_settings ADD COLUMN IF NOT EXISTS min_bps integer NOT NULL DEFAULT 800;
ALTER TABLE public.franchise_settings ADD COLUMN IF NOT EXISTS max_bps integer NOT NULL DEFAULT 1500;
ALTER TABLE public.franchise_settings ADD COLUMN IF NOT EXISTS value_floor bigint NOT NULL DEFAULT 750000000;
ALTER TABLE public.franchise_settings ADD COLUMN IF NOT EXISTS value_full bigint NOT NULL DEFAULT 1050000000;
ALTER TABLE public.franchise_settings ADD COLUMN IF NOT EXISTS hourly_share_bps integer NOT NULL DEFAULT 7000;
ALTER TABLE public.franchise_settings ADD COLUMN IF NOT EXISTS hourly_step integer NOT NULL DEFAULT 10;
ALTER TABLE public.franchise_settings ADD COLUMN IF NOT EXISTS resale_bps integer NOT NULL DEFAULT 8000;

ALTER TABLE public.franchise_settings DROP CONSTRAINT IF EXISTS franchise_settings_v2_check;
ALTER TABLE public.franchise_settings ADD CONSTRAINT franchise_settings_v2_check CHECK (
  min_bps >= 0 AND max_bps >= min_bps AND value_full > value_floor
  AND hourly_share_bps BETWEEN 0 AND 10000 AND hourly_step > 0
  AND resale_bps BETWEEN 0 AND 9999
);

INSERT INTO public.franchise_settings (id, cycle_hours) VALUES (true, 48) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.franchise_catalog ALTER COLUMN base_payout DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Ownership: purchase ids (so a team can be bought again after selling) + sale history
-- ---------------------------------------------------------------------------

ALTER TABLE public.franchise_ownership ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS franchise_ownership_id_uidx ON public.franchise_ownership (id);

CREATE TABLE IF NOT EXISTS public.franchise_sales (
  ownership_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  team_id text NOT NULL,
  price_paid bigint NOT NULL,
  proceeds bigint NOT NULL,
  income_paid bigint NOT NULL DEFAULT 0,
  reason text NOT NULL CHECK (reason IN ('sold', 'legacy_consolidation')),
  purchased_at timestamptz,
  sold_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

CREATE INDEX IF NOT EXISTS franchise_sales_user_idx ON public.franchise_sales (user_id, sold_at DESC);
ALTER TABLE public.franchise_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.franchise_sales FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cycles v2: snapshotted hourly terms; history survives a sale
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.franchise_cycles'::regclass
      AND contype = 'f'
      AND confrelid = 'public.franchise_ownership'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.franchise_cycles DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE public.franchise_cycles ADD COLUMN IF NOT EXISTS ownership_id uuid;
ALTER TABLE public.franchise_cycles ADD COLUMN IF NOT EXISTS price_basis bigint;
ALTER TABLE public.franchise_cycles ADD COLUMN IF NOT EXISTS payout_bps integer;
ALTER TABLE public.franchise_cycles ADD COLUMN IF NOT EXISTS cycle_total bigint;
ALTER TABLE public.franchise_cycles ADD COLUMN IF NOT EXISTS hourly_rate bigint;
ALTER TABLE public.franchise_cycles ADD COLUMN IF NOT EXISTS hours_total integer;
ALTER TABLE public.franchise_cycles ADD COLUMN IF NOT EXISTS completion_bonus bigint;
ALTER TABLE public.franchise_cycles ADD COLUMN IF NOT EXISTS hours_paid integer NOT NULL DEFAULT 0;
ALTER TABLE public.franchise_cycles ADD COLUMN IF NOT EXISTS bonus_paid boolean NOT NULL DEFAULT false;
ALTER TABLE public.franchise_cycles ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE public.franchise_cycles ADD COLUMN IF NOT EXISTS end_reason text;

ALTER TABLE public.franchise_cycles DROP CONSTRAINT IF EXISTS franchise_cycles_status_check;
ALTER TABLE public.franchise_cycles ADD CONSTRAINT franchise_cycles_status_check
  CHECK (status IN ('drafting', 'earning', 'collected', 'cancelled'));

UPDATE public.franchise_cycles c
SET ownership_id = o.id
FROM public.franchise_ownership o
WHERE c.ownership_id IS NULL AND o.user_id = c.user_id AND o.team_id = c.team_id;

-- ---------------------------------------------------------------------------
-- Legacy consolidation: one franchise per player
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  u record;
  o record;
  c record;
  v_keep uuid;
  v_paid bigint;
BEGIN
  FOR u IN
    SELECT user_id FROM public.franchise_ownership GROUP BY user_id HAVING count(*) > 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('franchise:' || u.user_id::text));

    SELECT o2.id INTO v_keep
    FROM public.franchise_ownership o2
    LEFT JOIN public.franchise_cycles oc
      ON oc.user_id = o2.user_id AND oc.team_id = o2.team_id AND oc.status IN ('drafting', 'earning')
    WHERE o2.user_id = u.user_id
    ORDER BY (oc.status = 'earning') DESC NULLS LAST,
             (oc.status = 'drafting') DESC NULLS LAST,
             o2.price_paid DESC,
             o2.purchased_at ASC
    LIMIT 1;

    FOR o IN
      SELECT * FROM public.franchise_ownership WHERE user_id = u.user_id AND id <> v_keep
    LOOP
      v_paid := 0;
      FOR c IN
        SELECT * FROM public.franchise_cycles
        WHERE user_id = u.user_id AND team_id = o.team_id AND status IN ('drafting', 'earning')
        FOR UPDATE
      LOOP
        IF c.status = 'earning' AND coalesce(c.payout, 0) > 0 AND c.hourly_rate IS NULL THEN
          -- Old rules promised this paycheck; pay it in full now (same key the old collect used).
          IF public.bank_post(u.user_id, c.payout, 'franchise_payout', c.id::text,
               jsonb_build_object('team_id', c.team_id, 'cycle_id', c.id, 'legacy_consolidation', true)) THEN
            v_paid := v_paid + c.payout;
          END IF;
          UPDATE public.franchise_cycles
          SET status = 'collected', collected_at = now(), ended_at = now(), end_reason = 'legacy_consolidation'
          WHERE id = c.id;
        ELSE
          UPDATE public.franchise_cycles
          SET status = 'cancelled', ended_at = now(), end_reason = 'legacy_consolidation'
          WHERE id = c.id;
        END IF;
      END LOOP;

      PERFORM public.bank_post(u.user_id, o.price_paid, 'franchise_sale', o.id::text,
        jsonb_build_object('team_id', o.team_id, 'legacy_consolidation', true, 'refund_bps', 10000));
      INSERT INTO public.franchise_sales (ownership_id, user_id, team_id, price_paid, proceeds, income_paid, reason, purchased_at)
      VALUES (o.id, u.user_id, o.team_id, o.price_paid, o.price_paid, v_paid, 'legacy_consolidation', o.purchased_at)
      ON CONFLICT (ownership_id) DO NOTHING;
      DELETE FROM public.franchise_ownership WHERE id = o.id;
    END LOOP;
  END LOOP;
END;
$$;

-- Old-rules cycles still earning: same promised total, now paid hourly + completion bonus.
UPDATE public.franchise_cycles c
SET price_basis = coalesce(o.price_paid, 0),
    cycle_total = c.payout,
    hours_total = greatest(1, round(extract(epoch FROM (c.ends_at - c.locked_at)) / 3600)::integer),
    hourly_rate = (c.payout * 7000 / 10000)
                  / greatest(1, round(extract(epoch FROM (c.ends_at - c.locked_at)) / 3600)::integer)
                  / 10 * 10,
    completion_bonus = c.payout - (
      (c.payout * 7000 / 10000)
      / greatest(1, round(extract(epoch FROM (c.ends_at - c.locked_at)) / 3600)::integer)
      / 10 * 10
    ) * greatest(1, round(extract(epoch FROM (c.ends_at - c.locked_at)) / 3600)::integer)
FROM public.franchise_ownership o
WHERE c.status = 'earning' AND c.hourly_rate IS NULL AND c.payout IS NOT NULL
  AND o.id = c.ownership_id;

DROP INDEX IF EXISTS public.franchise_cycles_open_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS franchise_cycles_one_open_uidx
  ON public.franchise_cycles (user_id) WHERE status IN ('drafting', 'earning');
CREATE UNIQUE INDEX IF NOT EXISTS franchise_ownership_one_per_user_uidx
  ON public.franchise_ownership (user_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.franchise_player_slug(p_player_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT regexp_replace(p_player_id, '^hist_[0-9]{4}s_[A-Za-z]+_', ''); $$;

CREATE OR REPLACE FUNCTION public.franchise_payout_bps(p_value bigint)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.min_bps + (
           (s.max_bps - s.min_bps)::bigint
           * least(greatest(p_value - s.value_floor, 0), s.value_full - s.value_floor)
           / (s.value_full - s.value_floor)
         )::integer
  FROM public.franchise_settings s
  WHERE s.id;
$$;

CREATE OR REPLACE FUNCTION public.franchise_hours_earned(c public.franchise_cycles)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN c.locked_at IS NULL OR c.ends_at IS NULL OR c.hours_total IS NULL THEN 0
    ELSE least(
      c.hours_total,
      greatest(0, floor(extract(epoch FROM (least(coalesce(c.ended_at, now()), c.ends_at) - c.locked_at)) / 3600)::integer)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.franchise_bonus_earned(c public.franchise_cycles)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT c.ends_at IS NOT NULL AND now() >= c.ends_at AND (c.ended_at IS NULL OR c.ended_at >= c.ends_at);
$$;

CREATE OR REPLACE FUNCTION public.franchise_cycle_json(c public.franchise_cycles)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'team_id', c.team_id,
    'status', CASE
                WHEN c.status = 'earning' AND now() >= c.ends_at THEN 'complete'
                ELSE c.status
              END,
    'picks', c.picks,
    'spin', CASE WHEN c.spin_team IS NULL THEN NULL
                 ELSE jsonb_build_object('team_id', c.spin_team, 'era', c.spin_era) END,
    'spins', c.spins,
    'lineup_value', c.lineup_value,
    'price_basis', c.price_basis,
    'payout_bps', c.payout_bps,
    'cycle_total', c.cycle_total,
    'hourly_rate', c.hourly_rate,
    'hours_total', c.hours_total,
    'hours_earned', public.franchise_hours_earned(c),
    'hours_paid', c.hours_paid,
    'completion_bonus', c.completion_bonus,
    'bonus_earned', public.franchise_bonus_earned(c),
    'bonus_paid', c.bonus_paid,
    'unpaid', CASE WHEN c.status <> 'earning' THEN 0 ELSE
      greatest(public.franchise_hours_earned(c) - c.hours_paid, 0)::bigint * coalesce(c.hourly_rate, 0)
      + CASE WHEN NOT c.bonus_paid AND public.franchise_bonus_earned(c) THEN coalesce(c.completion_bonus, 0) ELSE 0 END
    END,
    'locked_at', c.locked_at,
    'ends_at', c.ends_at
  );
$$;

REVOKE ALL ON FUNCTION public.franchise_player_slug(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_payout_bps(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_hours_earned(public.franchise_cycles) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_bonus_earned(public.franchise_cycles) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_cycle_json(public.franchise_cycles) FROM PUBLIC, anon, authenticated;

-- Pay every completed, unpaid hour (and the bonus once earned). Caller holds the user lock.
CREATE OR REPLACE FUNCTION public.franchise_settle(p_cycle uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  c public.franchise_cycles%ROWTYPE;
  v_earned integer;
  v_from integer;
  v_hours integer := 0;
  v_income bigint := 0;
  v_bonus bigint := 0;
  v_bonus_due boolean;
  v_done boolean;
BEGIN
  SELECT * INTO c FROM public.franchise_cycles WHERE id = p_cycle FOR UPDATE;
  IF NOT FOUND OR c.status <> 'earning' THEN
    RETURN jsonb_build_object('cycle_id', p_cycle, 'team_id', c.team_id, 'hours', 0, 'income', 0, 'bonus', 0);
  END IF;

  v_earned := public.franchise_hours_earned(c);
  IF v_earned > c.hours_paid AND coalesce(c.hourly_rate, 0) > 0 THEN
    v_from := c.hours_paid + 1;
    IF public.bank_post(c.user_id, (v_earned - c.hours_paid)::bigint * c.hourly_rate, 'franchise_income',
         c.id::text || ':h' || v_from || '-' || v_earned,
         jsonb_build_object('team_id', c.team_id, 'cycle_id', c.id, 'from_hour', v_from, 'to_hour', v_earned,
                            'hourly_rate', c.hourly_rate)) THEN
      v_hours := v_earned - c.hours_paid;
      v_income := v_hours::bigint * c.hourly_rate;
    END IF;
  END IF;

  v_bonus_due := NOT c.bonus_paid AND public.franchise_bonus_earned(c);
  IF v_bonus_due AND coalesce(c.completion_bonus, 0) > 0 THEN
    IF public.bank_post(c.user_id, c.completion_bonus, 'franchise_payout', c.id::text,
         jsonb_build_object('team_id', c.team_id, 'cycle_id', c.id, 'completion_bonus', true,
                            'lineup_value', c.lineup_value)) THEN
      v_bonus := c.completion_bonus;
    END IF;
  END IF;

  v_done := greatest(c.hours_paid, v_earned) >= c.hours_total AND (c.bonus_paid OR v_bonus_due);
  UPDATE public.franchise_cycles
  SET hours_paid = greatest(hours_paid, v_earned),
      bonus_paid = bonus_paid OR v_bonus_due,
      status = CASE WHEN v_done THEN 'collected' ELSE status END,
      collected_at = CASE WHEN v_done THEN now() ELSE collected_at END,
      end_reason = CASE WHEN v_done THEN coalesce(end_reason, 'completed') ELSE end_reason END
  WHERE id = c.id;

  RETURN jsonb_build_object('cycle_id', c.id, 'team_id', c.team_id, 'hours', v_hours, 'income', v_income, 'bonus', v_bonus);
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_settle(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_franchises()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  s public.franchise_settings%ROWTYPE;
  o public.franchise_ownership%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.franchise_settings WHERE id;
  IF v_uid IS NOT NULL THEN
    SELECT * INTO o FROM public.franchise_ownership WHERE user_id = v_uid;
  END IF;
  RETURN jsonb_build_object(
    'server_time', now(),
    'settings', jsonb_build_object(
      'cycle_hours', s.cycle_hours,
      'min_bps', s.min_bps,
      'max_bps', s.max_bps,
      'value_floor', s.value_floor,
      'value_full', s.value_full,
      'hourly_share_bps', s.hourly_share_bps,
      'hourly_step', s.hourly_step,
      'resale_bps', s.resale_bps
    ),
    'owned', CASE WHEN o.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'team_id', o.team_id,
      'price_paid', o.price_paid,
      'purchased_at', o.purchased_at,
      'resale_value', o.price_paid * s.resale_bps / 10000
    ) END,
    'cycle', CASE WHEN v_uid IS NULL THEN NULL ELSE (
      SELECT public.franchise_cycle_json(c) FROM public.franchise_cycles c
      WHERE c.user_id = v_uid AND c.status IN ('drafting', 'earning')
      LIMIT 1
    ) END,
    'franchises', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'team_id', cat.team_id,
        'name', cat.name,
        'championships', cat.championships,
        'price', cat.price
      ) ORDER BY cat.sort, cat.team_id)
      FROM public.franchise_catalog cat
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_franchises() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_franchises() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Buy / sell
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.buy_franchise(p_team text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  cat public.franchise_catalog%ROWTYPE;
  o public.franchise_ownership%ROWTYPE;
  v_id uuid := gen_random_uuid();
BEGIN
  PERFORM public.franchise_lock_user(v_uid);
  SELECT * INTO cat FROM public.franchise_catalog WHERE team_id = p_team;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_franchise' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM public.franchise_ownership WHERE user_id = v_uid;
  IF FOUND THEN
    IF o.team_id = p_team THEN
      RETURN public.get_franchises(); -- double tap
    END IF;
    RAISE EXCEPTION 'already_own_one' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.bank_post(v_uid, -cat.price, 'franchise_purchase', v_id::text,
    jsonb_build_object('team_id', p_team, 'price', cat.price, 'ownership_id', v_id));
  INSERT INTO public.franchise_ownership (id, user_id, team_id, price_paid) VALUES (v_id, v_uid, p_team, cat.price);
  RETURN public.get_franchises();
END;
$$;

REVOKE ALL ON FUNCTION public.buy_franchise(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buy_franchise(text) TO authenticated;

-- Returns { snapshot, sale } — sale is null when the franchise was already sold (double tap).
CREATE OR REPLACE FUNCTION public.sell_franchise(p_team text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  o public.franchise_ownership%ROWTYPE;
  c public.franchise_cycles%ROWTYPE;
  v_resale integer;
  v_proceeds bigint;
  v_settle jsonb := jsonb_build_object('hours', 0, 'income', 0, 'bonus', 0);
  v_forfeit_hours integer := 0;
  v_forfeit_bonus bigint := 0;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);
  SELECT * INTO o FROM public.franchise_ownership WHERE user_id = v_uid AND team_id = p_team FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('snapshot', public.get_franchises(), 'sale', NULL);
  END IF;

  SELECT * INTO c FROM public.franchise_cycles
  WHERE user_id = v_uid AND status IN ('drafting', 'earning')
  FOR UPDATE;
  IF FOUND THEN
    IF c.status = 'drafting' THEN
      UPDATE public.franchise_cycles SET status = 'cancelled', ended_at = now(), end_reason = 'sold' WHERE id = c.id;
    ELSE
      -- Freeze the clock at the sale, pay what was earned, forfeit the rest.
      UPDATE public.franchise_cycles SET ended_at = least(now(), ends_at) WHERE id = c.id RETURNING * INTO c;
      v_forfeit_hours := c.hours_total - public.franchise_hours_earned(c);
      v_forfeit_bonus := CASE WHEN public.franchise_bonus_earned(c) THEN 0 ELSE coalesce(c.completion_bonus, 0) END;
      v_settle := public.franchise_settle(c.id);
      UPDATE public.franchise_cycles
      SET status = 'collected', collected_at = now(), end_reason = 'sold'
      WHERE id = c.id;
    END IF;
  END IF;

  SELECT resale_bps INTO v_resale FROM public.franchise_settings WHERE id;
  v_proceeds := o.price_paid * v_resale / 10000;
  PERFORM public.bank_post(v_uid, v_proceeds, 'franchise_sale', o.id::text,
    jsonb_build_object('team_id', o.team_id, 'price_paid', o.price_paid, 'resale_bps', v_resale));
  INSERT INTO public.franchise_sales (ownership_id, user_id, team_id, price_paid, proceeds, income_paid, reason, purchased_at, acknowledged_at)
  VALUES (o.id, v_uid, o.team_id, o.price_paid, v_proceeds,
          (v_settle ->> 'income')::bigint + (v_settle ->> 'bonus')::bigint, 'sold', o.purchased_at, now())
  ON CONFLICT (ownership_id) DO NOTHING;
  DELETE FROM public.franchise_ownership WHERE id = o.id;

  RETURN jsonb_build_object(
    'snapshot', public.get_franchises(),
    'sale', jsonb_build_object(
      'team_id', o.team_id,
      'proceeds', v_proceeds,
      'income', (v_settle ->> 'income')::bigint,
      'hours', (v_settle ->> 'hours')::integer,
      'bonus', (v_settle ->> 'bonus')::bigint,
      'forfeited_hours', v_forfeit_hours,
      'forfeited_bonus', v_forfeit_bonus
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sell_franchise(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sell_franchise(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Draft
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_franchise_draft(p_team text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  o public.franchise_ownership%ROWTYPE;
  c public.franchise_cycles%ROWTYPE;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);
  SELECT * INTO o FROM public.franchise_ownership WHERE user_id = v_uid AND team_id = p_team;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_owned' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.franchise_cycles WHERE user_id = v_uid AND status IN ('drafting', 'earning');
  IF FOUND THEN
    IF c.status = 'drafting' THEN
      RETURN public.get_franchises();
    END IF;
    IF now() < c.ends_at THEN
      RAISE EXCEPTION 'cycle_active' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'collect_first' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.franchise_cycles (user_id, team_id, ownership_id) VALUES (v_uid, p_team, o.id);
  RETURN public.get_franchises();
END;
$$;

REVOKE ALL ON FUNCTION public.start_franchise_draft(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_franchise_draft(text) TO authenticated;

-- Roll the next TEAM/ERA. A stored spin is returned unchanged (no rerolls, ever). The pair always
-- has an eligible player who isn't already in the lineup (same person across eras counts).
CREATE OR REPLACE FUNCTION public.franchise_spin(p_cycle uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  c public.franchise_cycles%ROWTYPE;
  v_open text[];
  v_slugs text[];
  v_team text;
  v_era text;
BEGIN
  SELECT * INTO c FROM public.franchise_cycles WHERE id = p_cycle AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF c.status <> 'drafting' THEN
    RAISE EXCEPTION 'not_drafting' USING ERRCODE = 'P0001';
  END IF;
  IF c.spin_team IS NOT NULL THEN
    RETURN public.franchise_cycle_json(c);
  END IF;
  IF jsonb_array_length(c.picks) >= 5 THEN
    RAISE EXCEPTION 'lineup_full' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(public.franchise_player_slug(p ->> 'player_id')), ARRAY[]::text[]) INTO v_slugs
  FROM jsonb_array_elements(c.picks) p;
  SELECT coalesce(array_agg(s), ARRAY[]::text[]) INTO v_open
  FROM unnest(ARRAY['PG', 'SG', 'SF', 'PF', 'C']) s
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.picks) p WHERE p ->> 'slot' = s);

  SELECT pairs.team_id, pairs.era INTO v_team, v_era
  FROM (
    SELECT DISTINCT pool.team_id, pool.era
    FROM public.franchise_player_pool pool
    WHERE pool.eligible && v_open
      AND NOT (public.franchise_player_slug(pool.player_id) = ANY (v_slugs))
  ) pairs
  ORDER BY gen_random_uuid()
  LIMIT 1;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'pool_unavailable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.franchise_cycles
  SET spin_team = v_team, spin_era = v_era, spins = spins + 1
  WHERE id = c.id
  RETURNING * INTO c;
  RETURN public.franchise_cycle_json(c);
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_spin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.franchise_spin(uuid) TO authenticated;

-- Seat one player from the current spin. Same rules as Classic: eligible seats only, 3% off an
-- alternate seat (priced by classic_seat_value), never the same person twice.
CREATE OR REPLACE FUNCTION public.franchise_pick(p_cycle uuid, p_player_id text, p_slot text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  c public.franchise_cycles%ROWTYPE;
  pool public.franchise_player_pool%ROWTYPE;
  v_slot text := upper(coalesce(p_slot, ''));
  v_value bigint;
BEGIN
  SELECT * INTO c FROM public.franchise_cycles WHERE id = p_cycle AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF c.status <> 'drafting' THEN
    RAISE EXCEPTION 'not_drafting' USING ERRCODE = 'P0001';
  END IF;
  IF c.spin_team IS NULL THEN
    RAISE EXCEPTION 'no_spin' USING ERRCODE = 'P0001';
  END IF;
  IF v_slot NOT IN ('PG', 'SG', 'SF', 'PF', 'C')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(c.picks) p WHERE p ->> 'slot' = v_slot)
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(c.picks) p
       WHERE public.franchise_player_slug(p ->> 'player_id') = public.franchise_player_slug(p_player_id)
     ) THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO pool FROM public.franchise_player_pool WHERE player_id = p_player_id;
  IF NOT FOUND OR pool.team_id <> c.spin_team OR pool.era <> c.spin_era OR NOT (v_slot = ANY (pool.eligible)) THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = '22023';
  END IF;

  v_value := public.classic_seat_value(p_player_id, v_slot);
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = '22023';
  END IF;

  UPDATE public.franchise_cycles
  SET picks = picks || jsonb_build_array(jsonb_build_object('slot', v_slot, 'player_id', p_player_id, 'value', v_value)),
      spin_team = NULL,
      spin_era = NULL
  WHERE id = c.id
  RETURNING * INTO c;
  RETURN public.franchise_cycle_json(c);
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_pick(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.franchise_pick(uuid, text, text) TO authenticated;

-- Move a drafted player to another open seat they can play (Classic's tap-to-move), repriced.
CREATE OR REPLACE FUNCTION public.franchise_move(p_cycle uuid, p_from text, p_to text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  c public.franchise_cycles%ROWTYPE;
  v_from text := upper(coalesce(p_from, ''));
  v_to text := upper(coalesce(p_to, ''));
  v_player text;
  v_value bigint;
BEGIN
  SELECT * INTO c FROM public.franchise_cycles WHERE id = p_cycle AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF c.status <> 'drafting' THEN
    RAISE EXCEPTION 'not_drafting' USING ERRCODE = 'P0001';
  END IF;
  SELECT p ->> 'player_id' INTO v_player FROM jsonb_array_elements(c.picks) p WHERE p ->> 'slot' = v_from;
  IF v_player IS NULL
     OR v_to NOT IN ('PG', 'SG', 'SF', 'PF', 'C')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(c.picks) p WHERE p ->> 'slot' = v_to)
     OR NOT EXISTS (SELECT 1 FROM public.franchise_player_pool WHERE player_id = v_player AND v_to = ANY (eligible)) THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = '22023';
  END IF;
  v_value := public.classic_seat_value(v_player, v_to);
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'invalid_pick' USING ERRCODE = '22023';
  END IF;

  UPDATE public.franchise_cycles
  SET picks = (
    SELECT jsonb_agg(CASE WHEN p ->> 'slot' = v_from
                          THEN jsonb_build_object('slot', v_to, 'player_id', v_player, 'value', v_value)
                          ELSE p END)
    FROM jsonb_array_elements(c.picks) p
  )
  WHERE id = c.id
  RETURNING * INTO c;
  RETURN public.franchise_cycle_json(c);
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_move(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.franchise_move(uuid, text, text) TO authenticated;

-- Lock all five and start the clock (server time). Earning terms are snapshotted here.
CREATE OR REPLACE FUNCTION public.confirm_franchise_lineup(p_cycle uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  c public.franchise_cycles%ROWTYPE;
  s public.franchise_settings%ROWTYPE;
  v_price bigint;
  v_total bigint;
  v_bps integer;
  v_cycle bigint;
  v_hourly bigint;
BEGIN
  SELECT * INTO c FROM public.franchise_cycles WHERE id = p_cycle AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF c.status <> 'drafting' THEN
    RETURN public.franchise_cycle_json(c);
  END IF;
  IF jsonb_array_length(c.picks) <> 5 THEN
    RAISE EXCEPTION 'lineup_incomplete' USING ERRCODE = 'P0001';
  END IF;
  SELECT price_paid INTO v_price FROM public.franchise_ownership WHERE user_id = v_uid AND team_id = c.team_id;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'not_owned' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO s FROM public.franchise_settings WHERE id;
  SELECT sum(public.classic_seat_value(p ->> 'player_id', p ->> 'slot'))::bigint INTO v_total
  FROM jsonb_array_elements(c.picks) p;
  v_bps := public.franchise_payout_bps(v_total);
  v_cycle := v_price * v_bps / 10000;
  v_hourly := (v_cycle * s.hourly_share_bps / 10000) / s.cycle_hours / s.hourly_step * s.hourly_step;

  UPDATE public.franchise_cycles
  SET status = 'earning',
      lineup_value = v_total,
      price_basis = v_price,
      payout_bps = v_bps,
      cycle_total = v_cycle,
      hourly_rate = v_hourly,
      hours_total = s.cycle_hours,
      completion_bonus = v_cycle - v_hourly * s.cycle_hours,
      payout = v_cycle,
      hours_paid = 0,
      bonus_paid = false,
      locked_at = now(),
      ends_at = now() + make_interval(hours => s.cycle_hours)
  WHERE id = c.id
  RETURNING * INTO c;
  RETURN public.franchise_cycle_json(c);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_franchise_lineup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_franchise_lineup(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- My Rank
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rank_requirements (
  level integer PRIMARY KEY CHECK (level BETWEEN 1 AND 20),
  rank_id text NOT NULL UNIQUE,
  name text NOT NULL,
  reward bigint NOT NULL CHECK (reward >= 0),
  best_run bigint NOT NULL DEFAULT 0,
  billion_runs integer NOT NULL DEFAULT 0,
  achievements integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.user_rank (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 0 CHECK (level >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rank_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_rank ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rank_requirements, public.user_rank FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rank_metrics(p_uid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT jsonb_build_object(
    'best_run', coalesce((SELECT verified_best FROM public.user_leaderboard_pb WHERE user_id = p_uid), 0),
    'billion_runs', (SELECT count(*) FROM public.user_leaderboard_runs WHERE user_id = p_uid AND verified_value >= 1000000000),
    'achievements', coalesce((
      SELECT count(DISTINCT a)
      FROM public.user_achievement_progress p, unnest(p.completed_ids) a
      WHERE p.user_id = p_uid AND public.achievement_cash_reward(a) > 0
    ), 0)
  );
$$;

-- Highest level whose requirements — and every level below it — are met.
CREATE OR REPLACE FUNCTION public.rank_level_for(p_metrics jsonb)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  r record;
  v_level integer := 0;
BEGIN
  FOR r IN SELECT * FROM public.rank_requirements ORDER BY level LOOP
    EXIT WHEN (p_metrics ->> 'best_run')::bigint < r.best_run
           OR (p_metrics ->> 'billion_runs')::integer < r.billion_runs
           OR (p_metrics ->> 'achievements')::integer < r.achievements;
    v_level := r.level;
  END LOOP;
  RETURN v_level;
END;
$$;

-- Raise (never lower) the stored rank. Returns the stored level.
CREATE OR REPLACE FUNCTION public.rank_sync(p_uid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_level integer := public.rank_level_for(public.rank_metrics(p_uid));
BEGIN
  INSERT INTO public.user_rank (user_id, level) VALUES (p_uid, v_level)
  ON CONFLICT (user_id) DO UPDATE
    SET level = greatest(public.user_rank.level, EXCLUDED.level),
        updated_at = CASE WHEN EXCLUDED.level > public.user_rank.level THEN now() ELSE public.user_rank.updated_at END
  RETURNING level INTO v_level;
  RETURN v_level;
END;
$$;

REVOKE ALL ON FUNCTION public.rank_metrics(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rank_level_for(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rank_sync(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_rank()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  v_level integer := public.rank_sync(v_uid);
BEGIN
  RETURN jsonb_build_object(
    'level', v_level,
    'metrics', public.rank_metrics(v_uid),
    'paid_levels', coalesce((
      SELECT jsonb_agg(split_part(source_ref, ':', 2)::integer ORDER BY split_part(source_ref, ':', 2)::integer)
      FROM public.bank_ledger
      WHERE user_id = v_uid AND kind = 'rank_reward'
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_rank() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_rank() TO authenticated;

-- ---------------------------------------------------------------------------
-- Earnings summary: everything waiting, then one collect that pays each item once
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
    SELECT 3, jsonb_build_object('kind', 'rank_reward', 'ref', 'rank:' || r.level, 'level', r.level,
                                 'rank_id', r.rank_id, 'amount', r.reward)
    FROM public.rank_requirements r
    JOIN public.user_rank u ON u.user_id = p_uid AND r.level <= u.level
    WHERE r.reward > 0 AND NOT EXISTS (
      SELECT 1 FROM public.bank_ledger l
      WHERE l.user_id = p_uid AND l.kind = 'rank_reward' AND l.source_ref = 'rank:' || r.level
    )
    UNION ALL
    SELECT 4, jsonb_build_object('kind', 'franchise_refund', 'ref', s.ownership_id, 'team_id', s.team_id,
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
  PERFORM public.rank_sync(v_uid);
  RETURN jsonb_build_object('server_time', now(), 'items', public.earnings_items(v_uid));
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_earnings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_earnings() TO authenticated;

-- Pays every pending item exactly once and returns what this call credited. A repeat call,
-- a second device, or a reopened summary finds nothing left and credits $0.
CREATE OR REPLACE FUNCTION public.collect_earnings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  v_level integer;
  c record;
  r record;
  s record;
  v_settle jsonb;
  v_items jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);
  v_level := public.rank_sync(v_uid);

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

  FOR r IN SELECT * FROM public.rank_requirements WHERE level <= v_level AND reward > 0 ORDER BY level LOOP
    IF public.bank_post(v_uid, r.reward, 'rank_reward', 'rank:' || r.level,
         jsonb_build_object('rank_id', r.rank_id, 'level', r.level)) THEN
      v_items := v_items || jsonb_build_object('kind', 'rank_reward', 'ref', 'rank:' || r.level,
        'level', r.level, 'rank_id', r.rank_id, 'amount', r.reward);
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

-- Old client entry point: same single settlement path.
CREATE OR REPLACE FUNCTION public.collect_franchise_paycheck(p_cycle uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  PERFORM public.collect_earnings();
  RETURN public.get_franchises();
END;
$$;

REVOKE ALL ON FUNCTION public.collect_franchise_paycheck(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.collect_franchise_paycheck(uuid) TO authenticated;
