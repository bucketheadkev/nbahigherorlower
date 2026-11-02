-- Franchise v5: chests, collection, starting five and fan paychecks (2026-11-01).
-- Requires every earlier franchise migration (20261024_1 … 20261025_4) and the Bank ledger.
-- Source of truth: lib/tradeup/franchise/config.ts, lib/tradeup/franchise/cards.ts and
-- lib/tradeup/ownership/config.ts (prices). The GENERATED block below comes from
-- scripts/generate-franchise-v5.ts — change the config, regenerate, re-apply.
--
--   * One franchise per account (unchanged). Buying still debits the Bank once; selling still
--     refunds resale_bps of the price paid. "Switch" = sell + buy in one transaction.
--   * Cards: every player version in franchise_player_pool has a card tier, a ranking score
--     (score_bp, 0–10,000) and fixed fans. Pulls never randomize fans.
--   * Chests: the free Starter Chest (once per account, five players, one per seat) and five
--     paid chests (one player each). Price, odds and the drawn players are decided here, the
--     Bank is debited once (ledger key = open id), and the result is stored before the app
--     animates it. Opens are idempotent per client request id and recoverable until revealed.
--   * Lineup: PG/SG/SF/PF/C, each a card the player owns, eligible for that seat, no player
--     twice. Replaced cards stay in the collection.
--   * Paychecks: every pay_period_hours (12) the franchise pays its time-weighted average
--     active fans × pay_ppm / 1,000,000 (10,000 → $0.01 per fan). Fan-seconds accrue on every
--     lineup change, so a swap just before payday only counts for the minutes it was active.
--     Each period posts once (ledger key = ownership id : period index), on any Franchise call
--     or from the earnings summary. Server clock only.
--   * Legacy rosters: open 48-hour cycles are paid in full now (earned + remaining hours), their
--     players become cards in the new lineup, and the Starter Chest is marked claimed for
--     anyone who already had a full five. Drafting the old way is retired.
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
  'rank_reward',
  'run_bonus',
  'franchise_chest',
  'franchise_paycheck'
));

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------

ALTER TABLE public.franchise_settings ADD COLUMN IF NOT EXISTS pay_period_hours integer NOT NULL DEFAULT 12;
ALTER TABLE public.franchise_settings ADD COLUMN IF NOT EXISTS pay_ppm integer NOT NULL DEFAULT 10000;
ALTER TABLE public.franchise_settings DROP CONSTRAINT IF EXISTS franchise_settings_v5_check;
ALTER TABLE public.franchise_settings ADD CONSTRAINT franchise_settings_v5_check
  CHECK (pay_period_hours > 0 AND pay_ppm >= 0);

ALTER TABLE public.franchise_player_pool ADD COLUMN IF NOT EXISTS card_tier text;
ALTER TABLE public.franchise_player_pool ADD COLUMN IF NOT EXISTS card_score_bp integer;
ALTER TABLE public.franchise_player_pool ADD COLUMN IF NOT EXISTS card_fans bigint;
ALTER TABLE public.franchise_player_pool DROP CONSTRAINT IF EXISTS franchise_player_pool_card_check;
ALTER TABLE public.franchise_player_pool ADD CONSTRAINT franchise_player_pool_card_check CHECK (
  card_tier IS NULL OR (
    card_tier IN ('pro', 'all_star', 'superstar', 'legend', 'goat')
    AND card_score_bp BETWEEN 0 AND 10000
    AND card_fans >= 0
  )
);
CREATE INDEX IF NOT EXISTS franchise_player_pool_card_idx
  ON public.franchise_player_pool (card_tier, card_score_bp) WHERE card_tier IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.franchise_chests (
  id text PRIMARY KEY CHECK (id IN ('starter', 'pro', 'all_star', 'superstar', 'legend', 'goat')),
  price bigint NOT NULL CHECK (price >= 0),
  picks integer NOT NULL CHECK (picks BETWEEN 1 AND 5),
  guarantee text NOT NULL,
  -- [{ "tier": "legend", "bps": 6000, "min_score_bp": 5000 }, …] — bps add up to 10,000
  odds jsonb NOT NULL,
  sort integer NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Per-account state
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.franchise_profile (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  intro_seen_at timestamptz,
  starter_claimed_at timestamptz,
  starter_open_id uuid,
  legacy_imported_at timestamptz
);

-- The collection. One row per card owned (the same player version can be owned twice).
CREATE TABLE IF NOT EXISTS public.franchise_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  player_id text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('pro', 'all_star', 'superstar', 'legend', 'goat')),
  fans bigint NOT NULL CHECK (fans >= 0),
  source text NOT NULL CHECK (source IN ('starter', 'chest', 'legacy')),
  open_id uuid,
  acquired_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS franchise_cards_user_idx ON public.franchise_cards (user_id, acquired_at DESC);

CREATE TABLE IF NOT EXISTS public.franchise_lineup (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  slot text NOT NULL CHECK (slot IN ('PG', 'SG', 'SF', 'PF', 'C')),
  card_id uuid NOT NULL REFERENCES public.franchise_cards (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, slot),
  CONSTRAINT franchise_lineup_card_once UNIQUE (card_id)
);

CREATE TABLE IF NOT EXISTS public.franchise_chest_opens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 8 AND 80),
  chest_id text NOT NULL,
  price bigint NOT NULL,
  -- [{ "card_id", "player_id", "tier", "fans", "slot" }]
  cards jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revealed_at timestamptz,
  CONSTRAINT franchise_chest_opens_request UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS franchise_chest_opens_user_idx ON public.franchise_chest_opens (user_id, created_at DESC);

-- Paycheck clock for the owned franchise.
CREATE TABLE IF NOT EXISTS public.franchise_pay (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  ownership_id uuid NOT NULL,
  team_id text NOT NULL,
  period_start timestamptz NOT NULL,
  periods_paid integer NOT NULL DEFAULT 0,
  -- Fan-seconds accrued in the current period up to last_at; `fans` has been active since then.
  last_at timestamptz NOT NULL,
  fans bigint NOT NULL DEFAULT 0,
  fan_seconds numeric NOT NULL DEFAULT 0
);

ALTER TABLE public.franchise_chests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_lineup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_chest_opens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_pay ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.franchise_chests, public.franchise_profile, public.franchise_cards,
  public.franchise_lineup, public.franchise_chest_opens, public.franchise_pay FROM PUBLIC, anon, authenticated;

-- BEGIN GENERATED FRANCHISE V5 DATA (scripts/generate-franchise-v5.ts — do not edit by hand)
UPDATE public.franchise_settings SET pay_period_hours = 12, pay_ppm = 10000 WHERE id;

INSERT INTO public.franchise_chests (id, price, picks, guarantee, odds, sort) VALUES
  ('starter', 0, 5, 'pro', '[{"tier":"pro","bps":7000,"min_score_bp":0},{"tier":"all_star","bps":2500,"min_score_bp":0},{"tier":"superstar","bps":400,"min_score_bp":0},{"tier":"legend","bps":100,"min_score_bp":0}]'::jsonb, 0),
  ('pro', 5000000, 1, 'pro', '[{"tier":"pro","bps":8000,"min_score_bp":0},{"tier":"all_star","bps":1800,"min_score_bp":0},{"tier":"superstar","bps":200,"min_score_bp":0}]'::jsonb, 1),
  ('all_star', 12000000, 1, 'all_star', '[{"tier":"all_star","bps":7200,"min_score_bp":0},{"tier":"superstar","bps":2500,"min_score_bp":0},{"tier":"legend","bps":300,"min_score_bp":0}]'::jsonb, 2),
  ('superstar', 30000000, 1, 'superstar', '[{"tier":"superstar","bps":7800,"min_score_bp":0},{"tier":"legend","bps":2000,"min_score_bp":0},{"tier":"goat","bps":200,"min_score_bp":0}]'::jsonb, 3),
  ('legend', 70000000, 1, 'legend', '[{"tier":"legend","bps":9000,"min_score_bp":0},{"tier":"goat","bps":1000,"min_score_bp":0}]'::jsonb, 4),
  ('goat', 150000000, 1, 'legend', '[{"tier":"legend","bps":6000,"min_score_bp":5000},{"tier":"goat","bps":4000,"min_score_bp":0}]'::jsonb, 5)
ON CONFLICT (id) DO UPDATE
  SET price = EXCLUDED.price, picks = EXCLUDED.picks, guarantee = EXCLUDED.guarantee,
      odds = EXCLUDED.odds, sort = EXCLUDED.sort;

UPDATE public.franchise_catalog cat SET price = v.price, sort = v.sort
FROM (VALUES
  ('BOS', 200000000, 1),
  ('LAL', 190000000, 2),
  ('CHI', 170000000, 3),
  ('GSW', 165000000, 4),
  ('SAS', 140000000, 5),
  ('NYK', 125000000, 6),
  ('MIA', 120000000, 7),
  ('PHI', 110000000, 8),
  ('DET', 105000000, 9),
  ('HOU', 95000000, 10),
  ('MIL', 90000000, 11),
  ('OKC', 85000000, 12),
  ('DAL', 80000000, 13),
  ('CLE', 75000000, 14),
  ('DEN', 75000000, 15),
  ('TOR', 70000000, 16),
  ('PHX', 65000000, 17),
  ('ATL', 60000000, 18),
  ('POR', 60000000, 19),
  ('SAC', 55000000, 20),
  ('WAS', 55000000, 21),
  ('UTA', 50000000, 22),
  ('BKN', 45000000, 23),
  ('IND', 45000000, 24),
  ('LAC', 40000000, 25),
  ('ORL', 40000000, 26),
  ('MEM', 30000000, 27),
  ('CHA', 25000000, 28),
  ('MIN', 25000000, 29),
  ('NOP', 20000000, 30)
) AS v (team_id, price, sort)
WHERE cat.team_id = v.team_id;

UPDATE public.franchise_player_pool SET card_tier = NULL, card_score_bp = NULL, card_fans = NULL WHERE card_tier IS NOT NULL;
INSERT INTO public.franchise_player_pool (player_id, team_id, era, eligible, card_tier, card_score_bp, card_fans) VALUES
  ('hist_1960s_ATL_al_ferrari', 'ATL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 1168, 513000),
  ('hist_1960s_ATL_barney_cable', 'ATL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2565, 827000),
  ('hist_1960s_ATL_bill_bridges', 'ATL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3674, 6310000),
  ('hist_1960s_ATL_bob_ferry', 'ATL', '1960s', ARRAY['C', 'PF']::text[], 'pro', 239, 304000),
  ('hist_1960s_ATL_bob_pettit', 'ATL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 4607, 70700000),
  ('hist_1960s_ATL_bob_sims', 'ATL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 3280, 988000),
  ('hist_1960s_ATL_chico_vaughn', 'ATL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 3005, 926000),
  ('hist_1960s_ATL_chuck_share', 'ATL', '1960s', ARRAY['C', 'PF']::text[], 'pro', 138, 281000),
  ('hist_1960s_ATL_cleo_hill', 'ATL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 266, 310000),
  ('hist_1960s_ATL_cliff_hagan', 'ATL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2441, 22300000),
  ('hist_1960s_ATL_clyde_lovellette', 'ATL', '1960s', ARRAY['C', 'PF']::text[], 'superstar', 5699, 32100000),
  ('hist_1960s_ATL_dave_piontek', 'ATL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 98, 272000),
  ('hist_1960s_ATL_dick_snyder', 'ATL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 945, 463000),
  ('hist_1960s_ATL_don_ohl', 'ATL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 4744, 1320000),
  ('hist_1960s_ATL_fred_lacour', 'ATL', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1020, 480000),
  ('hist_1960s_ATL_jim_davis', 'ATL', '1960s', ARRAY['C', 'PF']::text[], 'pro', 876, 447000),
  ('hist_1960s_ATL_jim_washington', 'ATL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 561, 376000),
  ('hist_1960s_ATL_joe_caldwell', 'ATL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2480, 5230000),
  ('hist_1960s_ATL_john_barnhill', 'ATL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 2411, 792000),
  ('hist_1960s_ATL_john_tresvant', 'ATL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 732, 415000),
  ('hist_1960s_ATL_johnny_mccarthy', 'ATL', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 3166, 962000),
  ('hist_1960s_ATL_larry_foust', 'ATL', '1960s', ARRAY['C', 'PF']::text[], 'pro', 2542, 822000),
  ('hist_1960s_ATL_lenny_wilkens', 'ATL', '1960s', ARRAY['PG', 'SG']::text[], 'all_star', 5692, 8120000),
  ('hist_1960s_ATL_lou_hudson', 'ATL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 681, 17000000),
  ('hist_1960s_ATL_mike_farmer', 'ATL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 840, 439000),
  ('hist_1960s_ATL_paul_silas', 'ATL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2982, 921000),
  ('hist_1960s_ATL_phil_jordon', 'ATL', '1960s', ARRAY['C', 'PF']::text[], 'pro', 866, 445000),
  ('hist_1960s_ATL_richie_guerin', 'ATL', '1960s', ARRAY['SG', 'PG']::text[], 'all_star', 489, 3440000),
  ('hist_1960s_ATL_rod_thorn', 'ATL', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1758, 646000),
  ('hist_1960s_ATL_shellie_mcmillon', 'ATL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4711, 1310000),
  ('hist_1960s_ATL_si_green', 'ATL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 2047, 711000),
  ('hist_1960s_ATL_slater_martin', 'ATL', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1621, 615000),
  ('hist_1960s_ATL_stacey_arceneaux', 'ATL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1014, 478000),
  ('hist_1960s_ATL_vern_hatton', 'ATL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 961, 466000),
  ('hist_1960s_ATL_walt_hazzard', 'ATL', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 5383, 1460000),
  ('hist_1960s_ATL_woody_sauldsberry', 'ATL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1624, 615000),
  ('hist_1960s_ATL_zelmo_beaty', 'ATL', '1960s', ARRAY['C', 'PF']::text[], 'superstar', 2246, 21700000),
  ('hist_1960s_BOS_al_butler', 'BOS', '1960s', ARRAY['SG', 'SF', 'PF']::text[], 'pro', 171, 288000),
  ('hist_1960s_BOS_bailey_howell', 'BOS', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3793, 26400000),
  ('hist_1960s_BOS_bill_russell', 'BOS', '1960s', ARRAY['C', 'PF']::text[], 'legend', 6789, 80600000),
  ('hist_1960s_BOS_bill_sharman', 'BOS', '1960s', ARRAY['SG', 'PG']::text[], 'all_star', 5620, 8060000),
  ('hist_1960s_BOS_bob_cousy', 'BOS', '1960s', ARRAY['PG', 'SG']::text[], 'superstar', 2052, 21200000),
  ('hist_1960s_BOS_clyde_lovellette', 'BOS', '1960s', ARRAY['C', 'PF']::text[], 'pro', 321, 322000),
  ('hist_1960s_BOS_don_nelson', 'BOS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3103, 948000),
  ('hist_1960s_BOS_em_bryant', 'BOS', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 243, 305000),
  ('hist_1960s_BOS_frank_ramsey', 'BOS', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 5298, 1440000),
  ('hist_1960s_BOS_gene_conley', 'BOS', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1443, 575000),
  ('hist_1960s_BOS_john_havlicek', 'BOS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5693, 32100000),
  ('hist_1960s_BOS_k_c_jones', 'BOS', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 2549, 824000),
  ('hist_1960s_BOS_larry_siegfried', 'BOS', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 4458, 1250000),
  ('hist_1960s_BOS_maury_king', 'BOS', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 3366, 1010000),
  ('hist_1960s_BOS_mel_counts', 'BOS', '1960s', ARRAY['C', 'PF']::text[], 'pro', 1079, 493000),
  ('hist_1960s_BOS_sam_jones', 'BOS', '1960s', ARRAY['SG', 'PG']::text[], 'superstar', 1964, 20900000),
  ('hist_1960s_BOS_tom_heinsohn', 'BOS', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3073, 24200000),
  ('hist_1960s_BOS_tom_sanders', 'BOS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4314, 1220000),
  ('hist_1960s_BOS_wayne_embry', 'BOS', '1960s', ARRAY['C', 'PF']::text[], 'pro', 253, 307000),
  ('hist_1960s_BOS_willie_naulls', 'BOS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3231, 977000),
  ('hist_1960s_CHI_barry_clemens', 'CHI', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1532, 595000),
  ('hist_1960s_CHI_bob_boozer', 'CHI', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4318, 28000000),
  ('hist_1960s_CHI_bob_weiss', 'CHI', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 827, 436000),
  ('hist_1960s_CHI_clem_haskins', 'CHI', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 5577, 1500000),
  ('hist_1960s_CHI_dave_newmark', 'CHI', '1960s', ARRAY['C', 'PF']::text[], 'pro', 259, 308000),
  ('hist_1960s_CHI_don_kojis', 'CHI', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3727, 1090000),
  ('hist_1960s_CHI_erwin_mueller', 'CHI', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2759, 871000),
  ('hist_1960s_CHI_flynn_robinson', 'CHI', '1960s', ARRAY['PG', 'SG']::text[], 'all_star', 4299, 6870000),
  ('hist_1960s_CHI_guy_rodgers', 'CHI', '1960s', ARRAY['PG', 'SG']::text[], 'superstar', 4872, 29600000),
  ('hist_1960s_CHI_jerry_sloan', 'CHI', '1960s', ARRAY['SG', 'PG']::text[], 'all_star', 5937, 8340000),
  ('hist_1960s_CHI_jim_barnes', 'CHI', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1535, 595000),
  ('hist_1960s_CHI_jim_washington', 'CHI', '1960s', ARRAY['C', 'PF']::text[], 'pro', 5265, 1430000),
  ('hist_1960s_CHI_keith_erickson', 'CHI', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3927, 1130000),
  ('hist_1960s_CHI_mccoy_mclemore', 'CHI', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3822, 1110000),
  ('hist_1960s_CHI_reggie_harding', 'CHI', '1960s', ARRAY['C', 'PF']::text[], 'pro', 420, 345000),
  ('hist_1960s_CHI_tom_boerwinkle', 'CHI', '1960s', ARRAY['C', 'PF']::text[], 'pro', 5232, 1430000),
  ('hist_1960s_DET_archie_dees', 'DET', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1811, 657000),
  ('hist_1960s_DET_bailey_howell', 'DET', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 670, 53000000),
  ('hist_1960s_DET_barney_cable', 'DET', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1634, 618000),
  ('hist_1960s_DET_bill_buntin', 'DET', '1960s', ARRAY['C', 'PF']::text[], 'pro', 1880, 673000),
  ('hist_1960s_DET_bob_ferry', 'DET', '1960s', ARRAY['C', 'PF']::text[], 'pro', 5314, 1450000),
  ('hist_1960s_DET_chico_vaughn', 'DET', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 20, 255000),
  ('hist_1960s_DET_chuck_noble', 'DET', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 2004, 701000),
  ('hist_1960s_DET_dave_bing', 'DET', '1960s', ARRAY['PG', 'SG']::text[], 'legend', 1098, 54900000),
  ('hist_1960s_DET_dave_debusschere', 'DET', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1634, 19900000),
  ('hist_1960s_DET_dave_gambee', 'DET', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 459, 353000),
  ('hist_1960s_DET_dick_mcguire', 'DET', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 2792, 878000),
  ('hist_1960s_DET_don_kojis', 'DET', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 830, 437000),
  ('hist_1960s_DET_don_ohl', 'DET', '1960s', ARRAY['SG', 'PG']::text[], 'all_star', 4281, 6850000),
  ('hist_1960s_DET_donnie_butcher', 'DET', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1191, 518000),
  ('hist_1960s_DET_earl_lloyd', 'DET', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2414, 793000),
  ('hist_1960s_DET_ed_conlin', 'DET', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 4215, 1200000),
  ('hist_1960s_DET_eddie_miles', 'DET', '1960s', ARRAY['SG', 'PG']::text[], 'all_star', 1086, 3980000),
  ('hist_1960s_DET_gene_shue', 'DET', '1960s', ARRAY['PG', 'SG']::text[], 'superstar', 5533, 31600000),
  ('hist_1960s_DET_george_lee', 'DET', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3294, 991000),
  ('hist_1960s_DET_happy_hairston', 'DET', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3112, 24300000),
  ('hist_1960s_DET_howard_komives', 'DET', '1960s', ARRAY['PG', 'SG']::text[], 'all_star', 253, 3230000),
  ('hist_1960s_DET_jackie_moreland', 'DET', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1660, 624000),
  ('hist_1960s_DET_jimmy_walker', 'DET', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 3008, 927000),
  ('hist_1960s_DET_joe_caldwell', 'DET', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4416, 1240000),
  ('hist_1960s_DET_joe_strawder', 'DET', '1960s', ARRAY['C', 'PF']::text[], 'pro', 3779, 1100000),
  ('hist_1960s_DET_john_barnhill', 'DET', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1306, 544000),
  ('hist_1960s_DET_john_tresvant', 'DET', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4655, 1300000),
  ('hist_1960s_DET_johnny_egan', 'DET', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 627, 391000),
  ('hist_1960s_DET_kevin_loughery', 'DET', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 325, 323000),
  ('hist_1960s_DET_larry_staverman', 'DET', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 82, 268000),
  ('hist_1960s_DET_len_chappell', 'DET', '1960s', ARRAY['C', 'PF']::text[], 'pro', 3474, 1030000),
  ('hist_1960s_DET_mccoy_mclemore', 'DET', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1188, 517000),
  ('hist_1960s_DET_otto_moore', 'DET', '1960s', ARRAY['C', 'PF']::text[], 'pro', 2090, 720000),
  ('hist_1960s_DET_ray_scott', 'DET', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1147, 18400000),
  ('hist_1960s_DET_reggie_harding', 'DET', '1960s', ARRAY['C', 'PF']::text[], 'pro', 4320, 1220000),
  ('hist_1960s_DET_rod_thorn', 'DET', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 4475, 1260000),
  ('hist_1960s_DET_ron_reed', 'DET', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2437, 798000),
  ('hist_1960s_DET_shellie_mcmillon', 'DET', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2765, 872000),
  ('hist_1960s_DET_terry_dischinger', 'DET', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5846, 1570000),
  ('hist_1960s_DET_tom_van_arsdale', 'DET', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 3533, 1040000),
  ('hist_1960s_DET_tony_windis', 'DET', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 590, 383000),
  ('hist_1960s_DET_walt_bellamy', 'DET', '1960s', ARRAY['C', 'PF']::text[], 'superstar', 4775, 29300000),
  ('hist_1960s_DET_walter_dukes', 'DET', '1960s', ARRAY['C', 'PF']::text[], 'pro', 5226, 1430000),
  ('hist_1960s_DET_wayne_hightower', 'DET', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2428, 796000),
  ('hist_1960s_DET_willie_jones', 'DET', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1148, 508000),
  ('hist_1960s_GSW_al_attles', 'GSW', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 3543, 1050000),
  ('hist_1960s_GSW_andy_johnson', 'GSW', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2621, 840000),
  ('hist_1960s_GSW_bill_turner', 'GSW', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 676, 402000),
  ('hist_1960s_GSW_bob_warlick', 'GSW', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 1673, 626000),
  ('hist_1960s_GSW_clyde_lee', 'GSW', '1960s', ARRAY['C', 'PF']::text[], 'pro', 5229, 1430000),
  ('hist_1960s_GSW_connie_dierking', 'GSW', '1960s', ARRAY['C', 'PF']::text[], 'pro', 2313, 770000),
  ('hist_1960s_GSW_dale_schlueter', 'GSW', '1960s', ARRAY['C', 'PF']::text[], 'pro', 1096, 497000),
  ('hist_1960s_GSW_ed_conlin', 'GSW', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 197, 294000),
  ('hist_1960s_GSW_fred_hetzel', 'GSW', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5921, 1580000),
  ('hist_1960s_GSW_gary_phillips', 'GSW', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 1151, 509000),
  ('hist_1960s_GSW_guy_rodgers', 'GSW', '1960s', ARRAY['PG', 'SG']::text[], 'all_star', 4887, 7400000),
  ('hist_1960s_GSW_howie_montgomery', 'GSW', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 833, 437000),
  ('hist_1960s_GSW_jeff_mullins', 'GSW', '1960s', ARRAY['SG', 'PG']::text[], 'superstar', 2159, 21500000),
  ('hist_1960s_GSW_jim_king', 'GSW', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 5137, 1410000),
  ('hist_1960s_GSW_joe_ellis', 'GSW', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1581, 606000),
  ('hist_1960s_GSW_joe_graboski', 'GSW', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1194, 519000),
  ('hist_1960s_GSW_john_rudometkin', 'GSW', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 354, 330000),
  ('hist_1960s_GSW_mccoy_mclemore', 'GSW', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2054, 712000),
  ('hist_1960s_GSW_nate_thurmond', 'GSW', '1960s', ARRAY['C', 'PF']::text[], 'superstar', 4532, 28600000),
  ('hist_1960s_GSW_paul_arizin', 'GSW', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 375, 51700000),
  ('hist_1960s_GSW_paul_neumann', 'GSW', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 5761, 1550000),
  ('hist_1960s_GSW_rick_barry', 'GSW', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4527, 70400000),
  ('hist_1960s_GSW_ron_williams', 'GSW', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1670, 626000),
  ('hist_1960s_GSW_rudy_larusso', 'GSW', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5115, 30300000),
  ('hist_1960s_GSW_tom_gola', 'GSW', '1960s', ARRAY['SG', 'PG']::text[], 'all_star', 5548, 7990000),
  ('hist_1960s_GSW_tom_meschery', 'GSW', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 597, 3540000),
  ('hist_1960s_GSW_wayne_hightower', 'GSW', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3736, 1090000),
  ('hist_1960s_GSW_willie_naulls', 'GSW', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4412, 1240000),
  ('hist_1960s_GSW_wilt_chamberlain', 'GSW', '1960s', ARRAY['C']::text[], 'goat', 2250, 118000000),
  ('hist_1960s_GSW_woody_sauldsberry', 'GSW', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3756, 1100000),
  ('hist_1960s_HOU_art_williams', 'HOU', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 3340, 1000000),
  ('hist_1960s_HOU_dave_gambee', 'HOU', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5642, 1520000),
  ('hist_1960s_HOU_don_kojis', 'HOU', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5718, 32200000),
  ('hist_1960s_HOU_elvin_hayes', 'HOU', '1960s', ARRAY['C', 'PF']::text[], 'legend', 4580, 70600000),
  ('hist_1960s_HOU_hank_finkel', 'HOU', '1960s', ARRAY['C', 'PF']::text[], 'pro', 2290, 765000),
  ('hist_1960s_HOU_jim_barnett', 'HOU', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 5646, 1520000),
  ('hist_1960s_HOU_john_barnhill', 'HOU', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 3228, 976000),
  ('hist_1960s_HOU_john_block', 'HOU', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1468, 19400000),
  ('hist_1960s_HOU_johnny_green', 'HOU', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3167, 5850000),
  ('hist_1960s_HOU_jon_mcglocklin', 'HOU', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 4681, 1300000),
  ('hist_1960s_HOU_pat_riley', 'HOU', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 1293, 541000),
  ('hist_1960s_HOU_rick_adelman', 'HOU', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1007, 477000),
  ('hist_1960s_HOU_stu_lantz', 'HOU', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 1165, 512000),
  ('hist_1960s_HOU_toby_kimball', 'HOU', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4662, 1300000),
  ('hist_1960s_LAL_archie_clark', 'LAL', '1960s', ARRAY['PG', 'SG']::text[], 'all_star', 2905, 5610000),
  ('hist_1960s_LAL_bill_hewitt', 'LAL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1046, 485000),
  ('hist_1960s_LAL_bob_boozer', 'LAL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5200, 1420000),
  ('hist_1960s_LAL_darrall_imhoff', 'LAL', '1960s', ARRAY['C', 'PF']::text[], 'pro', 3359, 1010000),
  ('hist_1960s_LAL_dick_barnett', 'LAL', '1960s', ARRAY['SG', 'PG']::text[], 'all_star', 3846, 6460000),
  ('hist_1960s_LAL_dick_garmaker', 'LAL', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 4924, 1360000),
  ('hist_1960s_LAL_ed_fleming', 'LAL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 502, 363000),
  ('hist_1960s_LAL_elgin_baylor', 'LAL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 7354, 83100000),
  ('hist_1960s_LAL_erwin_mueller', 'LAL', '1960s', ARRAY['C', 'PF']::text[], 'pro', 2555, 825000),
  ('hist_1960s_LAL_frank_selvy', 'LAL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 4022, 1150000),
  ('hist_1960s_LAL_freddie_crawford', 'LAL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 1158, 511000),
  ('hist_1960s_LAL_gail_goodrich', 'LAL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 3992, 1150000),
  ('hist_1960s_LAL_gene_wiley', 'LAL', '1960s', ARRAY['C', 'PF']::text[], 'pro', 315, 321000),
  ('hist_1960s_LAL_hot_rod_hundley', 'LAL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 2723, 863000),
  ('hist_1960s_LAL_jerry_chambers', 'LAL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 745, 418000),
  ('hist_1960s_LAL_jerry_west', 'LAL', '1960s', ARRAY['PG', 'SG']::text[], 'legend', 8905, 90100000),
  ('hist_1960s_LAL_jim_barnes', 'LAL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1056, 488000),
  ('hist_1960s_LAL_jim_king', 'LAL', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 505, 364000),
  ('hist_1960s_LAL_jim_krebs', 'LAL', '1960s', ARRAY['C', 'PF']::text[], 'pro', 1883, 674000),
  ('hist_1960s_LAL_johnny_egan', 'LAL', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1666, 625000),
  ('hist_1960s_LAL_keith_erickson', 'LAL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 2391, 788000),
  ('hist_1960s_LAL_larry_foust', 'LAL', '1960s', ARRAY['C', 'PF']::text[], 'all_star', 1855, 4670000),
  ('hist_1960s_LAL_leroy_ellis', 'LAL', '1960s', ARRAY['C', 'PF']::text[], 'pro', 3179, 965000),
  ('hist_1960s_LAL_mel_counts', 'LAL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5209, 1420000),
  ('hist_1960s_LAL_ray_felix', 'LAL', '1960s', ARRAY['C', 'PF']::text[], 'pro', 1092, 496000),
  ('hist_1960s_LAL_rudy_larusso', 'LAL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3538, 6180000),
  ('hist_1960s_LAL_slick_leonard', 'LAL', '1960s', ARRAY['SG', 'SF']::text[], 'pro', 650, 396000),
  ('hist_1960s_LAL_tom_hawkins', 'LAL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2641, 844000),
  ('hist_1960s_LAL_walt_hazzard', 'LAL', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 3097, 947000),
  ('hist_1960s_LAL_wilt_chamberlain', 'LAL', '1960s', ARRAY['C']::text[], 'legend', 9252, 91600000),
  ('hist_1960s_MIL_bob_love', 'MIL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1027, 481000),
  ('hist_1960s_MIL_bob_weiss', 'MIL', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 433, 347000),
  ('hist_1960s_MIL_dave_gambee', 'MIL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4609, 1290000),
  ('hist_1960s_MIL_dick_cunningham', 'MIL', '1960s', ARRAY['C', 'PF']::text[], 'pro', 128, 279000),
  ('hist_1960s_MIL_flynn_robinson', 'MIL', '1960s', ARRAY['PG', 'SG']::text[], 'superstar', 4045, 27100000),
  ('hist_1960s_MIL_fred_hetzel', 'MIL', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5738, 8160000),
  ('hist_1960s_MIL_greg_smith', 'MIL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3782, 1100000),
  ('hist_1960s_MIL_guy_rodgers', 'MIL', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 5101, 1400000),
  ('hist_1960s_MIL_jon_mcglocklin', 'MIL', '1960s', ARRAY['SG', 'PG']::text[], 'superstar', 3170, 24500000),
  ('hist_1960s_MIL_len_chappell', 'MIL', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2570, 5310000),
  ('hist_1960s_MIL_wayne_embry', 'MIL', '1960s', ARRAY['C', 'PF']::text[], 'all_star', 1529, 4380000),
  ('hist_1960s_MIL_zaid_abdul_aziz', 'MIL', '1960s', ARRAY['C', 'PF']::text[], 'all_star', 27, 3020000),
  ('hist_1960s_NYK_al_butler', 'NYK', '1960s', ARRAY['SG', 'SF', 'PF']::text[], 'pro', 3668, 1080000),
  ('hist_1960s_NYK_art_heyman', 'NYK', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 4186, 1190000),
  ('hist_1960s_NYK_bevo_nordmann', 'NYK', '1960s', ARRAY['C', 'PF']::text[], 'pro', 3759, 1100000),
  ('hist_1960s_NYK_bill_bradley', 'NYK', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4376, 1230000),
  ('hist_1960s_NYK_bill_mcgill', 'NYK', '1960s', ARRAY['C', 'PF']::text[], 'all_star', 3710, 6340000),
  ('hist_1960s_NYK_bob_boozer', 'NYK', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3774, 6400000),
  ('hist_1960s_NYK_bob_mcneill', 'NYK', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 476, 357000),
  ('hist_1960s_NYK_cal_ramsey', 'NYK', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4803, 1330000),
  ('hist_1960s_NYK_carl_braun', 'NYK', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 4921, 1360000),
  ('hist_1960s_NYK_cazzie_russell', 'NYK', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1891, 4700000),
  ('hist_1960s_NYK_charlie_tyra', 'NYK', '1960s', ARRAY['C', 'PF']::text[], 'pro', 4809, 1330000),
  ('hist_1960s_NYK_cleveland_buckner', 'NYK', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 217, 299000),
  ('hist_1960s_NYK_darrall_imhoff', 'NYK', '1960s', ARRAY['C', 'PF']::text[], 'pro', 564, 377000),
  ('hist_1960s_NYK_dave_budd', 'NYK', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1050, 486000),
  ('hist_1960s_NYK_dave_debusschere', 'NYK', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1906, 20700000),
  ('hist_1960s_NYK_dave_stallworth', 'NYK', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5744, 1540000),
  ('hist_1960s_NYK_dick_barnett', 'NYK', '1960s', ARRAY['SG', 'PG']::text[], 'superstar', 1157, 18500000),
  ('hist_1960s_NYK_dick_garmaker', 'NYK', '1960s', ARRAY['PG', 'SG']::text[], 'all_star', 2199, 4980000),
  ('hist_1960s_NYK_dick_van_arsdale', 'NYK', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 5918, 1580000),
  ('hist_1960s_NYK_em_bryant', 'NYK', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 518, 367000),
  ('hist_1960s_NYK_freddie_crawford', 'NYK', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 39, 259000),
  ('hist_1960s_NYK_gene_conley', 'NYK', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1240, 529000),
  ('hist_1960s_NYK_gene_shue', 'NYK', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 4543, 1270000),
  ('hist_1960s_NYK_howard_komives', 'NYK', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 5134, 1410000),
  ('hist_1960s_NYK_jack_george', 'NYK', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 2487, 810000),
  ('hist_1960s_NYK_jim_barnes', 'NYK', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5312, 7780000),
  ('hist_1960s_NYK_jim_palmer', 'NYK', '1960s', ARRAY['C', 'PF']::text[], 'pro', 689, 405000),
  ('hist_1960s_NYK_john_rudometkin', 'NYK', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 174, 289000),
  ('hist_1960s_NYK_johnny_egan', 'NYK', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 3996, 1150000),
  ('hist_1960s_NYK_johnny_green', 'NYK', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2235, 5010000),
  ('hist_1960s_NYK_kenny_sears', 'NYK', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4217, 6800000),
  ('hist_1960s_NYK_len_chappell', 'NYK', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4622, 1290000),
  ('hist_1960s_NYK_mike_farmer', 'NYK', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1407, 567000),
  ('hist_1960s_NYK_paul_hogue', 'NYK', '1960s', ARRAY['C', 'PF']::text[], 'pro', 2100, 723000),
  ('hist_1960s_NYK_phil_jackson', 'NYK', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 722, 412000),
  ('hist_1960s_NYK_phil_jordon', 'NYK', '1960s', ARRAY['C', 'PF']::text[], 'pro', 5557, 1500000),
  ('hist_1960s_NYK_phil_rollins', 'NYK', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 341, 327000),
  ('hist_1960s_NYK_richie_guerin', 'NYK', '1960s', ARRAY['SG', 'PG']::text[], 'legend', 2330, 60500000),
  ('hist_1960s_NYK_ron_sobie', 'NYK', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 656, 398000),
  ('hist_1960s_NYK_tom_gola', 'NYK', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 2569, 828000),
  ('hist_1960s_NYK_walt_bellamy', 'NYK', '1960s', ARRAY['C', 'PF']::text[], 'superstar', 5164, 30500000),
  ('hist_1960s_NYK_walt_frazier', 'NYK', '1960s', ARRAY['PG', 'SG']::text[], 'all_star', 3502, 6150000),
  ('hist_1960s_NYK_willie_naulls', 'NYK', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 2464, 61100000),
  ('hist_1960s_NYK_willis_reed', 'NYK', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5251, 30800000),
  ('hist_1960s_OKC_al_tucker', 'OKC', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5039, 1380000),
  ('hist_1960s_OKC_art_harris', 'OKC', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 5183, 1420000),
  ('hist_1960s_OKC_bob_kauffman', 'OKC', '1960s', ARRAY['C', 'PF']::text[], 'pro', 1886, 674000),
  ('hist_1960s_OKC_bob_rule', 'OKC', '1960s', ARRAY['C', 'PF']::text[], 'superstar', 5144, 30400000),
  ('hist_1960s_OKC_bob_weiss', 'OKC', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 3408, 1020000),
  ('hist_1960s_OKC_dorie_murrey', 'OKC', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1253, 532000),
  ('hist_1960s_OKC_erwin_mueller', 'OKC', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1388, 562000),
  ('hist_1960s_OKC_george_wilson', 'OKC', '1960s', ARRAY['C', 'PF']::text[], 'pro', 896, 452000),
  ('hist_1960s_OKC_joe_kennedy', 'OKC', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 387, 337000),
  ('hist_1960s_OKC_john_tresvant', 'OKC', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3348, 6010000),
  ('hist_1960s_OKC_lenny_wilkens', 'OKC', '1960s', ARRAY['PG', 'SG']::text[], 'legend', 3188, 64300000),
  ('hist_1960s_OKC_rod_thorn', 'OKC', '1960s', ARRAY['SG', 'PG']::text[], 'all_star', 995, 3900000),
  ('hist_1960s_OKC_tom_meschery', 'OKC', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 4434, 6990000),
  ('hist_1960s_OKC_tommy_kron', 'OKC', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 1857, 668000),
  ('hist_1960s_OKC_walt_hazzard', 'OKC', '1960s', ARRAY['PG', 'SG']::text[], 'legend', 2170, 59800000),
  ('hist_1960s_PHI_al_bianchi', 'PHI', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1289, 540000),
  ('hist_1960s_PHI_archie_clark', 'PHI', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 5879, 1570000),
  ('hist_1960s_PHI_barney_cable', 'PHI', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1060, 489000),
  ('hist_1960s_PHI_ben_warley', 'PHI', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1066, 490000),
  ('hist_1960s_PHI_billy_cunningham', 'PHI', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4143, 27400000),
  ('hist_1960s_PHI_bob_hopkins', 'PHI', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2536, 821000),
  ('hist_1960s_PHI_chet_walker', 'PHI', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5701, 8130000),
  ('hist_1960s_PHI_connie_dierking', 'PHI', '1960s', ARRAY['C', 'PF']::text[], 'pro', 1256, 533000),
  ('hist_1960s_PHI_darrall_imhoff', 'PHI', '1960s', ARRAY['C', 'PF']::text[], 'pro', 4839, 1340000),
  ('hist_1960s_PHI_dave_gambee', 'PHI', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4393, 1240000),
  ('hist_1960s_PHI_dick_barnett', 'PHI', '1960s', ARRAY['SG', 'PG']::text[], 'all_star', 1602, 4440000),
  ('hist_1960s_PHI_dolph_schayes', 'PHI', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2237, 21700000),
  ('hist_1960s_PHI_frank_selvy', 'PHI', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 49, 261000),
  ('hist_1960s_PHI_george_wilson', 'PHI', '1960s', ARRAY['C', 'PF']::text[], 'pro', 735, 415000),
  ('hist_1960s_PHI_george_yardley', 'PHI', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3977, 26900000),
  ('hist_1960s_PHI_hal_greer', 'PHI', '1960s', ARRAY['SG', 'PG']::text[], 'superstar', 5057, 30200000),
  ('hist_1960s_PHI_joe_graboski', 'PHI', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1716, 636000),
  ('hist_1960s_PHI_joe_roberts', 'PHI', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 705, 409000),
  ('hist_1960s_PHI_larry_costello', 'PHI', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 5639, 1520000),
  ('hist_1960s_PHI_larry_jones', 'PHI', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 190, 293000),
  ('hist_1960s_PHI_lee_shaffer', 'PHI', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 4688, 7220000),
  ('hist_1960s_PHI_len_chappell', 'PHI', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2424, 795000),
  ('hist_1960s_PHI_luke_jackson', 'PHI', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 443, 3400000),
  ('hist_1960s_PHI_paul_neumann', 'PHI', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 2893, 901000),
  ('hist_1960s_PHI_red_kerr', 'PHI', '1960s', ARRAY['C', 'PF']::text[], 'all_star', 5964, 8370000),
  ('hist_1960s_PHI_swede_halbrook', 'PHI', '1960s', ARRAY['C', 'PF']::text[], 'pro', 577, 380000),
  ('hist_1960s_PHI_wali_jones', 'PHI', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 4914, 1360000),
  ('hist_1960s_PHI_wilt_chamberlain', 'PHI', '1960s', ARRAY['C']::text[], 'goat', 2250, 118000000),
  ('hist_1960s_PHX_bob_warlick', 'PHX', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 1309, 545000),
  ('hist_1960s_PHX_dave_lattin', 'PHX', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 531, 369000),
  ('hist_1960s_PHX_dick_snyder', 'PHX', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4872, 1350000),
  ('hist_1960s_PHX_dick_van_arsdale', 'PHX', '1960s', ARRAY['SG', 'PG']::text[], 'superstar', 5630, 31900000),
  ('hist_1960s_PHX_gail_goodrich', 'PHX', '1960s', ARRAY['PG', 'SG']::text[], 'legend', 2759, 62400000),
  ('hist_1960s_PHX_gary_gregor', 'PHX', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5114, 1400000),
  ('hist_1960s_PHX_george_wilson', 'PHX', '1960s', ARRAY['C', 'PF']::text[], 'all_star', 1584, 4430000),
  ('hist_1960s_PHX_jim_fox', 'PHX', '1960s', ARRAY['C', 'PF']::text[], 'all_star', 5982, 8380000),
  ('hist_1960s_PHX_mccoy_mclemore', 'PHX', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4786, 1330000),
  ('hist_1960s_PHX_neil_johnson', 'PHX', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 738, 416000),
  ('hist_1960s_PHX_stan_mckenzie', 'PHX', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2195, 744000),
  ('hist_1960s_SAC_adrian_smith', 'SAC', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 4852, 1340000),
  ('hist_1960s_SAC_al_tucker', 'SAC', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3412, 1020000),
  ('hist_1960s_SAC_bob_boozer', 'SAC', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5606, 1510000),
  ('hist_1960s_SAC_bob_love', 'SAC', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 482, 358000),
  ('hist_1960s_SAC_bucky_bockhorn', 'SAC', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 5141, 1410000),
  ('hist_1960s_SAC_connie_dierking', 'SAC', '1960s', ARRAY['C', 'PF']::text[], 'pro', 5964, 1590000),
  ('hist_1960s_SAC_dave_piontek', 'SAC', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 755, 420000),
  ('hist_1960s_SAC_flynn_robinson', 'SAC', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1463, 579000),
  ('hist_1960s_SAC_fred_hetzel', 'SAC', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4189, 1190000),
  ('hist_1960s_SAC_guy_rodgers', 'SAC', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 525, 368000),
  ('hist_1960s_SAC_happy_hairston', 'SAC', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5797, 1550000),
  ('hist_1960s_SAC_hub_reed', 'SAC', '1960s', ARRAY['C', 'PF']::text[], 'pro', 1243, 530000),
  ('hist_1960s_SAC_jack_twyman', 'SAC', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3190, 24600000),
  ('hist_1960s_SAC_jerry_lucas', 'SAC', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 3321, 64900000),
  ('hist_1960s_SAC_jim_palmer', 'SAC', '1960s', ARRAY['C', 'PF']::text[], 'pro', 2519, 817000),
  ('hist_1960s_SAC_joe_buckhalter', 'SAC', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 262, 309000),
  ('hist_1960s_SAC_john_tresvant', 'SAC', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5108, 1400000),
  ('hist_1960s_SAC_jon_mcglocklin', 'SAC', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 381, 336000),
  ('hist_1960s_SAC_med_park', 'SAC', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 2638, 844000),
  ('hist_1960s_SAC_mike_farmer', 'SAC', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2083, 719000),
  ('hist_1960s_SAC_oscar_robertson', 'SAC', '1960s', ARRAY['PG', 'SG']::text[], 'goat', 500, 104000000),
  ('hist_1960s_SAC_phil_jordon', 'SAC', '1960s', ARRAY['C', 'PF']::text[], 'all_star', 706, 3640000),
  ('hist_1960s_SAC_phil_rollins', 'SAC', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 89, 270000),
  ('hist_1960s_SAC_tom_hawkins', 'SAC', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2552, 824000),
  ('hist_1960s_SAC_tom_van_arsdale', 'SAC', '1960s', ARRAY['SG', 'PG']::text[], 'all_star', 5014, 7510000),
  ('hist_1960s_SAC_walt_wesley', 'SAC', '1960s', ARRAY['C', 'PF']::text[], 'pro', 699, 407000),
  ('hist_1960s_SAC_wayne_embry', 'SAC', '1960s', ARRAY['C', 'PF']::text[], 'all_star', 4588, 7130000),
  ('hist_1960s_SAC_win_wilfong', 'SAC', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1588, 607000),
  ('hist_1960s_WAS_andy_johnson', 'WAS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1964, 4770000),
  ('hist_1960s_WAS_bailey_howell', 'WAS', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3491, 25500000),
  ('hist_1960s_WAS_barney_cable', 'WAS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 545, 373000),
  ('hist_1960s_WAS_ben_warley', 'WAS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 289, 315000),
  ('hist_1960s_WAS_bill_mcgill', 'WAS', '1960s', ARRAY['C', 'PF']::text[], 'pro', 463, 354000),
  ('hist_1960s_WAS_bob_ferry', 'WAS', '1960s', ARRAY['C', 'PF']::text[], 'pro', 548, 373000),
  ('hist_1960s_WAS_charlie_hardnett', 'WAS', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1404, 566000),
  ('hist_1960s_WAS_charlie_tyra', 'WAS', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1903, 678000),
  ('hist_1960s_WAS_don_kojis', 'WAS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 508, 364000),
  ('hist_1960s_WAS_don_nelson', 'WAS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1033, 482000),
  ('hist_1960s_WAS_don_ohl', 'WAS', '1960s', ARRAY['SG', 'PG']::text[], 'superstar', 1323, 19000000),
  ('hist_1960s_WAS_earl_monroe', 'WAS', '1960s', ARRAY['SG', 'PG']::text[], 'legend', 2116, 59500000),
  ('hist_1960s_WAS_gus_johnson', 'WAS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4765, 29300000),
  ('hist_1960s_WAS_horace_walker', 'WAS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1644, 620000),
  ('hist_1960s_WAS_jack_marin', 'WAS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5731, 1540000),
  ('hist_1960s_WAS_jerry_sloan', 'WAS', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 535, 370000),
  ('hist_1960s_WAS_jim_barnes', 'WAS', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 181, 3160000),
  ('hist_1960s_WAS_john_barnhill', 'WAS', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 1329, 549000),
  ('hist_1960s_WAS_johnny_cox', 'WAS', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 1539, 596000),
  ('hist_1960s_WAS_johnny_egan', 'WAS', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 2473, 806000),
  ('hist_1960s_WAS_johnny_green', 'WAS', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3864, 1120000),
  ('hist_1960s_WAS_kevin_loughery', 'WAS', '1960s', ARRAY['PG', 'SG']::text[], 'all_star', 4489, 7040000),
  ('hist_1960s_WAS_larry_staverman', 'WAS', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 859, 443000),
  ('hist_1960s_WAS_leroy_ellis', 'WAS', '1960s', ARRAY['C', 'PF']::text[], 'pro', 5852, 1570000),
  ('hist_1960s_WAS_maury_king', 'WAS', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 873, 446000),
  ('hist_1960s_WAS_mel_counts', 'WAS', '1960s', ARRAY['C', 'PF']::text[], 'pro', 1260, 534000),
  ('hist_1960s_WAS_mel_nowell', 'WAS', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 187, 292000),
  ('hist_1960s_WAS_nick_mantis', 'WAS', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 390, 338000),
  ('hist_1960s_WAS_ralph_davis', 'WAS', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 3405, 1020000),
  ('hist_1960s_WAS_ray_scott', 'WAS', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5538, 7980000),
  ('hist_1960s_WAS_red_kerr', 'WAS', '1960s', ARRAY['C', 'PF']::text[], 'pro', 5705, 1530000),
  ('hist_1960s_WAS_rod_thorn', 'WAS', '1960s', ARRAY['SG', 'PG']::text[], 'all_star', 2416, 5170000),
  ('hist_1960s_WAS_si_green', 'WAS', '1960s', ARRAY['PG', 'SG']::text[], 'pro', 3297, 992000),
  ('hist_1960s_WAS_slick_leonard', 'WAS', '1960s', ARRAY['SG', 'SF']::text[], 'all_star', 498, 3450000),
  ('hist_1960s_WAS_terry_dischinger', 'WAS', '1960s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 938, 54200000),
  ('hist_1960s_WAS_wali_jones', 'WAS', '1960s', ARRAY['SG', 'PG']::text[], 'pro', 69, 266000),
  ('hist_1960s_WAS_walt_bellamy', 'WAS', '1960s', ARRAY['C', 'PF']::text[], 'legend', 4446, 70000000),
  ('hist_1960s_WAS_wayne_hightower', 'WAS', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1414, 568000),
  ('hist_1960s_WAS_wes_unseld', 'WAS', '1960s', ARRAY['C', 'PF']::text[], 'superstar', 2392, 22200000),
  ('hist_1960s_WAS_woody_sauldsberry', 'WAS', '1960s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5800, 1560000),
  ('hist_1970s_ATL_armond_hill', 'ATL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3284, 989000),
  ('hist_1970s_ATL_bill_bridges', 'ATL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 165, 15500000),
  ('hist_1970s_ATL_butch_beard', 'ATL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 597, 384000),
  ('hist_1970s_ATL_butch_lee', 'ATL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1296, 542000),
  ('hist_1970s_ATL_charlie_criss', 'ATL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 2175, 739000),
  ('hist_1970s_ATL_clyde_lee', 'ATL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1450, 576000),
  ('hist_1970s_ATL_connie_hawkins', 'ATL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2979, 920000),
  ('hist_1970s_ATL_dan_roundfield', 'ATL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5439, 7900000),
  ('hist_1970s_ATL_dean_meminger', 'ATL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1804, 656000),
  ('hist_1970s_ATL_don_adams', 'ATL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5049, 1390000),
  ('hist_1970s_ATL_don_may', 'ATL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 436, 348000),
  ('hist_1970s_ATL_don_ohl', 'ATL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 7, 252000),
  ('hist_1970s_ATL_dwight_jones', 'ATL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 3976, 1140000),
  ('hist_1970s_ATL_eddie_johnson', 'ATL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 5426, 1470000),
  ('hist_1970s_ATL_gary_gregor', 'ATL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1680, 628000),
  ('hist_1970s_ATL_george_trapp', 'ATL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2716, 861000),
  ('hist_1970s_ATL_herm_gilliam', 'ATL', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 145, 3130000),
  ('hist_1970s_ATL_jack_givens', 'ATL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 964, 467000),
  ('hist_1970s_ATL_jerry_chambers', 'ATL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1955, 690000),
  ('hist_1970s_ATL_jim_davis', 'ATL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4734, 1320000),
  ('hist_1970s_ATL_jim_washington', 'ATL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5068, 1390000),
  ('hist_1970s_ATL_joe_caldwell', 'ATL', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 4288, 27900000),
  ('hist_1970s_ATL_joe_meriweather', 'ATL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4947, 1360000),
  ('hist_1970s_ATL_john_brown', 'ATL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2136, 731000),
  ('hist_1970s_ATL_john_drew', 'ATL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5582, 31700000),
  ('hist_1970s_ATL_ken_charles', 'ATL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 3887, 1120000),
  ('hist_1970s_ATL_lou_hudson', 'ATL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 54, 50200000),
  ('hist_1970s_ATL_mike_sojourner', 'ATL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2788, 877000),
  ('hist_1970s_ATL_milt_williams', 'ATL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 151, 284000),
  ('hist_1970s_ATL_ollie_johnson', 'ATL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1771, 648000),
  ('hist_1970s_ATL_pete_maravich', 'ATL', '1970s', ARRAY['SG', 'PG']::text[], 'legend', 5076, 72800000),
  ('hist_1970s_ATL_randy_denton', 'ATL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 276, 312000),
  ('hist_1970s_ATL_ron_behagen', 'ATL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4419, 1240000),
  ('hist_1970s_ATL_steve_bracey', 'ATL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 797, 429000),
  ('hist_1970s_ATL_steve_hawes', 'ATL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4967, 1370000),
  ('hist_1970s_ATL_terry_furlow', 'ATL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 3034, 933000),
  ('hist_1970s_ATL_tom_barker', 'ATL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2339, 776000),
  ('hist_1970s_ATL_tom_henderson', 'ATL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 5843, 1560000),
  ('hist_1970s_ATL_tom_mcmillen', 'ATL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2011, 702000),
  ('hist_1970s_ATL_tom_van_arsdale', 'ATL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 715, 3640000),
  ('hist_1970s_ATL_tree_rollins', 'ATL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2342, 777000),
  ('hist_1970s_ATL_truck_robinson', 'ATL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 2545, 61500000),
  ('hist_1970s_ATL_walt_bellamy', 'ATL', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 1643, 19900000),
  ('hist_1970s_ATL_walt_hazzard', 'ATL', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 243, 15700000),
  ('hist_1970s_BKN_al_skinner', 'BKN', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 5036, 1380000),
  ('hist_1970s_BKN_bernard_king', 'BKN', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 1527, 56900000),
  ('hist_1970s_BKN_bird_averitt', 'BKN', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1768, 648000),
  ('hist_1970s_BKN_bob_carrington', 'BKN', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2998, 925000),
  ('hist_1970s_BKN_bob_elliott', 'BKN', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2234, 753000),
  ('hist_1970s_BKN_bob_love', 'BKN', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2168, 738000),
  ('hist_1970s_BKN_darnell_hillman', 'BKN', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5941, 1590000),
  ('hist_1970s_BKN_dave_wohl', 'BKN', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 800, 430000),
  ('hist_1970s_BKN_eddie_jordan', 'BKN', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4553, 1270000),
  ('hist_1970s_BKN_eric_money', 'BKN', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 5801, 8220000),
  ('hist_1970s_BKN_george_johnson', 'BKN', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2985, 922000),
  ('hist_1970s_BKN_harvey_catchings', 'BKN', '1970s', ARRAY['C', 'PF']::text[], 'pro', 1083, 494000),
  ('hist_1970s_BKN_howard_porter', 'BKN', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4862, 1340000),
  ('hist_1970s_BKN_jan_van_breda_kolff', 'BKN', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1598, 610000),
  ('hist_1970s_BKN_jim_fox', 'BKN', '1970s', ARRAY['C', 'PF']::text[], 'pro', 692, 406000),
  ('hist_1970s_BKN_john_williamson', 'BKN', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 4784, 29400000),
  ('hist_1970s_BKN_kevin_porter', 'BKN', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 3209, 24600000),
  ('hist_1970s_BKN_larry_mcneill', 'BKN', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 748, 418000),
  ('hist_1970s_BKN_louie_nelson', 'BKN', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1273, 536000),
  ('hist_1970s_BKN_mel_davis', 'BKN', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2644, 845000),
  ('hist_1970s_BKN_mike_bantom', 'BKN', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2217, 21700000),
  ('hist_1970s_BKN_phil_jackson', 'BKN', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 486, 359000),
  ('hist_1970s_BKN_ralph_simpson', 'BKN', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 630, 392000),
  ('hist_1970s_BKN_rich_jones', 'BKN', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4137, 1180000),
  ('hist_1970s_BKN_robert_bubbles_hawkins', 'BKN', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 4443, 7000000),
  ('hist_1970s_BKN_tim_bassett', 'BKN', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1099, 497000),
  ('hist_1970s_BKN_tiny_archibald', 'BKN', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 4804, 29400000),
  ('hist_1970s_BKN_wilson_washington', 'BKN', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1847, 666000),
  ('hist_1970s_BKN_winford_boynes', 'BKN', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1726, 638000),
  ('hist_1970s_BOS_bailey_howell', 'BOS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5551, 1500000),
  ('hist_1970s_BOS_billy_knight', 'BOS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5816, 1560000),
  ('hist_1970s_BOS_bob_mcadoo', 'BOS', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 4104, 27300000),
  ('hist_1970s_BOS_cedric_maxwell', 'BOS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1520, 4370000),
  ('hist_1970s_BOS_charlie_scott', 'BOS', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 972, 17900000),
  ('hist_1970s_BOS_chris_ford', 'BOS', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 4317, 6890000),
  ('hist_1970s_BOS_curtis_rowe', 'BOS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2040, 709000),
  ('hist_1970s_BOS_dave_bing', 'BOS', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 5866, 1570000),
  ('hist_1970s_BOS_dave_cowens', 'BOS', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 5767, 32300000),
  ('hist_1970s_BOS_don_chaney', 'BOS', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 3107, 949000),
  ('hist_1970s_BOS_don_nelson', 'BOS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5091, 1400000),
  ('hist_1970s_BOS_earl_tatum', 'BOS', '1970s', ARRAY['SF', 'PF']::text[], 'pro', 0, 250000),
  ('hist_1970s_BOS_earl_williams', 'BOS', '1970s', ARRAY['C', 'PF']::text[], 'pro', 554, 375000),
  ('hist_1970s_BOS_em_bryant', 'BOS', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 2277, 762000),
  ('hist_1970s_BOS_jeff_judkins', 'BOS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1762, 646000),
  ('hist_1970s_BOS_jim_barnes', 'BOS', '1970s', ARRAY['C', 'PF']::text[], 'pro', 358, 331000),
  ('hist_1970s_BOS_jo_jo_white', 'BOS', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 2762, 23300000),
  ('hist_1970s_BOS_john_havlicek', 'BOS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 3176, 64300000),
  ('hist_1970s_BOS_kermit_washington', 'BOS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5993, 1600000),
  ('hist_1970s_BOS_larry_siegfried', 'BOS', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 5288, 1440000),
  ('hist_1970s_BOS_marvin_barnes', 'BOS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1860, 669000),
  ('hist_1970s_BOS_paul_silas', 'BOS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2190, 4970000),
  ('hist_1970s_BOS_paul_westphal', 'BOS', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 787, 427000),
  ('hist_1970s_BOS_rich_johnson', 'BOS', '1970s', ARRAY['C', 'PF']::text[], 'pro', 66, 265000),
  ('hist_1970s_BOS_rick_robey', 'BOS', '1970s', ARRAY['C', 'PF']::text[], 'pro', 5751, 1540000),
  ('hist_1970s_BOS_sidney_wicks', 'BOS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3511, 6160000),
  ('hist_1970s_BOS_steve_kuberski', 'BOS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 256, 308000),
  ('hist_1970s_BOS_tiny_archibald', 'BOS', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4353, 1230000),
  ('hist_1970s_BOS_tom_boswell', 'BOS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 351, 329000),
  ('hist_1970s_BOS_tom_sanders', 'BOS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 512, 365000),
  ('hist_1970s_BOS_zaid_abdul_aziz', 'BOS', '1970s', ARRAY['C', 'PF']::text[], 'pro', 423, 345000),
  ('hist_1970s_CHI_al_tucker', 'CHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 659, 398000),
  ('hist_1970s_CHI_artis_gilmore', 'CHI', '1970s', ARRAY['C', 'PF']::text[], 'legend', 2009, 59000000),
  ('hist_1970s_CHI_bill_hewitt', 'CHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1637, 618000),
  ('hist_1970s_CHI_bob_love', 'CHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5348, 31000000),
  ('hist_1970s_CHI_bob_weiss', 'CHI', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3671, 1080000),
  ('hist_1970s_CHI_bobby_wilson', 'CHI', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 148, 283000),
  ('hist_1970s_CHI_cazzie_russell', 'CHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1739, 641000),
  ('hist_1970s_CHI_chet_walker', 'CHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4055, 27200000),
  ('hist_1970s_CHI_clem_haskins', 'CHI', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 5601, 31800000),
  ('hist_1970s_CHI_clifford_ray', 'CHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4849, 1340000),
  ('hist_1970s_CHI_ed_manning', 'CHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 374, 334000),
  ('hist_1970s_CHI_gar_heard', 'CHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3464, 1030000),
  ('hist_1970s_CHI_howard_porter', 'CHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 489, 360000),
  ('hist_1970s_CHI_jack_marin', 'CHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1916, 681000),
  ('hist_1970s_CHI_jerry_sloan', 'CHI', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 2579, 5320000),
  ('hist_1970s_CHI_jim_fox', 'CHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 3973, 1140000),
  ('hist_1970s_CHI_john_block', 'CHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1348, 553000),
  ('hist_1970s_CHI_john_laskowski', 'CHI', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 440, 349000),
  ('hist_1970s_CHI_john_mengelt', 'CHI', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2683, 854000),
  ('hist_1970s_CHI_mark_landsberger', 'CHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1650, 621000),
  ('hist_1970s_CHI_matt_guokas', 'CHI', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 807, 432000),
  ('hist_1970s_CHI_mickey_johnson', 'CHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5131, 7620000),
  ('hist_1970s_CHI_nate_thurmond', 'CHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4166, 1190000),
  ('hist_1970s_CHI_norm_van_lier', 'CHI', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 2009, 4810000),
  ('hist_1970s_CHI_ollie_johnson', 'CHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2490, 810000),
  ('hist_1970s_CHI_reggie_theus', 'CHI', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 5050, 7550000),
  ('hist_1970s_CHI_rowland_garrett', 'CHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 26, 256000),
  ('hist_1970s_CHI_scott_may', 'CHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4783, 1330000),
  ('hist_1970s_CHI_shaler_halimon', 'CHI', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 177, 290000),
  ('hist_1970s_CHI_tom_boerwinkle', 'CHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 3189, 968000),
  ('hist_1970s_CHI_walt_wesley', 'CHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 3159, 961000),
  ('hist_1970s_CHI_wilbur_holland', 'CHI', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 1919, 4730000),
  ('hist_1970s_CLE_austin_carr', 'CLE', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 4462, 7020000),
  ('hist_1970s_CLE_barry_clemens', 'CLE', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 200, 295000),
  ('hist_1970s_CLE_bingo_smith', 'CLE', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 5790, 1550000),
  ('hist_1970s_CLE_bobby_lewis', 'CLE', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 679, 403000),
  ('hist_1970s_CLE_bobby_washington', 'CLE', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 682, 403000),
  ('hist_1970s_CLE_butch_beard', 'CLE', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 3113, 5800000),
  ('hist_1970s_CLE_butch_lee', 'CLE', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4452, 1250000),
  ('hist_1970s_CLE_campy_russell', 'CLE', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3919, 6530000),
  ('hist_1970s_CLE_charlie_davis', 'CLE', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2162, 736000),
  ('hist_1970s_CLE_cornell_warner', 'CLE', '1970s', ARRAY['C', 'PF']::text[], 'pro', 922, 457000),
  ('hist_1970s_CLE_dave_sorenson', 'CLE', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2516, 816000),
  ('hist_1970s_CLE_dick_snyder', 'CLE', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 3205, 971000),
  ('hist_1970s_CLE_dwight_davis', 'CLE', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4534, 1270000),
  ('hist_1970s_CLE_elmore_smith', 'CLE', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4065, 1160000),
  ('hist_1970s_CLE_foots_walker', 'CLE', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1591, 608000),
  ('hist_1970s_CLE_fred_foster', 'CLE', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 16, 254000),
  ('hist_1970s_CLE_gary_brokaw', 'CLE', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 968, 468000),
  ('hist_1970s_CLE_jim_brewer', 'CLE', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2582, 831000),
  ('hist_1970s_CLE_jim_chones', 'CLE', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 3656, 6290000),
  ('hist_1970s_CLE_jim_cleamons', 'CLE', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3723, 1090000),
  ('hist_1970s_CLE_john_johnson', 'CLE', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 360, 16100000),
  ('hist_1970s_CLE_john_warren', 'CLE', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 600, 385000),
  ('hist_1970s_CLE_len_chappell', 'CLE', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 328, 324000),
  ('hist_1970s_CLE_lenny_wilkens', 'CLE', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 4454, 28400000),
  ('hist_1970s_CLE_luther_rackley', 'CLE', '1970s', ARRAY['C', 'PF']::text[], 'pro', 1063, 489000),
  ('hist_1970s_CLE_mccoy_mclemore', 'CLE', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5974, 1590000),
  ('hist_1970s_CLE_mike_mitchell', 'CLE', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3225, 976000),
  ('hist_1970s_CLE_nate_thurmond', 'CLE', '1970s', ARRAY['C', 'PF']::text[], 'pro', 584, 381000),
  ('hist_1970s_CLE_rick_roberson', 'CLE', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2995, 5700000),
  ('hist_1970s_CLE_steve_patterson', 'CLE', '1970s', ARRAY['C', 'PF']::text[], 'pro', 121, 277000),
  ('hist_1970s_CLE_terry_furlow', 'CLE', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 3195, 969000),
  ('hist_1970s_CLE_walt_frazier', 'CLE', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 2525, 5270000),
  ('hist_1970s_CLE_walt_wesley', 'CLE', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 2163, 4950000),
  ('hist_1970s_DEN_anthony_roberts', 'DEN', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2237, 753000),
  ('hist_1970s_DEN_bob_wilkerson', 'DEN', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5695, 1530000),
  ('hist_1970s_DEN_bobby_jones', 'DEN', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5321, 7790000),
  ('hist_1970s_DEN_brian_taylor', 'DEN', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4511, 1260000),
  ('hist_1970s_DEN_charlie_scott', 'DEN', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 5544, 1500000),
  ('hist_1970s_DEN_dan_issel', 'DEN', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 5426, 31300000),
  ('hist_1970s_DEN_darnell_hillman', 'DEN', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2578, 830000),
  ('hist_1970s_DEN_david_thompson', 'DEN', '1970s', ARRAY['SG', 'PG']::text[], 'legend', 3000, 63500000),
  ('hist_1970s_DEN_george_mcginnis', 'DEN', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 2491, 61200000),
  ('hist_1970s_DEN_gus_gerard', 'DEN', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3287, 990000),
  ('hist_1970s_DEN_jim_price', 'DEN', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1850, 666000),
  ('hist_1970s_DEN_mack_calvin', 'DEN', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 941, 462000),
  ('hist_1970s_DEN_marvin_webster', 'DEN', '1970s', ARRAY['C', 'PF']::text[], 'pro', 1247, 531000),
  ('hist_1970s_DEN_paul_silas', 'DEN', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2382, 786000),
  ('hist_1970s_DEN_ralph_simpson', 'DEN', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 203, 296000),
  ('hist_1970s_DEN_ted_mcclain', 'DEN', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2926, 908000),
  ('hist_1970s_DEN_tom_boswell', 'DEN', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4960, 1370000),
  ('hist_1970s_DEN_willie_wise', 'DEN', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1778, 650000),
  ('hist_1970s_DET_al_eberhard', 'DET', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 643, 395000),
  ('hist_1970s_DET_al_skinner', 'DET', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 640, 394000),
  ('hist_1970s_DET_archie_clark', 'DET', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1142, 507000),
  ('hist_1970s_DET_ben_poquette', 'DET', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 223, 300000),
  ('hist_1970s_DET_bill_hewitt', 'DET', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 741, 417000),
  ('hist_1970s_DET_bob_lanier', 'DET', '1970s', ARRAY['C', 'PF']::text[], 'legend', 3268, 64700000),
  ('hist_1970s_DET_bob_quick', 'DET', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 987, 472000),
  ('hist_1970s_DET_chris_ford', 'DET', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2628, 841000),
  ('hist_1970s_DET_curtis_rowe', 'DET', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 905, 3810000),
  ('hist_1970s_DET_dave_bing', 'DET', '1970s', ARRAY['PG', 'SG']::text[], 'legend', 857, 53900000),
  ('hist_1970s_DET_don_adams', 'DET', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2943, 912000),
  ('hist_1970s_DET_earl_tatum', 'DET', '1970s', ARRAY['SF', 'PF']::text[], 'pro', 607, 387000),
  ('hist_1970s_DET_eddie_miles', 'DET', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 5429, 1470000),
  ('hist_1970s_DET_eric_money', 'DET', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4547, 1270000),
  ('hist_1970s_DET_erwin_mueller', 'DET', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1230, 527000),
  ('hist_1970s_DET_fred_foster', 'DET', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1765, 647000),
  ('hist_1970s_DET_george_trapp', 'DET', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1496, 587000),
  ('hist_1970s_DET_gus_gerard', 'DET', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 955, 465000),
  ('hist_1970s_DET_happy_hairston', 'DET', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3730, 1090000),
  ('hist_1970s_DET_howard_komives', 'DET', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 2890, 900000),
  ('hist_1970s_DET_howard_porter', 'DET', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3530, 1040000),
  ('hist_1970s_DET_jim_bostic', 'DET', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 528, 369000),
  ('hist_1970s_DET_jim_price', 'DET', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4461, 1250000),
  ('hist_1970s_DET_jimmy_walker', 'DET', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 2713, 23100000),
  ('hist_1970s_DET_john_long', 'DET', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 1900, 4710000),
  ('hist_1970s_DET_john_mengelt', 'DET', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2824, 885000),
  ('hist_1970s_DET_john_shumate', 'DET', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5303, 7770000),
  ('hist_1970s_DET_kevin_porter', 'DET', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 2706, 5440000),
  ('hist_1970s_DET_leon_douglas', 'DET', '1970s', ARRAY['C', 'PF']::text[], 'pro', 3966, 1140000),
  ('hist_1970s_DET_lindsay_hairston', 'DET', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 95, 271000),
  ('hist_1970s_DET_m_l_carr', 'DET', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3683, 6310000),
  ('hist_1970s_DET_marvin_barnes', 'DET', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3110, 950000),
  ('hist_1970s_DET_mccoy_mclemore', 'DET', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1584, 606000),
  ('hist_1970s_DET_otto_moore', 'DET', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4835, 1340000),
  ('hist_1970s_DET_ralph_simpson', 'DET', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 3618, 1060000),
  ('hist_1970s_DET_rickey_green', 'DET', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 456, 353000),
  ('hist_1970s_DET_steve_mix', 'DET', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1017, 479000),
  ('hist_1970s_DET_stu_lantz', 'DET', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2470, 806000),
  ('hist_1970s_DET_terry_dischinger', 'DET', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3815, 1110000),
  ('hist_1970s_DET_terry_driscoll', 'DET', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 413, 343000),
  ('hist_1970s_DET_terry_tyler', 'DET', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5948, 1590000),
  ('hist_1970s_DET_wali_jones', 'DET', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 771, 423000),
  ('hist_1970s_DET_walt_bellamy', 'DET', '1970s', ARRAY['C', 'PF']::text[], 'pro', 3851, 1120000),
  ('hist_1970s_DET_willie_norwood', 'DET', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 991, 473000),
  ('hist_1970s_GSW_adrian_smith', 'GSW', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 13, 253000),
  ('hist_1970s_GSW_bob_portman', 'GSW', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 56, 263000),
  ('hist_1970s_GSW_bobby_lewis', 'GSW', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1145, 508000),
  ('hist_1970s_GSW_butch_beard', 'GSW', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 5144, 1410000),
  ('hist_1970s_GSW_cazzie_russell', 'GSW', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2110, 21300000),
  ('hist_1970s_GSW_charles_dudley', 'GSW', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 882, 448000),
  ('hist_1970s_GSW_charles_johnson', 'GSW', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1299, 542000),
  ('hist_1970s_GSW_clifford_ray', 'GSW', '1970s', ARRAY['C', 'PF']::text[], 'pro', 3356, 1010000),
  ('hist_1970s_GSW_clyde_lee', 'GSW', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3192, 968000),
  ('hist_1970s_GSW_dave_gambee', 'GSW', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 804, 431000),
  ('hist_1970s_GSW_derrek_dickey', 'GSW', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 886, 449000),
  ('hist_1970s_GSW_e_c_coleman', 'GSW', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1073, 491000),
  ('hist_1970s_GSW_george_johnson', 'GSW', '1970s', ARRAY['C', 'PF']::text[], 'pro', 141, 282000),
  ('hist_1970s_GSW_gus_williams', 'GSW', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3664, 1070000),
  ('hist_1970s_GSW_jamaal_wilkes', 'GSW', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 136, 15400000),
  ('hist_1970s_GSW_jeff_mullins', 'GSW', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 19, 15100000),
  ('hist_1970s_GSW_jerry_lucas', 'GSW', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4969, 29900000),
  ('hist_1970s_GSW_jim_barnett', 'GSW', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4865, 1340000),
  ('hist_1970s_GSW_jim_king', 'GSW', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 4914, 7420000),
  ('hist_1970s_GSW_jo_jo_white', 'GSW', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 5301, 1440000),
  ('hist_1970s_GSW_joe_ellis', 'GSW', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2933, 910000),
  ('hist_1970s_GSW_john_lucas', 'GSW', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 2324, 22000000),
  ('hist_1970s_GSW_nate_thurmond', 'GSW', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 5271, 30800000),
  ('hist_1970s_GSW_nate_williams', 'GSW', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1729, 639000),
  ('hist_1970s_GSW_phil_smith', 'GSW', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 5810, 8230000),
  ('hist_1970s_GSW_purvis_short', 'GSW', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3674, 1080000),
  ('hist_1970s_GSW_rick_barry', 'GSW', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 2357, 60600000),
  ('hist_1970s_GSW_robert_parish', 'GSW', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 670, 3600000),
  ('hist_1970s_GSW_ron_williams', 'GSW', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4557, 1280000),
  ('hist_1970s_GSW_sonny_parker', 'GSW', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4212, 1200000),
  ('hist_1970s_GSW_tom_abernethy', 'GSW', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 226, 301000),
  ('hist_1970s_HOU_art_williams', 'HOU', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 2086, 719000),
  ('hist_1970s_HOU_bernie_williams', 'HOU', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 791, 428000),
  ('hist_1970s_HOU_bingo_smith', 'HOU', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1181, 516000),
  ('hist_1970s_HOU_calvin_murphy', 'HOU', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 2100, 21300000),
  ('hist_1970s_HOU_cliff_meely', 'HOU', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2539, 821000),
  ('hist_1970s_HOU_dave_wohl', 'HOU', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 72, 266000),
  ('hist_1970s_HOU_don_adams', 'HOU', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4944, 1360000),
  ('hist_1970s_HOU_don_kojis', 'HOU', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2923, 5630000),
  ('hist_1970s_HOU_dwight_jones', 'HOU', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1417, 569000),
  ('hist_1970s_HOU_ed_ratleff', 'HOU', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2283, 764000),
  ('hist_1970s_HOU_elvin_hayes', 'HOU', '1970s', ARRAY['C', 'PF']::text[], 'legend', 4313, 69400000),
  ('hist_1970s_HOU_greg_smith', 'HOU', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3333, 1000000),
  ('hist_1970s_HOU_jack_marin', 'HOU', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3692, 6320000),
  ('hist_1970s_HOU_jim_barnett', 'HOU', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 2389, 5150000),
  ('hist_1970s_HOU_jimmy_walker', 'HOU', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 827, 17500000),
  ('hist_1970s_HOU_joe_meriweather', 'HOU', '1970s', ARRAY['C', 'PF']::text[], 'pro', 3753, 1090000),
  ('hist_1970s_HOU_john_block', 'HOU', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5318, 1450000),
  ('hist_1970s_HOU_john_johnson', 'HOU', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2923, 908000),
  ('hist_1970s_HOU_john_lucas', 'HOU', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 688, 3620000),
  ('hist_1970s_HOU_john_trapp', 'HOU', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2044, 710000),
  ('hist_1970s_HOU_kevin_kunnert', 'HOU', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4829, 1340000),
  ('hist_1970s_HOU_larry_siegfried', 'HOU', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 2975, 919000),
  ('hist_1970s_HOU_matt_guokas', 'HOU', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 230, 302000),
  ('hist_1970s_HOU_mike_dunleavy', 'HOU', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1522, 592000),
  ('hist_1970s_HOU_mike_newlin', 'HOU', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 1167, 4050000),
  ('hist_1970s_HOU_moses_malone', 'HOU', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 8061, 39200000),
  ('hist_1970s_HOU_otto_moore', 'HOU', '1970s', ARRAY['C', 'PF']::text[], 'pro', 5528, 1490000),
  ('hist_1970s_HOU_pat_riley', 'HOU', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 30, 257000),
  ('hist_1970s_HOU_rick_adelman', 'HOU', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1345, 553000),
  ('hist_1970s_HOU_rick_barry', 'HOU', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2688, 5420000),
  ('hist_1970s_HOU_robert_reid', 'HOU', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3133, 955000),
  ('hist_1970s_HOU_ron_riley', 'HOU', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 118, 277000),
  ('hist_1970s_HOU_rudy_tomjanovich', 'HOU', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2227, 21700000),
  ('hist_1970s_HOU_steve_hawes', 'HOU', '1970s', ARRAY['C', 'PF']::text[], 'pro', 558, 376000),
  ('hist_1970s_HOU_stu_lantz', 'HOU', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 836, 17500000),
  ('hist_1970s_HOU_toby_kimball', 'HOU', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 587, 382000),
  ('hist_1970s_HOU_zaid_abdul_aziz', 'HOU', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4087, 1170000),
  ('hist_1970s_IND_adrian_dantley', 'IND', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4688, 71100000),
  ('hist_1970s_IND_alex_english', 'IND', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 399, 16200000),
  ('hist_1970s_IND_billy_knight', 'IND', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5553, 31700000),
  ('hist_1970s_IND_bob_carrington', 'IND', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 623, 390000),
  ('hist_1970s_IND_dan_roundfield', 'IND', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2796, 5520000),
  ('hist_1970s_IND_darnell_hillman', 'IND', '1970s', ARRAY['C', 'PF']::text[], 'pro', 5062, 1390000),
  ('hist_1970s_IND_dave_robisch', 'IND', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4940, 1360000),
  ('hist_1970s_IND_don_buse', 'IND', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4507, 1260000),
  ('hist_1970s_IND_earl_tatum', 'IND', '1970s', ARRAY['SF', 'PF']::text[], 'all_star', 2072, 4860000),
  ('hist_1970s_IND_freddie_lewis', 'IND', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 443, 350000),
  ('hist_1970s_IND_james_edwards', 'IND', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 4724, 7250000),
  ('hist_1970s_IND_john_williamson', 'IND', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 1780, 20300000),
  ('hist_1970s_IND_johnny_davis', 'IND', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 1653, 20000000),
  ('hist_1970s_IND_len_elmore', 'IND', '1970s', ARRAY['C', 'PF']::text[], 'pro', 131, 279000),
  ('hist_1970s_IND_mike_bantom', 'IND', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 4561, 7100000),
  ('hist_1970s_IND_mike_flynn', 'IND', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 466, 355000),
  ('hist_1970s_IND_rick_robey', 'IND', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2546, 823000),
  ('hist_1970s_IND_ricky_sobers', 'IND', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 2791, 23400000),
  ('hist_1970s_IND_ron_behagen', 'IND', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4629, 1290000),
  ('hist_1970s_IND_wil_jones', 'IND', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 697, 3630000),
  ('hist_1970s_LAC_adrian_dantley', 'LAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3861, 26600000),
  ('hist_1970s_LAC_bill_hewitt', 'LAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 299, 317000),
  ('hist_1970s_LAC_bill_hosket', 'LAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 233, 302000),
  ('hist_1970s_LAC_bill_willoughby', 'LAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 653, 397000),
  ('hist_1970s_LAC_billy_knight', 'LAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 402, 51800000),
  ('hist_1970s_LAC_bird_averitt', 'LAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1466, 580000),
  ('hist_1970s_LAC_bob_kauffman', 'LAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 768, 17300000),
  ('hist_1970s_LAC_bob_mcadoo', 'LAC', '1970s', ARRAY['C', 'PF']::text[], 'legend', 4071, 68300000),
  ('hist_1970s_LAC_chuck_williams', 'LAC', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 492, 361000),
  ('hist_1970s_LAC_connie_norman', 'LAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 426, 346000),
  ('hist_1970s_LAC_cornell_warner', 'LAC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 915, 456000),
  ('hist_1970s_LAC_dave_wohl', 'LAC', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1125, 503000),
  ('hist_1970s_LAC_dick_garrett', 'LAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 4192, 1190000),
  ('hist_1970s_LAC_don_adams', 'LAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 361, 331000),
  ('hist_1970s_LAC_don_may', 'LAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3841, 26500000),
  ('hist_1970s_LAC_elmore_smith', 'LAC', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 4259, 27800000),
  ('hist_1970s_LAC_em_bryant', 'LAC', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 2523, 818000),
  ('hist_1970s_LAC_ernie_digregorio', 'LAC', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4767, 1320000),
  ('hist_1970s_LAC_fred_hilton', 'LAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1919, 682000),
  ('hist_1970s_LAC_freddie_crawford', 'LAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 184, 291000),
  ('hist_1970s_LAC_freeman_williams', 'LAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2401, 790000),
  ('hist_1970s_LAC_gar_heard', 'LAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2462, 5220000),
  ('hist_1970s_LAC_george_johnson', 'LAC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 3517, 1040000),
  ('hist_1970s_LAC_george_wilson', 'LAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 302, 318000),
  ('hist_1970s_LAC_herm_gilliam', 'LAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 4842, 1340000),
  ('hist_1970s_LAC_howard_komives', 'LAC', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 666, 400000),
  ('hist_1970s_LAC_jack_marin', 'LAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4570, 1280000),
  ('hist_1970s_LAC_jerry_chambers', 'LAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 446, 350000),
  ('hist_1970s_LAC_jim_mcdaniels', 'LAC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 285, 314000),
  ('hist_1970s_LAC_jim_mcmillian', 'LAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5674, 8110000),
  ('hist_1970s_LAC_john_gianelli', 'LAC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 1233, 527000),
  ('hist_1970s_LAC_john_hummer', 'LAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2972, 919000),
  ('hist_1970s_LAC_john_shumate', 'LAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3258, 5930000),
  ('hist_1970s_LAC_johnny_neumann', 'LAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1276, 537000),
  ('hist_1970s_LAC_ken_charles', 'LAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 951, 464000),
  ('hist_1970s_LAC_kermit_washington', 'LAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5708, 1530000),
  ('hist_1970s_LAC_kevin_kunnert', 'LAC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 410, 342000),
  ('hist_1970s_LAC_larry_mcneill', 'LAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4603, 1290000),
  ('hist_1970s_LAC_marvin_barnes', 'LAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5495, 1490000),
  ('hist_1970s_LAC_mike_davis', 'LAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2805, 881000),
  ('hist_1970s_LAC_mike_glenn', 'LAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 774, 424000),
  ('hist_1970s_LAC_nick_weatherspoon', 'LAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 90, 3080000),
  ('hist_1970s_LAC_randy_smith', 'LAC', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 3015, 24000000),
  ('hist_1970s_LAC_sidney_wicks', 'LAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3300, 993000),
  ('hist_1970s_LAC_swen_nater', 'LAC', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 3357, 6020000),
  ('hist_1970s_LAC_ted_mcclain', 'LAC', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 207, 297000),
  ('hist_1970s_LAC_walt_hazzard', 'LAC', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 2814, 5530000),
  ('hist_1970s_LAC_wil_jones', 'LAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1037, 483000),
  ('hist_1970s_LAC_world_b_free', 'LAC', '1970s', ARRAY['PG', 'SG']::text[], 'legend', 4634, 70900000),
  ('hist_1970s_LAL_adrian_dantley', 'LAL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1673, 20000000),
  ('hist_1970s_LAL_bill_bridges', 'LAL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3983, 1150000),
  ('hist_1970s_LAL_bo_lamar', 'LAL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 781, 426000),
  ('hist_1970s_LAL_brian_winters', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 4176, 1190000),
  ('hist_1970s_LAL_cazzie_russell', 'LAL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5757, 1550000),
  ('hist_1970s_LAL_charlie_scott', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 5308, 1440000),
  ('hist_1970s_LAL_connie_hawkins', 'LAL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5518, 1490000),
  ('hist_1970s_LAL_corky_calhoun', 'LAL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 269, 311000),
  ('hist_1970s_LAL_cornell_warner', 'LAL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2109, 725000),
  ('hist_1970s_LAL_dick_garrett', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 4360, 1230000),
  ('hist_1970s_LAL_don_chaney', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1237, 528000),
  ('hist_1970s_LAL_don_ford', 'LAL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1529, 594000),
  ('hist_1970s_LAL_donnie_freeman', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 3792, 1100000),
  ('hist_1970s_LAL_earl_tatum', 'LAL', '1970s', ARRAY['SF', 'PF']::text[], 'pro', 3431, 1020000),
  ('hist_1970s_LAL_elgin_baylor', 'LAL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4273, 69200000),
  ('hist_1970s_LAL_elmore_smith', 'LAL', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 1077, 3970000),
  ('hist_1970s_LAL_flynn_robinson', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2172, 739000),
  ('hist_1970s_LAL_gail_goodrich', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 5475, 31400000),
  ('hist_1970s_LAL_happy_hairston', 'LAL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 924, 17800000),
  ('hist_1970s_LAL_jamaal_wilkes', 'LAL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 29, 15100000),
  ('hist_1970s_LAL_james_edwards', 'LAL', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 2335, 5100000),
  ('hist_1970s_LAL_jerry_west', 'LAL', '1970s', ARRAY['PG', 'SG']::text[], 'legend', 8852, 89800000),
  ('hist_1970s_LAL_jim_mcmillian', 'LAL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2842, 5560000),
  ('hist_1970s_LAL_jim_price', 'LAL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3435, 1020000),
  ('hist_1970s_LAL_john_tresvant', 'LAL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 85, 269000),
  ('hist_1970s_LAL_johnny_egan', 'LAL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1112, 500000),
  ('hist_1970s_LAL_johnny_neumann', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 154, 285000),
  ('hist_1970s_LAL_kareem_abdul_jabbar', 'LAL', '1970s', ARRAY['C']::text[], 'legend', 9065, 90800000),
  ('hist_1970s_LAL_keith_erickson', 'LAL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3740, 1090000),
  ('hist_1970s_LAL_kenny_carr', 'LAL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 686, 404000),
  ('hist_1970s_LAL_kermit_washington', 'LAL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1266, 535000),
  ('hist_1970s_LAL_lou_hudson', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 4091, 1170000),
  ('hist_1970s_LAL_lucius_allen', 'LAL', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 5231, 7710000),
  ('hist_1970s_LAL_mack_calvin', 'LAL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 928, 459000),
  ('hist_1970s_LAL_mel_counts', 'LAL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2142, 732000),
  ('hist_1970s_LAL_norm_nixon', 'LAL', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 117, 15400000),
  ('hist_1970s_LAL_pat_riley', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 932, 460000),
  ('hist_1970s_LAL_rick_roberson', 'LAL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 1896, 677000),
  ('hist_1970s_LAL_ron_boone', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 794, 429000),
  ('hist_1970s_LAL_stan_love', 'LAL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 344, 327000),
  ('hist_1970s_LAL_stu_lantz', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 971, 468000),
  ('hist_1970s_LAL_tom_abernethy', 'LAL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 695, 406000),
  ('hist_1970s_LAL_willie_mccarter', 'LAL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 784, 426000),
  ('hist_1970s_LAL_wilt_chamberlain', 'LAL', '1970s', ARRAY['C']::text[], 'superstar', 9421, 43300000),
  ('hist_1970s_LAL_zelmo_beaty', 'LAL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 371, 333000),
  ('hist_1970s_MIL_alex_english', 'MIL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1342, 552000),
  ('hist_1970s_MIL_bob_boozer', 'MIL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2936, 911000),
  ('hist_1970s_MIL_bob_dandridge', 'MIL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3316, 24900000),
  ('hist_1970s_MIL_brian_winters', 'MIL', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 2733, 23200000),
  ('hist_1970s_MIL_cornell_warner', 'MIL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2149, 734000),
  ('hist_1970s_MIL_curtis_perry', 'MIL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3878, 1120000),
  ('hist_1970s_MIL_dave_meyers', 'MIL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4721, 1310000),
  ('hist_1970s_MIL_elmore_smith', 'MIL', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 2181, 4960000),
  ('hist_1970s_MIL_ernie_grunfeld', 'MIL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2260, 759000),
  ('hist_1970s_MIL_flynn_robinson', 'MIL', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 5465, 31400000),
  ('hist_1970s_MIL_fred_carter', 'MIL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1483, 584000),
  ('hist_1970s_MIL_freddie_crawford', 'MIL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1499, 587000),
  ('hist_1970s_MIL_gary_brokaw', 'MIL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1926, 683000),
  ('hist_1970s_MIL_george_johnson', 'MIL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 889, 450000),
  ('hist_1970s_MIL_george_thompson', 'MIL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 3891, 1130000),
  ('hist_1970s_MIL_greg_smith', 'MIL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4737, 1320000),
  ('hist_1970s_MIL_jim_price', 'MIL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 5908, 1580000),
  ('hist_1970s_MIL_john_block', 'MIL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2280, 763000),
  ('hist_1970s_MIL_john_gianelli', 'MIL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2309, 770000),
  ('hist_1970s_MIL_jon_mcglocklin', 'MIL', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 4179, 1190000),
  ('hist_1970s_MIL_junior_bridgeman', 'MIL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5291, 1440000),
  ('hist_1970s_MIL_kareem_abdul_jabbar', 'MIL', '1970s', ARRAY['C']::text[], 'goat', 2500, 120000000),
  ('hist_1970s_MIL_kent_benson', 'MIL', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4055, 1160000),
  ('hist_1970s_MIL_kevin_restani', 'MIL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 709, 410000),
  ('hist_1970s_MIL_len_chappell', 'MIL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1332, 550000),
  ('hist_1970s_MIL_lucius_allen', 'MIL', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 1376, 4240000),
  ('hist_1970s_MIL_marques_johnson', 'MIL', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 563, 52500000),
  ('hist_1970s_MIL_oscar_robertson', 'MIL', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 9110, 42300000),
  ('hist_1970s_MIL_quinn_buckner', 'MIL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3317, 996000),
  ('hist_1970s_MIL_swen_nater', 'MIL', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 2986, 5690000),
  ('hist_1970s_MIL_wali_jones', 'MIL', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 613, 388000),
  ('hist_1970s_MIL_zaid_abdul_aziz', 'MIL', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2093, 721000),
  ('hist_1970s_NYK_bill_bradley', 'NYK', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5295, 1440000),
  ('hist_1970s_NYK_bob_mcadoo', 'NYK', '1970s', ARRAY['C', 'PF']::text[], 'legend', 4500, 70300000),
  ('hist_1970s_NYK_butch_beard', 'NYK', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1814, 658000),
  ('hist_1970s_NYK_cazzie_russell', 'NYK', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3208, 972000),
  ('hist_1970s_NYK_dave_debusschere', 'NYK', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1245, 18700000),
  ('hist_1970s_NYK_dave_stallworth', 'NYK', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1676, 627000),
  ('hist_1970s_NYK_dean_meminger', 'NYK', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 92, 271000),
  ('hist_1970s_NYK_dick_barnett', 'NYK', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 4540, 1270000),
  ('hist_1970s_NYK_earl_monroe', 'NYK', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 5186, 7670000),
  ('hist_1970s_NYK_glen_gondrezick', 'NYK', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 125, 278000),
  ('hist_1970s_NYK_henry_bibby', 'NYK', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 430, 347000),
  ('hist_1970s_NYK_jerry_lucas', 'NYK', '1970s', ARRAY['C', 'PF']::text[], 'pro', 5990, 1600000),
  ('hist_1970s_NYK_jim_barnett', 'NYK', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 10, 252000),
  ('hist_1970s_NYK_jim_cleamons', 'NYK', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 2496, 812000),
  ('hist_1970s_NYK_jim_mcmillian', 'NYK', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2624, 840000),
  ('hist_1970s_NYK_joe_meriweather', 'NYK', '1970s', ARRAY['C', 'PF']::text[], 'pro', 3130, 954000),
  ('hist_1970s_NYK_john_gianelli', 'NYK', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2434, 798000),
  ('hist_1970s_NYK_lonnie_shelton', 'NYK', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 1050, 3950000),
  ('hist_1970s_NYK_marvin_webster', 'NYK', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 914, 3820000),
  ('hist_1970s_NYK_micheal_ray_richardson', 'NYK', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1053, 487000),
  ('hist_1970s_NYK_mike_glenn', 'NYK', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 777, 425000),
  ('hist_1970s_NYK_mike_riordan', 'NYK', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 384, 336000),
  ('hist_1970s_NYK_mo_layton', 'NYK', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 157, 285000),
  ('hist_1970s_NYK_neal_walk', 'NYK', '1970s', ARRAY['C', 'PF']::text[], 'pro', 669, 401000),
  ('hist_1970s_NYK_phil_jackson', 'NYK', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1040, 484000),
  ('hist_1970s_NYK_ray_williams', 'NYK', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 1394, 4250000),
  ('hist_1970s_NYK_spencer_haywood', 'NYK', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 350, 16100000),
  ('hist_1970s_NYK_toby_knight', 'NYK', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4373, 1230000),
  ('hist_1970s_NYK_tom_mcmillen', 'NYK', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2929, 909000),
  ('hist_1970s_NYK_walt_frazier', 'NYK', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 5212, 30600000),
  ('hist_1970s_NYK_willis_reed', 'NYK', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 2830, 23500000),
  ('hist_1970s_OKC_archie_clark', 'OKC', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 2299, 5070000),
  ('hist_1970s_OKC_art_harris', 'OKC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 5377, 1460000),
  ('hist_1970s_OKC_barry_clemens', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1161, 511000),
  ('hist_1970s_OKC_bob_boozer', 'OKC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4208, 6790000),
  ('hist_1970s_OKC_bob_rule', 'OKC', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 5640, 31900000),
  ('hist_1970s_OKC_bob_wilkerson', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1010, 477000),
  ('hist_1970s_OKC_bruce_seals', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3376, 1010000),
  ('hist_1970s_OKC_bud_stallworth', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 180, 291000),
  ('hist_1970s_OKC_butch_beard', 'OKC', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1030, 482000),
  ('hist_1970s_OKC_dennis_johnson', 'OKC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 5180, 1420000),
  ('hist_1970s_OKC_dick_gibbs', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3011, 927000),
  ('hist_1970s_OKC_dick_snyder', 'OKC', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 1910, 4720000),
  ('hist_1970s_OKC_don_kojis', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5370, 1460000),
  ('hist_1970s_OKC_dorie_murrey', 'OKC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 279, 313000),
  ('hist_1970s_OKC_erwin_mueller', 'OKC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1171, 513000),
  ('hist_1970s_OKC_fred_brown', 'OKC', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 4814, 7330000),
  ('hist_1970s_OKC_gar_heard', 'OKC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1263, 534000),
  ('hist_1970s_OKC_gus_williams', 'OKC', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 1079, 18200000),
  ('hist_1970s_OKC_herm_gilliam', 'OKC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1958, 691000),
  ('hist_1970s_OKC_jack_sikma', 'OKC', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 3186, 5870000),
  ('hist_1970s_OKC_jim_fox', 'OKC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 5219, 1420000),
  ('hist_1970s_OKC_jim_mcdaniels', 'OKC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 725, 413000),
  ('hist_1970s_OKC_john_brisker', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4517, 1270000),
  ('hist_1970s_OKC_john_johnson', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4707, 1310000),
  ('hist_1970s_OKC_john_tresvant', 'OKC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5944, 1590000),
  ('hist_1970s_OKC_kenny_mcintosh', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 551, 374000),
  ('hist_1970s_OKC_lee_winfield', 'OKC', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 2198, 745000),
  ('hist_1970s_OKC_lenny_wilkens', 'OKC', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 5407, 31200000),
  ('hist_1970s_OKC_leonard_gray', 'OKC', '1970s', ARRAY['SG', 'SF']::text[], 'pro', 5669, 1530000),
  ('hist_1970s_OKC_lonnie_shelton', 'OKC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5774, 1550000),
  ('hist_1970s_OKC_lucius_allen', 'OKC', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3684, 1080000),
  ('hist_1970s_OKC_marvin_webster', 'OKC', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 5457, 7910000),
  ('hist_1970s_OKC_mike_bantom', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2017, 704000),
  ('hist_1970s_OKC_mike_green', 'OKC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 3963, 1140000),
  ('hist_1970s_OKC_nick_weatherspoon', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5747, 1540000),
  ('hist_1970s_OKC_paul_silas', 'OKC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1270, 536000),
  ('hist_1970s_OKC_pete_cross', 'OKC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 1457, 578000),
  ('hist_1970s_OKC_slick_watts', 'OKC', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 5104, 1400000),
  ('hist_1970s_OKC_spencer_haywood', 'OKC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 4286, 69300000),
  ('hist_1970s_OKC_tom_burleson', 'OKC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 5321, 1450000),
  ('hist_1970s_OKC_tom_lagarde', 'OKC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4970, 1370000),
  ('hist_1970s_OKC_tom_meschery', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4678, 1300000),
  ('hist_1970s_OKC_wally_walker', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 472, 356000),
  ('hist_1970s_OKC_willie_norwood', 'OKC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 997, 474000),
  ('hist_1970s_OKC_zaid_abdul_aziz', 'OKC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4658, 1300000),
  ('hist_1970s_PHI_allan_bristow', 'PHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 246, 305000),
  ('hist_1970s_PHI_archie_clark', 'PHI', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 4639, 28900000),
  ('hist_1970s_PHI_bailey_howell', 'PHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3825, 1110000),
  ('hist_1970s_PHI_bill_bridges', 'PHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4950, 7460000),
  ('hist_1970s_PHI_billy_cunningham', 'PHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 3536, 65900000),
  ('hist_1970s_PHI_bob_rule', 'PHI', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 5430, 7890000),
  ('hist_1970s_PHI_bobby_jones', 'PHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5685, 1530000),
  ('hist_1970s_PHI_caldwell_jones', 'PHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2385, 787000),
  ('hist_1970s_PHI_clyde_lee', 'PHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 594, 384000),
  ('hist_1970s_PHI_connie_dierking', 'PHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 364, 332000),
  ('hist_1970s_PHI_dale_schlueter', 'PHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 367, 333000),
  ('hist_1970s_PHI_darrall_imhoff', 'PHI', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 3548, 6190000),
  ('hist_1970s_PHI_darryl_dawkins', 'PHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2946, 913000),
  ('hist_1970s_PHI_dave_sorenson', 'PHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 220, 300000),
  ('hist_1970s_PHI_dave_wohl', 'PHI', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1502, 588000),
  ('hist_1970s_PHI_dennis_awtrey', 'PHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 728, 414000),
  ('hist_1970s_PHI_don_may', 'PHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1775, 649000),
  ('hist_1970s_PHI_doug_collins', 'PHI', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 934, 17800000),
  ('hist_1970s_PHI_eric_money', 'PHI', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4324, 1220000),
  ('hist_1970s_PHI_fred_carter', 'PHI', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 2587, 22800000),
  ('hist_1970s_PHI_fred_foster', 'PHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1742, 642000),
  ('hist_1970s_PHI_fred_hetzel', 'PHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 213, 298000),
  ('hist_1970s_PHI_freddie_boyd', 'PHI', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 2185, 742000),
  ('hist_1970s_PHI_george_mcginnis', 'PHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 1982, 58900000),
  ('hist_1970s_PHI_george_wilson', 'PHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 282, 313000),
  ('hist_1970s_PHI_hal_greer', 'PHI', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 4842, 7360000),
  ('hist_1970s_PHI_henry_bibby', 'PHI', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4616, 1290000),
  ('hist_1970s_PHI_jeff_halliburton', 'PHI', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2467, 805000),
  ('hist_1970s_PHI_jim_washington', 'PHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 1068, 3960000),
  ('hist_1970s_PHI_joe_bryant', 'PHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 499, 362000),
  ('hist_1970s_PHI_john_block', 'PHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1887, 20700000),
  ('hist_1970s_PHI_john_trapp', 'PHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3687, 1080000),
  ('hist_1970s_PHI_julius_erving', 'PHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4111, 68500000),
  ('hist_1970s_PHI_kevin_loughery', 'PHI', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 5282, 1440000),
  ('hist_1970s_PHI_larry_cannon', 'PHI', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 495, 361000),
  ('hist_1970s_PHI_larry_jones', 'PHI', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3235, 978000),
  ('hist_1970s_PHI_leroy_ellis', 'PHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4438, 1250000),
  ('hist_1970s_PHI_luke_jackson', 'PHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1089, 495000),
  ('hist_1970s_PHI_manny_leaks', 'PHI', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4963, 1370000),
  ('hist_1970s_PHI_matt_guokas', 'PHI', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 663, 399000),
  ('hist_1970s_PHI_maurice_cheeks', 'PHI', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3320, 997000),
  ('hist_1970s_PHI_steve_mix', 'PHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5410, 1470000),
  ('hist_1970s_PHI_toby_kimball', 'PHI', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2096, 722000),
  ('hist_1970s_PHI_tom_van_arsdale', 'PHI', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1264, 18800000),
  ('hist_1970s_PHI_wali_jones', 'PHI', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3212, 973000),
  ('hist_1970s_PHI_world_b_free', 'PHI', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 5626, 1520000),
  ('hist_1970s_PHX_alvan_adams', 'PHX', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 3598, 25800000),
  ('hist_1970s_PHX_alvin_scott', 'PHX', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 758, 421000),
  ('hist_1970s_PHX_art_harris', 'PHX', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 948, 463000),
  ('hist_1970s_PHX_bill_chamberlain', 'PHX', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 79, 268000),
  ('hist_1970s_PHX_charlie_scott', 'PHX', '1970s', ARRAY['PG', 'SG']::text[], 'legend', 2089, 59400000),
  ('hist_1970s_PHX_clem_haskins', 'PHX', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 371, 3330000),
  ('hist_1970s_PHX_connie_hawkins', 'PHX', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5222, 30700000),
  ('hist_1970s_PHX_corky_calhoun', 'PHX', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1043, 485000),
  ('hist_1970s_PHX_curtis_perry', 'PHX', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5856, 1570000),
  ('hist_1970s_PHX_dennis_awtrey', 'PHX', '1970s', ARRAY['C', 'PF']::text[], 'pro', 1440, 574000),
  ('hist_1970s_PHX_dick_snyder', 'PHX', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1486, 584000),
  ('hist_1970s_PHX_dick_van_arsdale', 'PHX', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 4986, 7490000),
  ('hist_1970s_PHX_don_buse', 'PHX', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 2720, 862000),
  ('hist_1970s_PHX_earl_williams', 'PHX', '1970s', ARRAY['C', 'PF']::text[], 'pro', 312, 320000),
  ('hist_1970s_PHX_fred_saunders', 'PHX', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 102, 273000),
  ('hist_1970s_PHX_gail_goodrich', 'PHX', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 5378, 31100000),
  ('hist_1970s_PHX_gar_heard', 'PHX', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3353, 1000000),
  ('hist_1970s_PHX_gary_melchionni', 'PHX', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1302, 543000),
  ('hist_1970s_PHX_gus_johnson', 'PHX', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2336, 776000),
  ('hist_1970s_PHX_ira_terrell', 'PHX', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2270, 761000),
  ('hist_1970s_PHX_jerry_chambers', 'PHX', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1115, 501000),
  ('hist_1970s_PHX_jim_fox', 'PHX', '1970s', ARRAY['C', 'PF']::text[], 'pro', 5597, 1510000),
  ('hist_1970s_PHX_joel_kramer', 'PHX', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 400, 340000),
  ('hist_1970s_PHX_john_shumate', 'PHX', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4389, 1240000),
  ('hist_1970s_PHX_keith_erickson', 'PHX', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4619, 1290000),
  ('hist_1970s_PHX_lamar_green', 'PHX', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 417, 344000),
  ('hist_1970s_PHX_marty_byrnes', 'PHX', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 469, 356000),
  ('hist_1970s_PHX_mel_counts', 'PHX', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2037, 708000),
  ('hist_1970s_PHX_mike_bantom', 'PHX', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4724, 1310000),
  ('hist_1970s_PHX_mike_bratz', 'PHX', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 377, 335000),
  ('hist_1970s_PHX_mo_layton', 'PHX', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1493, 586000),
  ('hist_1970s_PHX_neal_walk', 'PHX', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 4570, 7110000),
  ('hist_1970s_PHX_otto_moore', 'PHX', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2077, 717000),
  ('hist_1970s_PHX_paul_silas', 'PHX', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 282, 15800000),
  ('hist_1970s_PHX_paul_westphal', 'PHX', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 5183, 30500000),
  ('hist_1970s_PHX_ricky_sobers', 'PHX', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 4363, 1230000),
  ('hist_1970s_PHX_ron_lee', 'PHX', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4301, 1220000),
  ('hist_1970s_PHX_truck_robinson', 'PHX', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5294, 7760000),
  ('hist_1970s_PHX_walter_davis', 'PHX', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 1339, 56000000),
  ('hist_1970s_POR_bernie_fryer', 'POR', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1174, 514000),
  ('hist_1970s_POR_bill_walton', 'POR', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 4522, 28600000),
  ('hist_1970s_POR_bob_gross', 'POR', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4143, 1180000),
  ('hist_1970s_POR_charlie_davis', 'POR', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1473, 581000),
  ('hist_1970s_POR_charlie_yelverton', 'POR', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1128, 504000),
  ('hist_1970s_POR_dale_schlueter', 'POR', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4740, 1320000),
  ('hist_1970s_POR_dave_twardzik', 'POR', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3031, 932000),
  ('hist_1970s_POR_dave_wohl', 'POR', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 46, 260000),
  ('hist_1970s_POR_ed_manning', 'POR', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1420, 570000),
  ('hist_1970s_POR_gary_gregor', 'POR', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4812, 1330000),
  ('hist_1970s_POR_geoff_petrie', 'POR', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 4629, 28900000),
  ('hist_1970s_POR_herm_gilliam', 'POR', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2388, 787000),
  ('hist_1970s_POR_jacky_dorsey', 'POR', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 161, 286000),
  ('hist_1970s_POR_jim_barnett', 'POR', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 1809, 20400000),
  ('hist_1970s_POR_john_johnson', 'POR', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5729, 8160000),
  ('hist_1970s_POR_johnny_davis', 'POR', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2182, 741000),
  ('hist_1970s_POR_larry_steele', 'POR', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1972, 694000),
  ('hist_1970s_POR_larue_martin', 'POR', '1970s', ARRAY['C', 'PF']::text[], 'pro', 115, 276000),
  ('hist_1970s_POR_lenny_wilkens', 'POR', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 981, 471000),
  ('hist_1970s_POR_leroy_ellis', 'POR', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 2334, 22000000),
  ('hist_1970s_POR_lionel_hollins', 'POR', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 1765, 4590000),
  ('hist_1970s_POR_lloyd_neal', 'POR', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4894, 1350000),
  ('hist_1970s_POR_maurice_lucas', 'POR', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4337, 28000000),
  ('hist_1970s_POR_mo_layton', 'POR', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 43, 260000),
  ('hist_1970s_POR_mychal_thompson', 'POR', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 3810, 6430000),
  ('hist_1970s_POR_ollie_johnson', 'POR', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2293, 766000),
  ('hist_1970s_POR_rick_adelman', 'POR', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3923, 1130000),
  ('hist_1970s_POR_rick_roberson', 'POR', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 2977, 5680000),
  ('hist_1970s_POR_robin_jones', 'POR', '1970s', ARRAY['C', 'PF']::text[], 'pro', 403, 341000),
  ('hist_1970s_POR_ron_brewer', 'POR', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 5075, 1390000),
  ('hist_1970s_POR_shaler_halimon', 'POR', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3323, 998000),
  ('hist_1970s_POR_sidney_wicks', 'POR', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 1661, 57500000),
  ('hist_1970s_POR_stan_mckenzie', 'POR', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5432, 1470000),
  ('hist_1970s_POR_steve_hawes', 'POR', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2106, 724000),
  ('hist_1970s_POR_steve_jones', 'POR', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 3, 251000),
  ('hist_1970s_POR_t_r_dunn', 'POR', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 249, 306000),
  ('hist_1970s_POR_terry_dischinger', 'POR', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 348, 328000),
  ('hist_1970s_POR_tom_owens', 'POR', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 3339, 6010000),
  ('hist_1970s_POR_william_smith', 'POR', '1970s', ARRAY['C', 'PF']::text[], 'pro', 863, 444000),
  ('hist_1970s_POR_willie_mccarter', 'POR', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 164, 287000),
  ('hist_1970s_POR_willie_norwood', 'POR', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 236, 303000),
  ('hist_1970s_SAC_bill_robinzine', 'SAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4058, 1160000),
  ('hist_1970s_SAC_bill_turner', 'SAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 843, 440000),
  ('hist_1970s_SAC_billy_mckinney', 'SAC', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1286, 539000),
  ('hist_1970s_SAC_bob_nash', 'SAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 33, 257000),
  ('hist_1970s_SAC_brian_taylor', 'SAC', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 5466, 7920000),
  ('hist_1970s_SAC_charlie_paulk', 'SAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2231, 752000),
  ('hist_1970s_SAC_connie_dierking', 'SAC', '1970s', ARRAY['C', 'PF']::text[], 'superstar', 146, 15400000),
  ('hist_1970s_SAC_darnell_hillman', 'SAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1411, 567000),
  ('hist_1970s_SAC_darrall_imhoff', 'SAC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 1640, 619000),
  ('hist_1970s_SAC_don_kojis', 'SAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2831, 887000),
  ('hist_1970s_SAC_flynn_robinson', 'SAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 4911, 1350000),
  ('hist_1970s_SAC_fred_foster', 'SAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 353, 3320000),
  ('hist_1970s_SAC_greg_hyder', 'SAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 108, 274000),
  ('hist_1970s_SAC_herm_gilliam', 'SAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2014, 703000),
  ('hist_1970s_SAC_jerry_lucas', 'SAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5531, 1490000),
  ('hist_1970s_SAC_jim_eakins', 'SAC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 702, 408000),
  ('hist_1970s_SAC_jim_fox', 'SAC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 5977, 1590000),
  ('hist_1970s_SAC_jimmy_walker', 'SAC', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 4977, 7480000),
  ('hist_1970s_SAC_john_block', 'SAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2267, 760000),
  ('hist_1970s_SAC_john_mengelt', 'SAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2165, 737000),
  ('hist_1970s_SAC_johnny_green', 'SAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5698, 1530000),
  ('hist_1970s_SAC_larry_mcneill', 'SAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2273, 761000),
  ('hist_1970s_SAC_lucius_allen', 'SAC', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 3438, 1020000),
  ('hist_1970s_SAC_luther_rackley', 'SAC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 1617, 614000),
  ('hist_1970s_SAC_marlon_redmond', 'SAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 617, 389000),
  ('hist_1970s_SAC_matt_guokas', 'SAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1683, 629000),
  ('hist_1970s_SAC_nate_williams', 'SAC', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 5177, 1410000),
  ('hist_1970s_SAC_norm_van_lier', 'SAC', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 4597, 7140000),
  ('hist_1970s_SAC_ollie_johnson', 'SAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1335, 550000),
  ('hist_1970s_SAC_oscar_robertson', 'SAC', '1970s', ARRAY['PG', 'SG']::text[], 'legend', 9066, 90800000),
  ('hist_1970s_SAC_otis_birdsong', 'SAC', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 943, 17800000),
  ('hist_1970s_SAC_phil_ford', 'SAC', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 992, 18000000),
  ('hist_1970s_SAC_richard_washington', 'SAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5213, 1420000),
  ('hist_1970s_SAC_ron_behagen', 'SAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4501, 1260000),
  ('hist_1970s_SAC_ron_boone', 'SAC', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 3151, 24500000),
  ('hist_1970s_SAC_ron_riley', 'SAC', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2316, 771000),
  ('hist_1970s_SAC_sam_lacey', 'SAC', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 2860, 5570000),
  ('hist_1970s_SAC_scott_wedman', 'SAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3738, 6360000),
  ('hist_1970s_SAC_tiny_archibald', 'SAC', '1970s', ARRAY['PG', 'SG']::text[], 'legend', 3830, 67200000),
  ('hist_1970s_SAC_tom_burleson', 'SAC', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2303, 768000),
  ('hist_1970s_SAC_tom_van_arsdale', 'SAC', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2985, 24000000),
  ('hist_1970s_SAS_allan_bristow', 'SAS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2506, 814000),
  ('hist_1970s_SAS_billy_paultz', 'SAS', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 3638, 6270000),
  ('hist_1970s_SAS_coby_dietrick', 'SAS', '1970s', ARRAY['C', 'PF']::text[], 'pro', 1867, 670000),
  ('hist_1970s_SAS_frankie_sanders', 'SAS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 331, 324000),
  ('hist_1970s_SAS_george_gervin', 'SAS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 6296, 78300000),
  ('hist_1970s_SAS_james_silas', 'SAS', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4094, 1170000),
  ('hist_1970s_SAS_jim_eakins', 'SAS', '1970s', ARRAY['C', 'PF']::text[], 'pro', 59, 263000),
  ('hist_1970s_SAS_larry_kenon', 'SAS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 696, 53100000),
  ('hist_1970s_SAS_louie_dampier', 'SAS', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 620, 390000),
  ('hist_1970s_SAS_mack_calvin', 'SAS', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1735, 640000),
  ('hist_1970s_SAS_mark_olberding', 'SAS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3136, 956000),
  ('hist_1970s_SAS_mike_gale', 'SAS', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 3733, 1090000),
  ('hist_1970s_SAS_mike_green', 'SAS', '1970s', ARRAY['C', 'PF']::text[], 'pro', 1391, 563000),
  ('hist_1970s_UTA_aaron_james', 'UTA', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3415, 1020000),
  ('hist_1970s_UTA_bud_stallworth', 'UTA', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1470, 581000),
  ('hist_1970s_UTA_e_c_coleman', 'UTA', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2572, 829000),
  ('hist_1970s_UTA_freddie_boyd', 'UTA', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1119, 502000),
  ('hist_1970s_UTA_gail_goodrich', 'UTA', '1970s', ARRAY['SG', 'PG']::text[], 'all_star', 1131, 4020000),
  ('hist_1970s_UTA_henry_bibby', 'UTA', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 2464, 804000),
  ('hist_1970s_UTA_james_hardy', 'UTA', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 869, 446000),
  ('hist_1970s_UTA_jim_barnett', 'UTA', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 5350, 1450000),
  ('hist_1970s_UTA_jim_mcelroy', 'UTA', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4563, 1280000),
  ('hist_1970s_UTA_joe_meriweather', 'UTA', '1970s', ARRAY['C', 'PF']::text[], 'pro', 1893, 676000),
  ('hist_1970s_UTA_john_block', 'UTA', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1227, 526000),
  ('hist_1970s_UTA_lamar_green', 'UTA', '1970s', ARRAY['C', 'PF']::text[], 'pro', 144, 282000),
  ('hist_1970s_UTA_louie_nelson', 'UTA', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4448, 1250000),
  ('hist_1970s_UTA_mel_counts', 'UTA', '1970s', ARRAY['C', 'PF']::text[], 'pro', 912, 455000),
  ('hist_1970s_UTA_nate_williams', 'UTA', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4560, 1280000),
  ('hist_1970s_UTA_neal_walk', 'UTA', '1970s', ARRAY['C', 'PF']::text[], 'pro', 4435, 1250000),
  ('hist_1970s_UTA_ollie_johnson', 'UTA', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1686, 629000),
  ('hist_1970s_UTA_otto_moore', 'UTA', '1970s', ARRAY['C', 'PF']::text[], 'pro', 3185, 967000),
  ('hist_1970s_UTA_paul_griffin', 'UTA', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 581, 381000),
  ('hist_1970s_UTA_pete_maravich', 'UTA', '1970s', ARRAY['SG', 'PG']::text[], 'legend', 6763, 80400000),
  ('hist_1970s_UTA_rich_kelley', 'UTA', '1970s', ARRAY['C', 'PF']::text[], 'pro', 5121, 1400000),
  ('hist_1970s_UTA_rick_adelman', 'UTA', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 479, 358000),
  ('hist_1970s_UTA_rick_roberson', 'UTA', '1970s', ARRAY['C', 'PF']::text[], 'pro', 2375, 784000),
  ('hist_1970s_UTA_ron_behagen', 'UTA', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4504, 1260000),
  ('hist_1970s_UTA_ron_lee', 'UTA', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1719, 637000),
  ('hist_1970s_UTA_slick_watts', 'UTA', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 1798, 655000),
  ('hist_1970s_UTA_spencer_haywood', 'UTA', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 3455, 65500000),
  ('hist_1970s_UTA_stu_lantz', 'UTA', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 318, 322000),
  ('hist_1970s_UTA_toby_kimball', 'UTA', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2152, 734000),
  ('hist_1970s_UTA_truck_robinson', 'UTA', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 4045, 68200000),
  ('hist_1970s_UTA_walt_bellamy', 'UTA', '1970s', ARRAY['C', 'PF']::text[], 'pro', 394, 339000),
  ('hist_1970s_WAS_archie_clark', 'WAS', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 4279, 27800000),
  ('hist_1970s_WAS_bob_dandridge', 'WAS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4308, 27900000),
  ('hist_1970s_WAS_charles_johnson', 'WAS', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1932, 685000),
  ('hist_1970s_WAS_dave_bing', 'WAS', '1970s', ARRAY['PG', 'SG']::text[], 'all_star', 1186, 4070000),
  ('hist_1970s_WAS_dave_stallworth', 'WAS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1381, 561000),
  ('hist_1970s_WAS_earl_monroe', 'WAS', '1970s', ARRAY['PG', 'SG']::text[], 'superstar', 4794, 29400000),
  ('hist_1970s_WAS_eddie_miles', 'WAS', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 2454, 802000),
  ('hist_1970s_WAS_elvin_hayes', 'WAS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 1687, 57600000),
  ('hist_1970s_WAS_flynn_robinson', 'WAS', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 449, 351000),
  ('hist_1970s_WAS_fred_carter', 'WAS', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 1338, 551000),
  ('hist_1970s_WAS_greg_ballard', 'WAS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 712, 410000),
  ('hist_1970s_WAS_gus_johnson', 'WAS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1712, 20100000),
  ('hist_1970s_WAS_jack_marin', 'WAS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3695, 26100000),
  ('hist_1970s_WAS_jimmy_jones', 'WAS', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 453, 352000),
  ('hist_1970s_WAS_john_tresvant', 'WAS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 604, 386000),
  ('hist_1970s_WAS_kevin_grevey', 'WAS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3002, 925000),
  ('hist_1970s_WAS_kevin_loughery', 'WAS', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 49, 15100000),
  ('hist_1970s_WAS_kevin_porter', 'WAS', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 4763, 1320000),
  ('hist_1970s_WAS_larry_wright', 'WAS', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 2188, 742000),
  ('hist_1970s_WAS_leonard_gray', 'WAS', '1970s', ARRAY['SG', 'SF']::text[], 'pro', 338, 326000),
  ('hist_1970s_WAS_leroy_ellis', 'WAS', '1970s', ARRAY['C', 'PF']::text[], 'pro', 879, 448000),
  ('hist_1970s_WAS_mike_davis', 'WAS', '1970s', ARRAY['SG', 'PG']::text[], 'pro', 3786, 1100000),
  ('hist_1970s_WAS_mike_riordan', 'WAS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5009, 1380000),
  ('hist_1970s_WAS_mitch_kupchak', 'WAS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5849, 1570000),
  ('hist_1970s_WAS_nick_weatherspoon', 'WAS', '1970s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1375, 559000),
  ('hist_1970s_WAS_phil_chenier', 'WAS', '1970s', ARRAY['SG', 'PG']::text[], 'superstar', 467, 16400000),
  ('hist_1970s_WAS_ray_scott', 'WAS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3169, 963000),
  ('hist_1970s_WAS_stan_love', 'WAS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1024, 480000),
  ('hist_1970s_WAS_tom_henderson', 'WAS', '1970s', ARRAY['PG', 'SG']::text[], 'pro', 5032, 1380000),
  ('hist_1970s_WAS_truck_robinson', 'WAS', '1970s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3609, 1060000),
  ('hist_1970s_WAS_wes_unseld', 'WAS', '1970s', ARRAY['C', 'PF']::text[], 'all_star', 3584, 6230000),
  ('hist_1980s_ATL_antoine_carr', 'ATL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 974, 469000),
  ('hist_1980s_ATL_charlie_criss', 'ATL', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 1935, 685000),
  ('hist_1980s_ATL_cliff_levingston', 'ATL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3162, 961000),
  ('hist_1980s_ATL_dan_roundfield', 'ATL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3501, 25500000),
  ('hist_1980s_ATL_doc_rivers', 'ATL', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 2425, 5180000),
  ('hist_1980s_ATL_dominique_wilkins', 'ATL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4997, 72500000),
  ('hist_1980s_ATL_eddie_johnson', 'ATL', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 5376, 7840000),
  ('hist_1980s_ATL_john_battle', 'ATL', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 935, 460000),
  ('hist_1980s_ATL_john_drew', 'ATL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1945, 20800000),
  ('hist_1980s_ATL_johnny_davis', 'ATL', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 4685, 1300000),
  ('hist_1980s_ATL_jon_koncak', 'ATL', '1980s', ARRAY['C', 'PF']::text[], 'pro', 768, 423000),
  ('hist_1980s_ATL_kevin_willis', 'ATL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5324, 1450000),
  ('hist_1980s_ATL_mike_glenn', 'ATL', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 938, 461000),
  ('hist_1980s_ATL_moses_malone', 'ATL', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 7954, 38900000),
  ('hist_1980s_ATL_randy_wittman', 'ATL', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 2821, 885000),
  ('hist_1980s_ATL_rudy_macklin', 'ATL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 335, 325000),
  ('hist_1980s_ATL_spud_webb', 'ATL', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 751, 419000),
  ('hist_1980s_ATL_steve_hawes', 'ATL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3556, 1050000),
  ('hist_1980s_ATL_tom_mcmillen', 'ATL', '1980s', ARRAY['C', 'PF']::text[], 'pro', 1975, 694000),
  ('hist_1980s_ATL_tree_rollins', 'ATL', '1980s', ARRAY['C', 'PF']::text[], 'pro', 1447, 576000),
  ('hist_1980s_BKN_albert_king', 'BKN', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5819, 8240000),
  ('hist_1980s_BKN_benoit_benjamin', 'BKN', '1980s', ARRAY['C', 'PF']::text[], 'pro', 5954, 1590000),
  ('hist_1980s_BKN_buck_williams', 'BKN', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1235, 18700000),
  ('hist_1980s_BKN_chris_morris', 'BKN', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 100, 3090000),
  ('hist_1980s_BKN_darryl_dawkins', 'BKN', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 1466, 4320000),
  ('hist_1980s_BKN_dennis_hopson', 'BKN', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 2615, 5350000),
  ('hist_1980s_BKN_john_bagley', 'BKN', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 4524, 1270000),
  ('hist_1980s_BKN_micheal_ray_richardson', 'BKN', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 4760, 7280000),
  ('hist_1980s_BKN_mike_gminski', 'BKN', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 5566, 8010000),
  ('hist_1980s_BKN_mike_newlin', 'BKN', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 4201, 27600000),
  ('hist_1980s_BKN_orlando_woolridge', 'BKN', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3433, 25300000),
  ('hist_1980s_BKN_otis_birdsong', 'BKN', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 185, 15600000),
  ('hist_1980s_BKN_roy_hinson', 'BKN', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2431, 22300000),
  ('hist_1980s_BKN_sam_bowie', 'BKN', '1980s', ARRAY['C', 'PF']::text[], 'pro', 4885, 1350000),
  ('hist_1980s_BKN_tony_brown', 'BKN', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 3796, 1100000),
  ('hist_1980s_BOS_bill_walton', 'BOS', '1980s', ARRAY['C', 'PF']::text[], 'pro', 1899, 677000),
  ('hist_1980s_BOS_cedric_maxwell', 'BOS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1475, 4330000),
  ('hist_1980s_BOS_chris_ford', 'BOS', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 1929, 684000),
  ('hist_1980s_BOS_danny_ainge', 'BOS', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 4770, 1320000),
  ('hist_1980s_BOS_dave_cowens', 'BOS', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 3819, 6440000),
  ('hist_1980s_BOS_dennis_johnson', 'BOS', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 2534, 5280000),
  ('hist_1980s_BOS_fred_roberts', 'BOS', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 23, 255000),
  ('hist_1980s_BOS_gerald_henderson', 'BOS', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 1922, 682000),
  ('hist_1980s_BOS_jerry_sichting', 'BOS', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 167, 288000),
  ('hist_1980s_BOS_kevin_mchale', 'BOS', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4301, 27900000),
  ('hist_1980s_BOS_larry_bird', 'BOS', '1980s', ARRAY['SF', 'PF']::text[], 'goat', 2750, 122000000),
  ('hist_1980s_BOS_m_l_carr', 'BOS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 194, 294000),
  ('hist_1980s_BOS_reggie_lewis', 'BOS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5150, 1410000),
  ('hist_1980s_BOS_rick_robey', 'BOS', '1980s', ARRAY['C', 'PF']::text[], 'pro', 1594, 609000),
  ('hist_1980s_BOS_robert_parish', 'BOS', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 2908, 23700000),
  ('hist_1980s_BOS_scott_wedman', 'BOS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 36, 258000),
  ('hist_1980s_BOS_tiny_archibald', 'BOS', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 2154, 4940000),
  ('hist_1980s_CHA_armon_gilliam', 'CHA', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2655, 23000000),
  ('hist_1980s_CHA_dave_hoppen', 'CHA', '1980s', ARRAY['C', 'PF']::text[], 'pro', 541, 372000),
  ('hist_1980s_CHA_dell_curry', 'CHA', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 5419, 1470000),
  ('hist_1980s_CHA_earl_cureton', 'CHA', '1980s', ARRAY['C', 'PF']::text[], 'pro', 1437, 573000),
  ('hist_1980s_CHA_j_r_reid', 'CHA', '1980s', ARRAY['C', 'PF']::text[], 'pro', 4973, 1370000),
  ('hist_1980s_CHA_kelly_tripucka', 'CHA', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1478, 19400000),
  ('hist_1980s_CHA_kenny_gattison', 'CHA', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 62, 264000),
  ('hist_1980s_CHA_kurt_rambis', 'CHA', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5147, 1410000),
  ('hist_1980s_CHA_michael_holton', 'CHA', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 1791, 653000),
  ('hist_1980s_CHA_micheal_williams', 'CHA', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 978, 470000),
  ('hist_1980s_CHA_muggsy_bogues', 'CHA', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 4084, 1170000),
  ('hist_1980s_CHA_randolph_keys', 'CHA', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3362, 1010000),
  ('hist_1980s_CHA_rex_chapman', 'CHA', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 4090, 6680000),
  ('hist_1980s_CHA_robert_reid', 'CHA', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3661, 1070000),
  ('hist_1980s_CHA_tim_kempton', 'CHA', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 522, 367000),
  ('hist_1980s_CHI_artis_gilmore', 'CHI', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 593, 16800000),
  ('hist_1980s_CHI_brad_sellers', 'CHI', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1653, 622000),
  ('hist_1980s_CHI_charles_oakley', 'CHI', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2805, 5520000),
  ('hist_1980s_CHI_dave_corzine', 'CHI', '1980s', ARRAY['C', 'PF']::text[], 'pro', 3855, 1120000),
  ('hist_1980s_CHI_dave_greenwood', 'CHI', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 1357, 4220000),
  ('hist_1980s_CHI_dwight_jones', 'CHI', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2139, 731000),
  ('hist_1980s_CHI_gene_banks', 'CHI', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4051, 1160000),
  ('hist_1980s_CHI_horace_grant', 'CHI', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3969, 1140000),
  ('hist_1980s_CHI_john_paxson', 'CHI', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 1962, 691000),
  ('hist_1980s_CHI_michael_jordan', 'CHI', '1980s', ARRAY['SG', 'SF']::text[], 'goat', 10000, 180000000),
  ('hist_1980s_CHI_orlando_woolridge', 'CHI', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5005, 7500000),
  ('hist_1980s_CHI_quintin_dailey', 'CHI', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 3267, 5940000),
  ('hist_1980s_CHI_reggie_theus', 'CHI', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 3666, 26000000),
  ('hist_1980s_CHI_ricky_sobers', 'CHI', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 5813, 1560000),
  ('hist_1980s_CHI_rod_higgins', 'CHI', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 984, 471000),
  ('hist_1980s_CHI_ronnie_lester', 'CHI', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 2897, 902000),
  ('hist_1980s_CHI_scottie_pippen', 'CHI', '1980s', ARRAY['SG', 'SF', 'PF']::text[], 'pro', 7905, 2030000),
  ('hist_1980s_CHI_sidney_green', 'CHI', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2956, 915000),
  ('hist_1980s_CLE_ben_poquette', 'CLE', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 112, 275000),
  ('hist_1980s_CLE_brad_daugherty', 'CLE', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 3092, 24300000),
  ('hist_1980s_CLE_cliff_robinson', 'CLE', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2519, 22600000),
  ('hist_1980s_CLE_craig_ehlo', 'CLE', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 1384, 561000),
  ('hist_1980s_CLE_dave_robisch', 'CLE', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 4063, 6660000),
  ('hist_1980s_CLE_geoff_huston', 'CLE', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 4606, 1290000),
  ('hist_1980s_CLE_hot_rod_williams', 'CLE', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5390, 1460000),
  ('hist_1980s_CLE_john_bagley', 'CLE', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 4248, 1210000),
  ('hist_1980s_CLE_kenny_carr', 'CLE', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2787, 5510000),
  ('hist_1980s_CLE_larry_nance', 'CLE', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 885, 17700000),
  ('hist_1980s_CLE_lonnie_shelton', 'CLE', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1863, 669000),
  ('hist_1980s_CLE_mark_price', 'CLE', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 2652, 5390000),
  ('hist_1980s_CLE_mark_west', 'CLE', '1980s', ARRAY['C', 'PF']::text[], 'pro', 272, 311000),
  ('hist_1980s_CLE_melvin_turpin', 'CLE', '1980s', ARRAY['C', 'PF']::text[], 'pro', 3441, 1020000),
  ('hist_1980s_CLE_mike_mitchell', 'CLE', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5319, 31000000),
  ('hist_1980s_CLE_phil_hubbard', 'CLE', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3691, 1080000),
  ('hist_1980s_CLE_randy_smith', 'CLE', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 4290, 6860000),
  ('hist_1980s_CLE_ron_harper', 'CLE', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 3569, 25700000),
  ('hist_1980s_CLE_roy_hinson', 'CLE', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 416, 3370000),
  ('hist_1980s_CLE_world_b_free', 'CLE', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 5455, 31400000),
  ('hist_1980s_DAL_adrian_dantley', 'DAL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2402, 22200000),
  ('hist_1980s_DAL_bill_garnett', 'DAL', '1980s', ARRAY['PF', 'C']::text[], 'pro', 568, 378000),
  ('hist_1980s_DAL_brad_davis', 'DAL', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 3917, 1130000),
  ('hist_1980s_DAL_dale_ellis', 'DAL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1122, 502000),
  ('hist_1980s_DAL_derek_harper', 'DAL', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 534, 3480000),
  ('hist_1980s_DAL_detlef_schrempf', 'DAL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1808, 657000),
  ('hist_1980s_DAL_elston_turner', 'DAL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 105, 274000),
  ('hist_1980s_DAL_geoff_huston', 'DAL', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 4452, 7010000),
  ('hist_1980s_DAL_james_donaldson', 'DAL', '1980s', ARRAY['C', 'PF']::text[], 'pro', 3986, 1150000),
  ('hist_1980s_DAL_jay_vincent', 'DAL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5511, 7960000),
  ('hist_1980s_DAL_jim_spanarkel', 'DAL', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 3402, 1020000),
  ('hist_1980s_DAL_kurt_nimphius', 'DAL', '1980s', ARRAY['C', 'PF']::text[], 'pro', 1076, 492000),
  ('hist_1980s_DAL_mark_aguirre', 'DAL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 2063, 59300000),
  ('hist_1980s_DAL_ollie_mack', 'DAL', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 2493, 811000),
  ('hist_1980s_DAL_pat_cummings', 'DAL', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 606, 3550000),
  ('hist_1980s_DAL_rolando_blackman', 'DAL', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 1488, 19500000),
  ('hist_1980s_DAL_roy_tarpley', 'DAL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5334, 1450000),
  ('hist_1980s_DAL_sam_perkins', 'DAL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2434, 5190000),
  ('hist_1980s_DAL_tom_lagarde', 'DAL', '1980s', ARRAY['C', 'PF']::text[], 'pro', 4937, 1360000),
  ('hist_1980s_DEN_alex_english', 'DEN', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4179, 68800000),
  ('hist_1980s_DEN_bill_hanzlik', 'DEN', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1801, 655000),
  ('hist_1980s_DEN_billy_mckinney', 'DEN', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 3799, 1100000),
  ('hist_1980s_DEN_blair_rasmussen', 'DEN', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2008, 702000),
  ('hist_1980s_DEN_calvin_natt', 'DEN', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 856, 17600000),
  ('hist_1980s_DEN_dan_issel', 'DEN', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 3880, 26600000),
  ('hist_1980s_DEN_danny_schayes', 'DEN', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2939, 911000),
  ('hist_1980s_DEN_dave_robisch', 'DEN', '1980s', ARRAY['C', 'PF']::text[], 'pro', 1184, 516000),
  ('hist_1980s_DEN_david_thompson', 'DEN', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 3131, 24400000),
  ('hist_1980s_DEN_fat_lever', 'DEN', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 4191, 27600000),
  ('hist_1980s_DEN_glen_gondrezick', 'DEN', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 764, 422000),
  ('hist_1980s_DEN_john_roche', 'DEN', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 2828, 886000),
  ('hist_1980s_DEN_kiki_vandeweghe', 'DEN', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5514, 31500000),
  ('hist_1980s_DEN_michael_adams', 'DEN', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 5873, 8290000),
  ('hist_1980s_DEN_mike_evans', 'DEN', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 1732, 640000),
  ('hist_1980s_DEN_rob_williams', 'DEN', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 3290, 990000),
  ('hist_1980s_DEN_t_r_dunn', 'DEN', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 574, 379000),
  ('hist_1980s_DEN_walter_davis', 'DEN', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 724, 3650000),
  ('hist_1980s_DEN_wayne_cooper', 'DEN', '1980s', ARRAY['C', 'PF']::text[], 'pro', 3559, 1050000),
  ('hist_1980s_DET_adrian_dantley', 'DET', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4425, 28300000),
  ('hist_1980s_DET_bill_laimbeer', 'DET', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 3176, 5860000),
  ('hist_1980s_DET_bob_lanier', 'DET', '1980s', ARRAY['C', 'PF']::text[], 'legend', 643, 52900000),
  ('hist_1980s_DET_bob_mcadoo', 'DET', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 4113, 27300000),
  ('hist_1980s_DET_dan_roundfield', 'DET', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5987, 1600000),
  ('hist_1980s_DET_david_greenwood', 'DET', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3343, 1000000),
  ('hist_1980s_DET_dennis_rodman', 'DET', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 7179, 1870000),
  ('hist_1980s_DET_earl_cureton', 'DET', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 892, 451000),
  ('hist_1980s_DET_eric_money', 'DET', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 5163, 1410000),
  ('hist_1980s_DET_isiah_thomas', 'DET', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 8056, 39200000),
  ('hist_1980s_DET_james_edwards', 'DET', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 3104, 5790000),
  ('hist_1980s_DET_joe_dumars', 'DET', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 5367, 7830000),
  ('hist_1980s_DET_john_long', 'DET', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 2054, 4850000),
  ('hist_1980s_DET_john_salley', 'DET', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2952, 914000),
  ('hist_1980s_DET_kelly_tripucka', 'DET', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4464, 28400000),
  ('hist_1980s_DET_kent_benson', 'DET', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2959, 916000),
  ('hist_1980s_DET_mark_aguirre', 'DET', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3267, 24800000),
  ('hist_1980s_DET_rick_mahorn', 'DET', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2080, 718000),
  ('hist_1980s_DET_sedale_threatt', 'DET', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 570, 3510000),
  ('hist_1980s_DET_steve_colter', 'DET', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 1352, 554000),
  ('hist_1980s_DET_terry_tyler', 'DET', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5186, 1420000),
  ('hist_1980s_DET_vinnie_johnson', 'DET', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 5278, 1440000),
  ('hist_1980s_GSW_bernard_king', 'GSW', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 295, 51300000),
  ('hist_1980s_GSW_chris_mullin', 'GSW', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 3777, 67000000),
  ('hist_1980s_GSW_eric_sleepy_whitehead', 'GSW', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 4219, 1200000),
  ('hist_1980s_GSW_jim_petersen', 'GSW', '1980s', ARRAY['C', 'PF']::text[], 'pro', 1853, 667000),
  ('hist_1980s_GSW_joe_barry_carroll', 'GSW', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 3890, 26700000),
  ('hist_1980s_GSW_keith_smart', 'GSW', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 2116, 726000),
  ('hist_1980s_GSW_larry_smith', 'GSW', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3881, 1120000),
  ('hist_1980s_GSW_mickey_johnson', 'GSW', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2510, 815000),
  ('hist_1980s_GSW_mitch_richmond', 'GSW', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 5562, 31700000),
  ('hist_1980s_GSW_phil_smith', 'GSW', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 2878, 5590000),
  ('hist_1980s_GSW_purvis_short', 'GSW', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5485, 31500000),
  ('hist_1980s_GSW_reggie_williams', 'GSW', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1176, 4060000),
  ('hist_1980s_GSW_ricky_pierce', 'GSW', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 5619, 1510000),
  ('hist_1980s_GSW_sam_williams', 'GSW', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2715, 5440000),
  ('hist_1980s_GSW_sleepy_floyd', 'GSW', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 2169, 21500000),
  ('hist_1980s_GSW_steve_johnson', 'GSW', '1980s', ARRAY['C', 'PF']::text[], 'pro', 5672, 1530000),
  ('hist_1980s_GSW_terry_teagle', 'GSW', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 1113, 4000000),
  ('hist_1980s_GSW_tom_tolbert', 'GSW', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2155, 735000),
  ('hist_1980s_GSW_winston_garland', 'GSW', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 5734, 1540000),
  ('hist_1980s_GSW_world_b_free', 'GSW', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 5018, 30100000),
  ('hist_1980s_HOU_allen_leavell', 'HOU', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 5013, 1380000),
  ('hist_1980s_HOU_billy_paultz', 'HOU', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2657, 848000),
  ('hist_1980s_HOU_buck_johnson', 'HOU', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5547, 1500000),
  ('hist_1980s_HOU_caldwell_jones', 'HOU', '1980s', ARRAY['C', 'PF']::text[], 'pro', 919, 457000),
  ('hist_1980s_HOU_granville_waiters', 'HOU', '1980s', ARRAY['C', 'PF']::text[], 'pro', 407, 342000),
  ('hist_1980s_HOU_hakeem_olajuwon', 'HOU', '1980s', ARRAY['C']::text[], 'legend', 4914, 72100000),
  ('hist_1980s_HOU_jim_petersen', 'HOU', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2431, 797000),
  ('hist_1980s_HOU_john_lucas', 'HOU', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 506, 16500000),
  ('hist_1980s_HOU_lewis_lloyd', 'HOU', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 78, 15200000),
  ('hist_1980s_HOU_major_jones', 'HOU', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1890, 675000),
  ('hist_1980s_HOU_mike_dunleavy', 'HOU', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 4196, 1190000),
  ('hist_1980s_HOU_mike_woodson', 'HOU', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 2597, 5340000),
  ('hist_1980s_HOU_mitchell_wiggins', 'HOU', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 1158, 4040000),
  ('hist_1980s_HOU_moses_malone', 'HOU', '1980s', ARRAY['C', 'PF']::text[], 'legend', 6470, 79100000),
  ('hist_1980s_HOU_otis_thorpe', 'HOU', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4172, 6750000),
  ('hist_1980s_HOU_ralph_sampson', 'HOU', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 5446, 31300000),
  ('hist_1980s_HOU_robert_mcnamara', 'HOU', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 75, 267000),
  ('hist_1980s_HOU_robert_reid', 'HOU', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1267, 4140000),
  ('hist_1980s_HOU_rodney_mccray', 'HOU', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 253, 15800000),
  ('hist_1980s_HOU_sleepy_floyd', 'HOU', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 2003, 21000000),
  ('hist_1980s_HOU_steve_harris', 'HOU', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 1781, 651000),
  ('hist_1980s_IND_billy_knight', 'IND', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 4615, 7150000),
  ('hist_1980s_IND_butch_carter', 'IND', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 4199, 1190000),
  ('hist_1980s_IND_chuck_person', 'IND', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3715, 26100000),
  ('hist_1980s_IND_clark_kellogg', 'IND', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3900, 26700000),
  ('hist_1980s_IND_darnell_hillman', 'IND', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3346, 1000000),
  ('hist_1980s_IND_detlef_schrempf', 'IND', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1032, 3930000),
  ('hist_1980s_IND_herb_williams', 'IND', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 4968, 7470000),
  ('hist_1980s_IND_james_edwards', 'IND', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 3756, 6380000),
  ('hist_1980s_IND_jerry_sichting', 'IND', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 4002, 1150000),
  ('hist_1980s_IND_john_long', 'IND', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 3864, 6480000),
  ('hist_1980s_IND_johnny_davis', 'IND', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 4379, 1240000),
  ('hist_1980s_IND_michael_williams', 'IND', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 5692, 1530000),
  ('hist_1980s_IND_reggie_miller', 'IND', '1980s', ARRAY['SG', 'SF']::text[], 'all_star', 8951, 11100000),
  ('hist_1980s_IND_ricky_sobers', 'IND', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 3014, 5710000),
  ('hist_1980s_IND_steve_johnson', 'IND', '1980s', ARRAY['C', 'PF']::text[], 'pro', 4632, 1290000),
  ('hist_1980s_IND_steve_stipanovich', 'IND', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 1059, 3950000),
  ('hist_1980s_IND_stuart_gray', 'IND', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1394, 564000),
  ('hist_1980s_IND_vern_fleming', 'IND', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 3982, 6580000),
  ('hist_1980s_IND_wayman_tisdale', 'IND', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1410, 19200000),
  ('hist_1980s_IND_wayne_radford', 'IND', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 2201, 745000),
  ('hist_1980s_LAC_benoit_benjamin', 'LAC', '1980s', ARRAY['C', 'PF']::text[], 'pro', 5957, 1590000),
  ('hist_1980s_LAC_danny_manning', 'LAC', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5520, 7970000),
  ('hist_1980s_LAC_derek_smith', 'LAC', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2824, 5540000),
  ('hist_1980s_LAC_james_donaldson', 'LAC', '1980s', ARRAY['C', 'PF']::text[], 'pro', 4983, 1370000),
  ('hist_1980s_LAC_ken_norman', 'LAC', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4698, 1310000),
  ('hist_1980s_LAC_marques_johnson', 'LAC', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4512, 28500000),
  ('hist_1980s_LAC_michael_brooks', 'LAC', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 700, 17100000),
  ('hist_1980s_LAC_michael_cage', 'LAC', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5859, 1570000),
  ('hist_1980s_LAC_norm_nixon', 'LAC', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 2489, 22500000),
  ('hist_1980s_LAC_quintin_dailey', 'LAC', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 3141, 24400000),
  ('hist_1980s_LAC_ron_harper', 'LAC', '1980s', ARRAY['SG', 'PG']::text[], 'legend', 1366, 56100000),
  ('hist_1980s_LAC_swen_nater', 'LAC', '1980s', ARRAY['C', 'PF']::text[], 'pro', 3182, 966000),
  ('hist_1980s_LAC_terry_cummings', 'LAC', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 3214, 64500000),
  ('hist_1980s_LAC_tom_chambers', 'LAC', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3686, 26100000),
  ('hist_1980s_LAC_world_b_free', 'LAC', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 5028, 30100000),
  ('hist_1980s_LAL_a_c_green', 'LAL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5514, 1490000),
  ('hist_1980s_LAL_bob_mcadoo', 'LAL', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2900, 903000),
  ('hist_1980s_LAL_byron_scott', 'LAL', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 5629, 8070000),
  ('hist_1980s_LAL_jamaal_wilkes', 'LAL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 817, 17500000),
  ('hist_1980s_LAL_james_worthy', 'LAL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 7234, 36700000),
  ('hist_1980s_LAL_kareem_abdul_jabbar', 'LAL', '1980s', ARRAY['C']::text[], 'superstar', 9403, 43200000),
  ('hist_1980s_LAL_kurt_rambis', 'LAL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3612, 1060000),
  ('hist_1980s_LAL_magic_johnson', 'LAL', '1980s', ARRAY['PG', 'SG', 'SF']::text[], 'goat', 4375, 135000000),
  ('hist_1980s_LAL_michael_cooper', 'LAL', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 3920, 1130000),
  ('hist_1980s_LAL_mike_mcgee', 'LAL', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 3015, 928000),
  ('hist_1980s_LAL_mychal_thompson', 'LAL', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 4362, 6930000),
  ('hist_1980s_LAL_norm_nixon', 'LAL', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 3705, 26100000),
  ('hist_1980s_LAL_orlando_woolridge', 'LAL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3744, 26200000),
  ('hist_1980s_LAL_sam_perkins', 'LAL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4027, 6620000),
  ('hist_1980s_LAL_vlade_divac', 'LAL', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2769, 873000),
  ('hist_1980s_MIA_anthony_taylor', 'MIA', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 610, 387000),
  ('hist_1980s_MIA_billy_thompson', 'MIA', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4891, 1350000),
  ('hist_1980s_MIA_glen_rice', 'MIA', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5820, 1560000),
  ('hist_1980s_MIA_grant_long', 'MIA', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3950, 1140000),
  ('hist_1980s_MIA_jon_sundvold', 'MIA', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 1106, 499000),
  ('hist_1980s_MIA_kevin_edwards', 'MIA', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 5583, 1510000),
  ('hist_1980s_MIA_pat_cummings', 'MIA', '1980s', ARRAY['C', 'PF']::text[], 'pro', 837, 438000),
  ('hist_1980s_MIA_pearl_washington', 'MIA', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 2001, 700000),
  ('hist_1980s_MIA_rony_seikaly', 'MIA', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 1339, 4210000),
  ('hist_1980s_MIA_rory_sparrow', 'MIA', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 3238, 979000),
  ('hist_1980s_MIA_sherman_douglas', 'MIA', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 4244, 6820000),
  ('hist_1980s_MIA_sylvester_gray', 'MIA', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2300, 768000),
  ('hist_1980s_MIA_tellis_frank', 'MIA', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2920, 907000),
  ('hist_1980s_MIL_alvin_robertson', 'MIL', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 1216, 18600000),
  ('hist_1980s_MIL_bob_lanier', 'MIL', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 4152, 27500000),
  ('hist_1980s_MIL_brian_winters', 'MIL', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 3376, 6040000),
  ('hist_1980s_MIL_craig_hodges', 'MIL', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 3520, 1040000),
  ('hist_1980s_MIL_dave_meyers', 'MIL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4222, 1200000),
  ('hist_1980s_MIL_jack_sikma', 'MIL', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 603, 16800000),
  ('hist_1980s_MIL_jay_humphries', 'MIL', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 1412, 4270000),
  ('hist_1980s_MIL_jerome_whitehead', 'MIL', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2319, 772000),
  ('hist_1980s_MIL_junior_bridgeman', 'MIL', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 5629, 1520000),
  ('hist_1980s_MIL_marques_johnson', 'MIL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5066, 30200000),
  ('hist_1980s_MIL_paul_pressey', 'MIL', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2172, 4950000),
  ('hist_1980s_MIL_randy_breuer', 'MIL', '1980s', ARRAY['C', 'PF']::text[], 'pro', 1873, 671000),
  ('hist_1980s_MIL_ricky_pierce', 'MIL', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 4778, 7300000),
  ('hist_1980s_MIL_sidney_moncrief', 'MIL', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 4298, 27900000),
  ('hist_1980s_MIL_terry_cummings', 'MIL', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 3509, 65800000),
  ('hist_1980s_NYK_bernard_king', 'NYK', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 2732, 62300000),
  ('hist_1980s_NYK_bill_cartwright', 'NYK', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 340, 16000000),
  ('hist_1980s_NYK_charles_oakley', 'NYK', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2045, 4840000),
  ('hist_1980s_NYK_gerald_wilkins', 'NYK', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 1756, 4580000),
  ('hist_1980s_NYK_johnny_newman', 'NYK', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3041, 5740000),
  ('hist_1980s_NYK_kiki_vandeweghe', 'NYK', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1770, 20300000),
  ('hist_1980s_NYK_louis_orr', 'NYK', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4773, 1320000),
  ('hist_1980s_NYK_mark_jackson', 'NYK', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 1021, 18100000),
  ('hist_1980s_NYK_patrick_ewing', 'NYK', '1980s', ARRAY['C']::text[], 'legend', 5371, 74200000),
  ('hist_1980s_NYK_ray_williams', 'NYK', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 1536, 19600000),
  ('hist_1980s_NYK_rory_sparrow', 'NYK', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 4701, 1310000),
  ('hist_1980s_NYK_sidney_green', 'NYK', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5262, 1430000),
  ('hist_1980s_NYK_stewart_granger', 'NYK', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 1312, 545000),
  ('hist_1980s_NYK_trent_tucker', 'NYK', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 3989, 1150000),
  ('hist_1980s_NYK_truck_robinson', 'NYK', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3330, 6000000),
  ('hist_1980s_OKC_al_wood', 'OKC', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 452, 3410000),
  ('hist_1980s_OKC_dale_ellis', 'OKC', '1980s', ARRAY['SG', 'PG']::text[], 'legend', 1045, 54700000),
  ('hist_1980s_OKC_danny_vranes', 'OKC', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 305, 319000),
  ('hist_1980s_OKC_derrick_mckey', 'OKC', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1222, 4100000),
  ('hist_1980s_OKC_fred_brown', 'OKC', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 335, 3300000),
  ('hist_1980s_OKC_gerald_henderson', 'OKC', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 5154, 1410000),
  ('hist_1980s_OKC_gus_williams', 'OKC', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 5494, 31500000),
  ('hist_1980s_OKC_jack_sikma', 'OKC', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 613, 16800000),
  ('hist_1980s_OKC_marvin_webster', 'OKC', '1980s', ARRAY['C', 'PF']::text[], 'pro', 4071, 1170000),
  ('hist_1980s_OKC_nate_mcmillan', 'OKC', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 4074, 1170000),
  ('hist_1980s_OKC_olden_polynice', 'OKC', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2346, 778000),
  ('hist_1980s_OKC_paul_westphal', 'OKC', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 2956, 23900000),
  ('hist_1980s_OKC_sam_perkins', 'OKC', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4154, 6740000),
  ('hist_1980s_OKC_sedale_threatt', 'OKC', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 3475, 6130000),
  ('hist_1980s_OKC_tom_chambers', 'OKC', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4376, 28100000),
  ('hist_1980s_OKC_xavier_mcdaniel', 'OKC', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4483, 28400000),
  ('hist_1980s_PHI_andrew_toney', 'PHI', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 3637, 25900000),
  ('hist_1980s_PHI_bobby_jones', 'PHI', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2500, 813000),
  ('hist_1980s_PHI_charles_barkley', 'PHI', '1980s', ARRAY['PF', 'C']::text[], 'legend', 5878, 76500000),
  ('hist_1980s_PHI_clint_richardson', 'PHI', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 4986, 1370000),
  ('hist_1980s_PHI_hersey_hawkins', 'PHI', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 733, 3660000),
  ('hist_1980s_PHI_jeff_ruland', 'PHI', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 3238, 24700000),
  ('hist_1980s_PHI_johnny_dawkins', 'PHI', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 1231, 4110000),
  ('hist_1980s_PHI_julius_erving', 'PHI', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 3629, 66300000),
  ('hist_1980s_PHI_maurice_cheeks', 'PHI', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 262, 3240000),
  ('hist_1980s_PHI_mike_gminski', 'PHI', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 4932, 7440000),
  ('hist_1980s_PHI_moses_malone', 'PHI', '1980s', ARRAY['C', 'PF']::text[], 'legend', 5398, 74300000),
  ('hist_1980s_PHI_sedale_threatt', 'PHI', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 3484, 6140000),
  ('hist_1980s_PHI_tony_campbell', 'PHI', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4776, 1320000),
  ('hist_1980s_PHX_alvan_adams', 'PHX', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 3801, 6420000),
  ('hist_1980s_PHX_armon_gilliam', 'PHX', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1429, 19300000),
  ('hist_1980s_PHX_curtis_perry', 'PHX', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2418, 794000),
  ('hist_1980s_PHX_eddie_johnson', 'PHX', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 4036, 27100000),
  ('hist_1980s_PHX_james_edwards', 'PHX', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 3991, 6590000),
  ('hist_1980s_PHX_jeff_cook', 'PHX', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1355, 555000),
  ('hist_1980s_PHX_jeff_hornacek', 'PHX', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 1196, 18600000),
  ('hist_1980s_PHX_kevin_johnson', 'PHX', '1980s', ARRAY['PG', 'SG']::text[], 'legend', 2384, 60700000),
  ('hist_1980s_PHX_kyle_macy', 'PHX', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 3113, 950000),
  ('hist_1980s_PHX_larry_drew', 'PHX', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 3497, 1040000),
  ('hist_1980s_PHX_larry_nance', 'PHX', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3783, 26300000),
  ('hist_1980s_PHX_mark_west', 'PHX', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2349, 779000),
  ('hist_1980s_PHX_mike_sanders', 'PHX', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2726, 863000),
  ('hist_1980s_PHX_tom_chambers', 'PHX', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 830, 53700000),
  ('hist_1980s_PHX_walter_davis', 'PHX', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 2966, 23900000),
  ('hist_1980s_POR_buck_williams', 'POR', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 1367, 4230000),
  ('hist_1980s_POR_calvin_natt', 'POR', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5900, 8310000),
  ('hist_1980s_POR_clyde_drexler', 'POR', '1980s', ARRAY['SG', 'PG']::text[], 'legend', 3282, 64800000),
  ('hist_1980s_POR_fat_lever', 'POR', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 5149, 7630000),
  ('hist_1980s_POR_jerome_kersey', 'POR', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2778, 5500000),
  ('hist_1980s_POR_jim_paxson', 'POR', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 1916, 20700000),
  ('hist_1980s_POR_kenny_carr', 'POR', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4927, 1360000),
  ('hist_1980s_POR_kevin_duckworth', 'POR', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 3973, 6580000),
  ('hist_1980s_POR_kiki_vandeweghe', 'POR', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 2973, 63400000),
  ('hist_1980s_POR_mike_schuler', 'POR', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 1279, 538000),
  ('hist_1980s_POR_mychal_thompson', 'POR', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 4371, 6930000),
  ('hist_1980s_POR_sam_bowie', 'POR', '1980s', ARRAY['C', 'PF']::text[], 'pro', 4888, 1350000),
  ('hist_1980s_POR_steve_johnson', 'POR', '1980s', ARRAY['C', 'PF']::text[], 'pro', 5675, 1530000),
  ('hist_1980s_POR_terry_porter', 'POR', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 2451, 22400000),
  ('hist_1980s_POR_wayne_cooper', 'POR', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2949, 914000),
  ('hist_1980s_SAC_billy_owens', 'SAC', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2950, 5660000),
  ('hist_1980s_SAC_danny_ainge', 'SAC', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 5459, 1480000),
  ('hist_1980s_SAC_derek_smith', 'SAC', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2833, 5550000),
  ('hist_1980s_SAC_ed_pinckney', 'SAC', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2057, 713000),
  ('hist_1980s_SAC_eddie_johnson', 'SAC', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 1070, 18200000),
  ('hist_1980s_SAC_joe_kleine', 'SAC', '1980s', ARRAY['C', 'PF']::text[], 'pro', 1722, 637000),
  ('hist_1980s_SAC_kenny_smith', 'SAC', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 1955, 4760000),
  ('hist_1980s_SAC_larry_drew', 'SAC', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 3553, 1050000),
  ('hist_1980s_SAC_larry_smith', 'SAC', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3513, 1040000),
  ('hist_1980s_SAC_lasalle_thompson', 'SAC', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5754, 1540000),
  ('hist_1980s_SAC_lionel_simmons', 'SAC', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3229, 24700000),
  ('hist_1980s_SAC_mark_olberding', 'SAC', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4422, 1240000),
  ('hist_1980s_SAC_mike_woodson', 'SAC', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 5611, 8050000),
  ('hist_1980s_SAC_otis_birdsong', 'SAC', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 194, 15600000),
  ('hist_1980s_SAC_phil_ford', 'SAC', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 5380, 1460000),
  ('hist_1980s_SAC_reggie_theus', 'SAC', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 2363, 22100000),
  ('hist_1980s_SAC_rory_sparrow', 'SAC', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 4704, 1310000),
  ('hist_1980s_SAC_sam_lacey', 'SAC', '1980s', ARRAY['C', 'PF']::text[], 'all_star', 2036, 4830000),
  ('hist_1980s_SAC_sleepy_floyd', 'SAC', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 1848, 20500000),
  ('hist_1980s_SAC_wayman_tisdale', 'SAC', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1527, 19600000),
  ('hist_1980s_SAS_alvin_robertson', 'SAS', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 1225, 18700000),
  ('hist_1980s_SAS_artis_gilmore', 'SAS', '1980s', ARRAY['C', 'PF']::text[], 'superstar', 2062, 21200000),
  ('hist_1980s_SAS_david_greenwood', 'SAS', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4261, 1210000),
  ('hist_1980s_SAS_frank_brickowski', 'SAS', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5190, 1420000),
  ('hist_1980s_SAS_gene_banks', 'SAS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3421, 6080000),
  ('hist_1980s_SAS_george_gervin', 'SAS', '1980s', ARRAY['SG', 'PG']::text[], 'legend', 6029, 77100000),
  ('hist_1980s_SAS_greg_anderson', 'SAS', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4225, 1200000),
  ('hist_1980s_SAS_john_paxson', 'SAS', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 5026, 1380000),
  ('hist_1980s_SAS_johnny_moore', 'SAS', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 5780, 1550000),
  ('hist_1980s_SAS_jon_sundvold', 'SAS', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 2178, 740000),
  ('hist_1980s_SAS_larry_kenon', 'SAS', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4000, 6600000),
  ('hist_1980s_SAS_mike_mitchell', 'SAS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2752, 23300000),
  ('hist_1980s_SAS_tyrone_corbin', 'SAS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3694, 1080000),
  ('hist_1980s_SAS_walter_berry', 'SAS', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 362, 3330000),
  ('hist_1980s_SAS_willie_anderson', 'SAS', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 525, 3470000),
  ('hist_1980s_UTA_adrian_dantley', 'UTA', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 1018, 54600000),
  ('hist_1980s_UTA_allan_bristow', 'UTA', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4950, 1360000),
  ('hist_1980s_UTA_ben_poquette', 'UTA', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3336, 1000000),
  ('hist_1980s_UTA_billy_mckinney', 'UTA', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 2615, 838000),
  ('hist_1980s_UTA_blue_edwards', 'UTA', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1968, 693000),
  ('hist_1980s_UTA_bob_hansen', 'UTA', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 958, 466000),
  ('hist_1980s_UTA_danny_schayes', 'UTA', '1980s', ARRAY['C', 'PF']::text[], 'pro', 4068, 1170000),
  ('hist_1980s_UTA_darrell_griffith', 'UTA', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 4787, 7310000),
  ('hist_1980s_UTA_jeff_wilkins', 'UTA', '1980s', ARRAY['C', 'PF']::text[], 'pro', 2050, 711000),
  ('hist_1980s_UTA_john_drew', 'UTA', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 301, 15900000),
  ('hist_1980s_UTA_john_stockton', 'UTA', '1980s', ARRAY['PG', 'SG']::text[], 'all_star', 5958, 8360000),
  ('hist_1980s_UTA_karl_malone', 'UTA', '1980s', ARRAY['PF', 'C']::text[], 'legend', 6924, 81200000),
  ('hist_1980s_UTA_kelly_tripucka', 'UTA', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2483, 809000),
  ('hist_1980s_UTA_pete_maravich', 'UTA', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 7311, 9580000),
  ('hist_1980s_UTA_rickey_green', 'UTA', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 5665, 1520000),
  ('hist_1980s_UTA_ron_boone', 'UTA', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 3999, 1150000),
  ('hist_1980s_UTA_terry_furlow', 'UTA', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 4100, 6690000),
  ('hist_1980s_UTA_thurl_bailey', 'UTA', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2281, 5050000),
  ('hist_1980s_UTA_tom_boswell', 'UTA', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1378, 560000),
  ('hist_1980s_WAS_bernard_king', 'WAS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3763, 26300000),
  ('hist_1980s_WAS_bob_dandridge', 'WAS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3095, 5790000),
  ('hist_1980s_WAS_cliff_robinson', 'WAS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2071, 21200000),
  ('hist_1980s_WAS_don_collins', 'WAS', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 2834, 888000),
  ('hist_1980s_WAS_elvin_hayes', 'WAS', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4716, 29100000),
  ('hist_1980s_WAS_frank_johnson', 'WAS', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 4202, 1200000),
  ('hist_1980s_WAS_greg_ballard', 'WAS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5104, 7590000),
  ('hist_1980s_WAS_gus_williams', 'WAS', '1980s', ARRAY['PG', 'SG']::text[], 'superstar', 690, 17100000),
  ('hist_1980s_WAS_jay_vincent', 'WAS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5285, 1440000),
  ('hist_1980s_WAS_jeff_malone', 'WAS', '1980s', ARRAY['SG', 'PG']::text[], 'superstar', 1925, 20800000),
  ('hist_1980s_WAS_jeff_ruland', 'WAS', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4347, 28000000),
  ('hist_1980s_WAS_john_williams', 'WAS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5925, 1580000),
  ('hist_1980s_WAS_kevin_grevey', 'WAS', '1980s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5534, 1500000),
  ('hist_1980s_WAS_ledell_eackles', 'WAS', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 4442, 1250000),
  ('hist_1980s_WAS_moses_malone', 'WAS', '1980s', ARRAY['C', 'PF']::text[], 'legend', 3791, 67100000),
  ('hist_1980s_WAS_ricky_sobers', 'WAS', '1980s', ARRAY['SG', 'PG']::text[], 'all_star', 3855, 6470000),
  ('hist_1980s_WAS_roger_phegley', 'WAS', '1980s', ARRAY['SG', 'PG']::text[], 'pro', 3198, 970000),
  ('hist_1980s_WAS_spencer_haywood', 'WAS', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4209, 1200000),
  ('hist_1980s_WAS_terry_catledge', 'WAS', '1980s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4527, 1270000),
  ('hist_1980s_WAS_wes_matthews', 'WAS', '1980s', ARRAY['PG', 'SG']::text[], 'pro', 5006, 1380000),
  ('hist_1990s_ATL_alan_henderson', 'ATL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 244, 3220000),
  ('hist_1990s_ATL_bimbo_coles', 'ATL', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 4635, 1290000),
  ('hist_1990s_ATL_christian_laettner', 'ATL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1459, 19400000),
  ('hist_1990s_ATL_craig_ehlo', 'ATL', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2119, 727000),
  ('hist_1990s_ATL_danny_manning', 'ATL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2460, 22400000),
  ('hist_1990s_ATL_dikembe_mutombo', 'ATL', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 4348, 6910000),
  ('hist_1990s_ATL_dominique_wilkins', 'ATL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 6925, 81200000),
  ('hist_1990s_ATL_elden_campbell', 'ATL', '1990s', ARRAY['C', 'PF']::text[], 'pro', 5203, 1420000),
  ('hist_1990s_ATL_grant_long', 'ATL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4806, 1330000),
  ('hist_1990s_ATL_jon_koncak', 'ATL', '1990s', ARRAY['C', 'PF']::text[], 'pro', 571, 378000),
  ('hist_1990s_ATL_kevin_willis', 'ATL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3618, 25900000),
  ('hist_1990s_ATL_laphonso_ellis', 'ATL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 1837, 4650000),
  ('hist_1990s_ATL_mookie_blaylock', 'ATL', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 3219, 24700000),
  ('hist_1990s_ATL_stacey_augmon', 'ATL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1792, 4610000),
  ('hist_1990s_ATL_steve_smith', 'ATL', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 797, 17400000),
  ('hist_1990s_ATL_tyrone_corbin', 'ATL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4790, 1330000),
  ('hist_1990s_BKN_chris_childs', 'BKN', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 3241, 979000),
  ('hist_1990s_BKN_chris_gatling', 'BKN', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4860, 7370000),
  ('hist_1990s_BKN_jamie_feick', 'BKN', '1990s', ARRAY['C', 'PF']::text[], 'pro', 899, 452000),
  ('hist_1990s_BKN_jason_kidd', 'BKN', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 4696, 29100000),
  ('hist_1990s_BKN_jayson_williams', 'BKN', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5997, 1600000),
  ('hist_1990s_BKN_johnny_newman', 'BKN', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5167, 1410000),
  ('hist_1990s_BKN_keith_van_horn', 'BKN', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2616, 22800000),
  ('hist_1990s_BKN_kendall_gill', 'BKN', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 4959, 7460000),
  ('hist_1990s_BKN_kerry_kittles', 'BKN', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 2869, 5580000),
  ('hist_1990s_BKN_lucious_harris', 'BKN', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 3628, 1070000),
  ('hist_1990s_BKN_rony_seikaly', 'BKN', '1990s', ARRAY['C', 'PF']::text[], 'superstar', 545, 16600000),
  ('hist_1990s_BKN_sam_cassell', 'BKN', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 4507, 7060000),
  ('hist_1990s_BKN_shawn_bradley', 'BKN', '1990s', ARRAY['C', 'PF']::text[], 'pro', 4954, 1360000),
  ('hist_1990s_BKN_sherman_douglas', 'BKN', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 5829, 1560000),
  ('hist_1990s_BKN_stephon_marbury', 'BKN', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 4778, 29300000),
  ('hist_1990s_BOS_antoine_walker', 'BOS', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5193, 30600000),
  ('hist_1990s_BOS_bruce_bowen', 'BOS', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 633, 392000),
  ('hist_1990s_BOS_dana_barros', 'BOS', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 5524, 31600000),
  ('hist_1990s_BOS_david_wesley', 'BOS', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 5633, 1520000),
  ('hist_1990s_BOS_dee_brown', 'BOS', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 3620, 6260000),
  ('hist_1990s_BOS_dino_radja', 'BOS', '1990s', ARRAY['C', 'PF']::text[], 'superstar', 126, 15400000),
  ('hist_1990s_BOS_ed_pinckney', 'BOS', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2323, 773000),
  ('hist_1990s_BOS_eric_williams', 'BOS', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1620, 4460000),
  ('hist_1990s_BOS_greg_minor', 'BOS', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2204, 746000),
  ('hist_1990s_BOS_larry_bird', 'BOS', '1990s', ARRAY['SF', 'PF']::text[], 'legend', 6493, 79200000),
  ('hist_1990s_BOS_pervis_ellison', 'BOS', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2962, 916000),
  ('hist_1990s_BOS_reggie_lewis', 'BOS', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 2976, 23900000),
  ('hist_1990s_BOS_rick_fox', 'BOS', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3466, 6120000),
  ('hist_1990s_BOS_sherman_douglas', 'BOS', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 5905, 1580000),
  ('hist_1990s_BOS_todd_day', 'BOS', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1928, 4740000),
  ('hist_1990s_BOS_vitaly_potapenko', 'BOS', '1990s', ARRAY['C', 'PF']::text[], 'pro', 3477, 1030000),
  ('hist_1990s_CHA_alonzo_mourning', 'CHA', '1990s', ARRAY['C', 'PF']::text[], 'superstar', 8386, 40200000),
  ('hist_1990s_CHA_anthony_mason', 'CHA', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3802, 26400000),
  ('hist_1990s_CHA_bobby_phills', 'CHA', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 5157, 1410000),
  ('hist_1990s_CHA_david_wesley', 'CHA', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 5823, 1560000),
  ('hist_1990s_CHA_dell_curry', 'CHA', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 5787, 1550000),
  ('hist_1990s_CHA_eddie_jones', 'CHA', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 5023, 7520000),
  ('hist_1990s_CHA_glen_rice', 'CHA', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5037, 30100000),
  ('hist_1990s_CHA_johnny_newman', 'CHA', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5081, 1390000),
  ('hist_1990s_CHA_kenny_anderson', 'CHA', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 1240, 4120000),
  ('hist_1990s_CHA_larry_johnson', 'CHA', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4619, 28900000),
  ('hist_1990s_CHA_matt_geiger', 'CHA', '1990s', ARRAY['C', 'PF']::text[], 'pro', 4425, 1250000),
  ('hist_1990s_CHA_muggsy_bogues', 'CHA', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 4498, 1260000),
  ('hist_1990s_CHA_rex_chapman', 'CHA', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 742, 3670000),
  ('hist_1990s_CHA_tony_delk', 'CHA', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 2808, 882000),
  ('hist_1990s_CHA_vlade_divac', 'CHA', '1990s', ARRAY['C', 'PF']::text[], 'pro', 5783, 1550000),
  ('hist_1990s_CHI_b_j_armstrong', 'CHI', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 1593, 4430000),
  ('hist_1990s_CHI_bill_cartwright', 'CHI', '1990s', ARRAY['C', 'PF']::text[], 'pro', 3953, 1140000),
  ('hist_1990s_CHI_dennis_rodman', 'CHI', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 8180, 2090000),
  ('hist_1990s_CHI_horace_grant', 'CHI', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4389, 6950000),
  ('hist_1990s_CHI_john_paxson', 'CHI', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 4573, 1280000),
  ('hist_1990s_CHI_jud_buechler', 'CHI', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 52, 262000),
  ('hist_1990s_CHI_luc_longley', 'CHI', '1990s', ARRAY['C', 'PF']::text[], 'pro', 4229, 1200000),
  ('hist_1990s_CHI_michael_jordan', 'CHI', '1990s', ARRAY['SG', 'SF']::text[], 'goat', 10000, 180000000),
  ('hist_1990s_CHI_randy_brown', 'CHI', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 515, 366000),
  ('hist_1990s_CHI_ron_harper', 'CHI', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 235, 3210000),
  ('hist_1990s_CHI_scott_burrell', 'CHI', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1506, 589000),
  ('hist_1990s_CHI_scottie_pippen', 'CHI', '1990s', ARRAY['SG', 'SF', 'PF']::text[], 'superstar', 9241, 42700000),
  ('hist_1990s_CHI_steve_kerr', 'CHI', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 1476, 582000),
  ('hist_1990s_CHI_toni_kukoc', 'CHI', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2489, 5240000),
  ('hist_1990s_CHI_will_perdue', 'CHI', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1197, 519000),
  ('hist_1990s_CLE_bobby_phills', 'CLE', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 5160, 1410000),
  ('hist_1990s_CLE_brad_daugherty', 'CLE', '1990s', ARRAY['C', 'PF']::text[], 'superstar', 4327, 28000000),
  ('hist_1990s_CLE_brevin_knight', 'CLE', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 3500, 1040000),
  ('hist_1990s_CLE_cedric_henderson', 'CLE', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2838, 889000),
  ('hist_1990s_CLE_chris_mills', 'CLE', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5436, 1470000),
  ('hist_1990s_CLE_craig_ehlo', 'CLE', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 561, 3500000),
  ('hist_1990s_CLE_danny_ferry', 'CLE', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3445, 1030000),
  ('hist_1990s_CLE_hot_rod_williams', 'CLE', '1990s', ARRAY['C', 'PF']::text[], 'pro', 5777, 1550000),
  ('hist_1990s_CLE_larry_nance', 'CLE', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 895, 17700000),
  ('hist_1990s_CLE_mark_price', 'CLE', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 1293, 18900000),
  ('hist_1990s_CLE_shawn_kemp', 'CLE', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5678, 32000000),
  ('hist_1990s_CLE_terrell_brandon', 'CLE', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 1400, 19200000),
  ('hist_1990s_CLE_tyrone_hill', 'CLE', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5055, 1390000),
  ('hist_1990s_CLE_vitaly_potapenko', 'CLE', '1990s', ARRAY['C', 'PF']::text[], 'pro', 3546, 1050000),
  ('hist_1990s_CLE_wesley_person', 'CLE', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 3631, 1070000),
  ('hist_1990s_DAL_a_c_green', 'DAL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4822, 1330000),
  ('hist_1990s_DAL_cedric_ceballos', 'DAL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2130, 21400000),
  ('hist_1990s_DAL_derek_harper', 'DAL', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 5222, 7700000),
  ('hist_1990s_DAL_george_mccloud', 'DAL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1663, 20000000),
  ('hist_1990s_DAL_hubert_davis', 'DAL', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2664, 849000),
  ('hist_1990s_DAL_jamal_mashburn', 'DAL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3024, 24100000),
  ('hist_1990s_DAL_jason_kidd', 'DAL', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 5056, 30200000),
  ('hist_1990s_DAL_jim_jackson', 'DAL', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 2742, 23200000),
  ('hist_1990s_DAL_loren_meyer', 'DAL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1358, 556000),
  ('hist_1990s_DAL_michael_finley', 'DAL', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 4814, 29400000),
  ('hist_1990s_DAL_popeye_jones', 'DAL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4976, 1370000),
  ('hist_1990s_DAL_roy_tarpley', 'DAL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2694, 23100000),
  ('hist_1990s_DAL_sam_cassell', 'DAL', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 1937, 4740000),
  ('hist_1990s_DAL_shawn_bradley', 'DAL', '1990s', ARRAY['C', 'PF']::text[], 'pro', 4898, 1350000),
  ('hist_1990s_DAL_tony_dumas', 'DAL', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2841, 889000),
  ('hist_1990s_DEN_anthony_goldwire', 'DEN', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 1978, 695000),
  ('hist_1990s_DEN_antonio_mcdyess', 'DEN', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2373, 22100000),
  ('hist_1990s_DEN_bison_dele', 'DEN', '1990s', ARRAY['C', 'PF']::text[], 'pro', 3481, 1030000),
  ('hist_1990s_DEN_bryant_stith', 'DEN', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 1774, 4600000),
  ('hist_1990s_DEN_dale_ellis', 'DEN', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 5792, 8210000),
  ('hist_1990s_DEN_dikembe_mutombo', 'DEN', '1990s', ARRAY['C', 'PF']::text[], 'superstar', 2956, 23900000),
  ('hist_1990s_DEN_johnny_newman', 'DEN', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5170, 1410000),
  ('hist_1990s_DEN_laphonso_ellis', 'DEN', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4018, 6620000),
  ('hist_1990s_DEN_mahmoud_abdul_rauf', 'DEN', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 175, 15500000),
  ('hist_1990s_DEN_michael_adams', 'DEN', '1990s', ARRAY['PG', 'SG']::text[], 'legend', 884, 54000000),
  ('hist_1990s_DEN_nick_van_exel', 'DEN', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 2849, 23500000),
  ('hist_1990s_DEN_orlando_woolridge', 'DEN', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 2652, 61900000),
  ('hist_1990s_DEN_raef_lafrentz', 'DEN', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 2498, 5250000),
  ('hist_1990s_DEN_reggie_williams', 'DEN', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5032, 7530000),
  ('hist_1990s_DEN_robert_pack', 'DEN', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 4525, 7070000),
  ('hist_1990s_DEN_rodney_rogers', 'DEN', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 1023, 3920000),
  ('hist_1990s_DEN_tom_hammonds', 'DEN', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2421, 795000),
  ('hist_1990s_DET_allan_houston', 'DET', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 4796, 7320000),
  ('hist_1990s_DET_brian_williams', 'DET', '1990s', ARRAY['C', 'PF']::text[], 'pro', 3838, 1110000),
  ('hist_1990s_DET_christian_laettner', 'DET', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1041, 18100000),
  ('hist_1990s_DET_dennis_rodman', 'DET', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4123, 6710000),
  ('hist_1990s_DET_don_reid', 'DET', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1817, 659000),
  ('hist_1990s_DET_grant_hill', 'DET', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4782, 71500000),
  ('hist_1990s_DET_isiah_thomas', 'DET', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 7540, 37600000),
  ('hist_1990s_DET_jerry_stackhouse', 'DET', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 3734, 26200000),
  ('hist_1990s_DET_joe_dumars', 'DET', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 457, 16400000),
  ('hist_1990s_DET_john_salley', 'DET', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2021, 705000),
  ('hist_1990s_DET_lindsey_hunter', 'DET', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 3677, 1080000),
  ('hist_1990s_DET_mark_aguirre', 'DET', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2244, 5020000),
  ('hist_1990s_DET_otis_thorpe', 'DET', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2443, 5200000),
  ('hist_1990s_DET_terry_mills', 'DET', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3379, 1010000),
  ('hist_1990s_DET_theo_ratliff', 'DET', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 1973, 4780000),
  ('hist_1990s_GSW_adonal_foyle', 'GSW', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1601, 610000),
  ('hist_1990s_GSW_b_j_armstrong', 'GSW', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 344, 3310000),
  ('hist_1990s_GSW_billy_owens', 'GSW', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2959, 5660000),
  ('hist_1990s_GSW_bimbo_coles', 'GSW', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 4639, 1290000),
  ('hist_1990s_GSW_chris_mullin', 'GSW', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 3804, 67100000),
  ('hist_1990s_GSW_chris_webber', 'GSW', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 7952, 38900000),
  ('hist_1990s_GSW_donyell_marshall', 'GSW', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4769, 7290000),
  ('hist_1990s_GSW_erick_dampier', 'GSW', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1876, 672000),
  ('hist_1990s_GSW_joe_smith', 'GSW', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3783, 6400000),
  ('hist_1990s_GSW_latrell_sprewell', 'GSW', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 4211, 27600000),
  ('hist_1990s_GSW_mitch_richmond', 'GSW', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 5572, 31700000),
  ('hist_1990s_GSW_sarunas_marciulionis', 'GSW', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 408, 16200000),
  ('hist_1990s_GSW_terry_teagle', 'GSW', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 190, 3170000),
  ('hist_1990s_GSW_tim_hardaway', 'GSW', '1990s', ARRAY['PG', 'SG']::text[], 'legend', 2813, 62700000),
  ('hist_1990s_GSW_victor_alexander', 'GSW', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1689, 630000),
  ('hist_1990s_HOU_charles_barkley', 'HOU', '1990s', ARRAY['PF', 'C']::text[], 'legend', 4164, 68700000),
  ('hist_1990s_HOU_clyde_drexler', 'HOU', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 7905, 38700000),
  ('hist_1990s_HOU_eddie_johnson', 'HOU', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 3367, 6030000),
  ('hist_1990s_HOU_hakeem_olajuwon', 'HOU', '1990s', ARRAY['C']::text[], 'goat', 1000, 108000000),
  ('hist_1990s_HOU_kenny_smith', 'HOU', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 5882, 1570000),
  ('hist_1990s_HOU_kevin_willis', 'HOU', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 5330, 7800000),
  ('hist_1990s_HOU_mario_elie', 'HOU', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 3244, 980000),
  ('hist_1990s_HOU_matt_bullard', 'HOU', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3041, 934000),
  ('hist_1990s_HOU_othella_harrington', 'HOU', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2543, 5290000),
  ('hist_1990s_HOU_otis_thorpe', 'HOU', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3665, 6300000),
  ('hist_1990s_HOU_pete_chilcutt', 'HOU', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 846, 440000),
  ('hist_1990s_HOU_robert_horry', 'HOU', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3930, 1130000),
  ('hist_1990s_HOU_sam_cassell', 'HOU', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 4516, 7060000),
  ('hist_1990s_HOU_sedale_threatt', 'HOU', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 3321, 5990000),
  ('hist_1990s_HOU_vernon_maxwell', 'HOU', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 5570, 1500000),
  ('hist_1990s_IND_antonio_davis', 'IND', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3858, 1120000),
  ('hist_1990s_IND_byron_scott', 'IND', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2667, 850000),
  ('hist_1990s_IND_chris_mullin', 'IND', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5396, 1460000),
  ('hist_1990s_IND_dale_davis', 'IND', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4904, 1350000),
  ('hist_1990s_IND_derrick_mckey', 'IND', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4147, 1180000),
  ('hist_1990s_IND_duane_ferrell', 'IND', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2477, 807000),
  ('hist_1990s_IND_haywoode_workman', 'IND', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 850, 441000),
  ('hist_1990s_IND_jalen_rose', 'IND', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 480, 3430000),
  ('hist_1990s_IND_lasalle_thompson', 'IND', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2060, 714000),
  ('hist_1990s_IND_mark_jackson', 'IND', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 5331, 1450000),
  ('hist_1990s_IND_reggie_miller', 'IND', '1990s', ARRAY['SG', 'SF']::text[], 'superstar', 8882, 41600000),
  ('hist_1990s_IND_rik_smits', 'IND', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 1801, 4620000),
  ('hist_1990s_IND_sam_perkins', 'IND', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4642, 1290000),
  ('hist_1990s_IND_travis_best', 'IND', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 2241, 754000),
  ('hist_1990s_IND_vern_fleming', 'IND', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 3818, 1110000),
  ('hist_1990s_LAC_brent_barry', 'LAC', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 4383, 1240000),
  ('hist_1990s_LAC_brian_williams', 'LAC', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 579, 3520000),
  ('hist_1990s_LAC_charles_smith', 'LAC', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5575, 8020000),
  ('hist_1990s_LAC_danny_manning', 'LAC', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4123, 27400000),
  ('hist_1990s_LAC_dominique_wilkins', 'LAC', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 7943, 85700000),
  ('hist_1990s_LAC_eric_piatkowski', 'LAC', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 3635, 1070000),
  ('hist_1990s_LAC_keith_closs', 'LAC', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1397, 564000),
  ('hist_1990s_LAC_ken_norman', 'LAC', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5193, 1420000),
  ('hist_1990s_LAC_lamond_murray', 'LAC', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3050, 5750000),
  ('hist_1990s_LAC_lorenzen_wright', 'LAC', '1990s', ARRAY['C', 'PF']::text[], 'pro', 3504, 1040000),
  ('hist_1990s_LAC_loy_vaught', 'LAC', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1692, 20100000),
  ('hist_1990s_LAC_malik_sealy', 'LAC', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 4327, 1220000),
  ('hist_1990s_LAC_mark_jackson', 'LAC', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 5501, 1490000),
  ('hist_1990s_LAC_pooh_richardson', 'LAC', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 5803, 1560000),
  ('hist_1990s_LAC_rodney_rogers', 'LAC', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2914, 5620000),
  ('hist_1990s_LAC_ron_harper', 'LAC', '1990s', ARRAY['SG', 'PG']::text[], 'legend', 1741, 57800000),
  ('hist_1990s_LAL_a_c_green', 'LAL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3176, 965000),
  ('hist_1990s_LAL_byron_scott', 'LAL', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2670, 851000),
  ('hist_1990s_LAL_cedric_ceballos', 'LAL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1721, 20200000),
  ('hist_1990s_LAL_derek_fisher', 'LAL', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 1785, 652000),
  ('hist_1990s_LAL_eddie_jones', 'LAL', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 5204, 7680000),
  ('hist_1990s_LAL_elden_campbell', 'LAL', '1990s', ARRAY['C', 'PF']::text[], 'pro', 5928, 1580000),
  ('hist_1990s_LAL_glen_rice', 'LAL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3404, 25200000),
  ('hist_1990s_LAL_kobe_bryant', 'LAL', '1990s', ARRAY['SG', 'SF']::text[], 'superstar', 9880, 44600000),
  ('hist_1990s_LAL_nick_van_exel', 'LAL', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 1546, 19600000),
  ('hist_1990s_LAL_rick_fox', 'LAL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5249, 1430000),
  ('hist_1990s_LAL_robert_horry', 'LAL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3828, 1110000),
  ('hist_1990s_LAL_samaki_walker', 'LAL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1201, 520000),
  ('hist_1990s_LAL_sean_rooks', 'LAL', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1542, 597000),
  ('hist_1990s_LAL_shaquille_o_neal', 'LAL', '1990s', ARRAY['C', 'PF']::text[], 'goat', 5000, 140000000),
  ('hist_1990s_LAL_travis_knight', 'LAL', '1990s', ARRAY['C', 'PF']::text[], 'pro', 715, 411000),
  ('hist_1990s_MEM_anthony_peeler', 'MEM', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 950, 3860000),
  ('hist_1990s_MEM_antonio_daniels', 'MEM', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 2903, 903000),
  ('hist_1990s_MEM_blue_edwards', 'MEM', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 4747, 1320000),
  ('hist_1990s_MEM_bryant_reeves', 'MEM', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 3493, 6140000),
  ('hist_1990s_MEM_cherokee_parks', 'MEM', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1204, 521000),
  ('hist_1990s_MEM_chris_robinson', 'MEM', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2208, 747000),
  ('hist_1990s_MEM_doug_west', 'MEM', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 3576, 1050000),
  ('hist_1990s_MEM_felipe_lopez', 'MEM', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 1509, 590000),
  ('hist_1990s_MEM_grant_long', 'MEM', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4530, 1270000),
  ('hist_1990s_MEM_lee_mayberry', 'MEM', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 2122, 727000),
  ('hist_1990s_MEM_mike_bibby', 'MEM', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 2760, 5480000),
  ('hist_1990s_MEM_otis_thorpe', 'MEM', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5111, 1400000),
  ('hist_1990s_MEM_shareef_abdur_rahim', 'MEM', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4687, 29100000),
  ('hist_1990s_MEM_tony_delk', 'MEM', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2811, 882000),
  ('hist_1990s_MEM_tony_massenburg', 'MEM', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2772, 874000),
  ('hist_1990s_MIA_alonzo_mourning', 'MIA', '1990s', ARRAY['C', 'PF']::text[], 'superstar', 8376, 40100000),
  ('hist_1990s_MIA_anthony_carter', 'MIA', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 1821, 660000),
  ('hist_1990s_MIA_bimbo_coles', 'MIA', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 4675, 1300000),
  ('hist_1990s_MIA_bruce_bowen', 'MIA', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 810, 432000),
  ('hist_1990s_MIA_dan_majerle', 'MIA', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 5252, 1430000),
  ('hist_1990s_MIA_isaac_austin', 'MIA', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 4036, 6630000),
  ('hist_1990s_MIA_jamal_mashburn', 'MIA', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5592, 31800000),
  ('hist_1990s_MIA_keith_askins', 'MIA', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 636, 393000),
  ('hist_1990s_MIA_p_j_brown', 'MIA', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4727, 1310000),
  ('hist_1990s_MIA_rex_chapman', 'MIA', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 751, 3680000),
  ('hist_1990s_MIA_terry_porter', 'MIA', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 805, 3720000),
  ('hist_1990s_MIA_tim_hardaway', 'MIA', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 3851, 26600000),
  ('hist_1990s_MIA_voshon_lenard', 'MIA', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 5127, 1400000),
  ('hist_1990s_MIA_willie_burton', 'MIA', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2844, 890000),
  ('hist_1990s_MIL_andrew_lang', 'MIL', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2775, 874000),
  ('hist_1990s_MIL_armon_gilliam', 'MIL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4045, 6640000),
  ('hist_1990s_MIL_blue_edwards', 'MIL', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 4688, 1300000),
  ('hist_1990s_MIL_darvin_ham', 'MIL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 210, 297000),
  ('hist_1990s_MIL_ervin_johnson', 'MIL', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2795, 879000),
  ('hist_1990s_MIL_glenn_robinson', 'MIL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3948, 26800000),
  ('hist_1990s_MIL_johnny_newman', 'MIL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5173, 1410000),
  ('hist_1990s_MIL_michael_redd', 'MIL', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 3884, 1120000),
  ('hist_1990s_MIL_ray_allen', 'MIL', '1990s', ARRAY['SG', 'SF']::text[], 'superstar', 6782, 35300000),
  ('hist_1990s_MIL_sam_cassell', 'MIL', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 3277, 24800000),
  ('hist_1990s_MIL_scott_williams', 'MIL', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1424, 570000),
  ('hist_1990s_MIL_sherman_douglas', 'MIL', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 5728, 1540000),
  ('hist_1990s_MIL_tim_thomas', 'MIL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4576, 1280000),
  ('hist_1990s_MIL_tyrone_hill', 'MIL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5059, 1390000),
  ('hist_1990s_MIL_vin_baker', 'MIL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4162, 27500000),
  ('hist_1990s_MIN_anthony_peeler', 'MIN', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 4990, 1370000),
  ('hist_1990s_MIN_cherokee_parks', 'MIN', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1207, 522000),
  ('hist_1990s_MIN_christian_laettner', 'MIN', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1313, 18900000),
  ('hist_1990s_MIN_dean_garrett', 'MIN', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2352, 779000),
  ('hist_1990s_MIN_doug_west', 'MIN', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 3638, 1070000),
  ('hist_1990s_MIN_felton_spencer', 'MIN', '1990s', ARRAY['C', 'PF']::text[], 'pro', 4816, 1330000),
  ('hist_1990s_MIN_isaiah_rider', 'MIN', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 4226, 6800000),
  ('hist_1990s_MIN_joe_smith', 'MIN', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4054, 6650000),
  ('hist_1990s_MIN_kevin_garnett', 'MIN', '1990s', ARRAY['PF', 'C']::text[], 'legend', 4057, 68300000),
  ('hist_1990s_MIN_rasho_nesterovic', 'MIN', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2526, 818000),
  ('hist_1990s_MIN_sam_mitchell', 'MIN', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4580, 1280000),
  ('hist_1990s_MIN_stephon_marbury', 'MIN', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 4613, 28800000),
  ('hist_1990s_MIN_terrell_brandon', 'MIN', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 1352, 19100000),
  ('hist_1990s_MIN_terry_porter', 'MIN', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 814, 3730000),
  ('hist_1990s_MIN_tom_gugliotta', 'MIN', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5708, 32100000),
  ('hist_1990s_MIN_tony_campbell', 'MIN', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3423, 25300000),
  ('hist_1990s_NYK_allan_houston', 'NYK', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 778, 17300000),
  ('hist_1990s_NYK_anthony_mason', 'NYK', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4896, 7410000),
  ('hist_1990s_NYK_charles_oakley', 'NYK', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5613, 1510000),
  ('hist_1990s_NYK_charlie_ward', 'NYK', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 2244, 755000),
  ('hist_1990s_NYK_chris_childs', 'NYK', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 3248, 981000),
  ('hist_1990s_NYK_derek_harper', 'NYK', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 5885, 1570000),
  ('hist_1990s_NYK_doc_rivers', 'NYK', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 4232, 1200000),
  ('hist_1990s_NYK_greg_anthony', 'NYK', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 1981, 696000),
  ('hist_1990s_NYK_herb_williams', 'NYK', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1693, 631000),
  ('hist_1990s_NYK_hubert_davis', 'NYK', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2674, 852000),
  ('hist_1990s_NYK_john_starks', 'NYK', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 3032, 5730000),
  ('hist_1990s_NYK_larry_johnson', 'NYK', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 263, 15800000),
  ('hist_1990s_NYK_latrell_sprewell', 'NYK', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 4220, 27700000),
  ('hist_1990s_NYK_marcus_camby', 'NYK', '1990s', ARRAY['C', 'PF']::text[], 'pro', 4494, 1260000),
  ('hist_1990s_NYK_patrick_ewing', 'NYK', '1990s', ARRAY['C']::text[], 'legend', 5397, 74300000),
  ('hist_1990s_OKC_dale_ellis', 'OKC', '1990s', ARRAY['SG', 'PG']::text[], 'legend', 1071, 54800000),
  ('hist_1990s_OKC_david_wingate', 'OKC', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2211, 747000),
  ('hist_1990s_OKC_detlef_schrempf', 'OKC', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 652, 17000000),
  ('hist_1990s_OKC_ervin_johnson', 'OKC', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2798, 880000),
  ('hist_1990s_OKC_gary_payton', 'OKC', '1990s', ARRAY['PG', 'SG']::text[], 'legend', 3335, 65000000),
  ('hist_1990s_OKC_hersey_hawkins', 'OKC', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 760, 3680000),
  ('hist_1990s_OKC_kendall_gill', 'OKC', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 4670, 7200000),
  ('hist_1990s_OKC_michael_cage', 'OKC', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2103, 723000),
  ('hist_1990s_OKC_nate_mcmillan', 'OKC', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 4156, 1190000),
  ('hist_1990s_OKC_sam_perkins', 'OKC', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3792, 6410000),
  ('hist_1990s_OKC_shawn_kemp', 'OKC', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5688, 32100000),
  ('hist_1990s_OKC_vin_baker', 'OKC', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4016, 27000000),
  ('hist_1990s_OKC_vincent_askew', 'OKC', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1824, 660000),
  ('hist_1990s_OKC_xavier_mcdaniel', 'OKC', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4648, 28900000),
  ('hist_1990s_ORL_anfernee_hardaway', 'ORL', '1990s', ARRAY['PG', 'SG', 'SF']::text[], 'superstar', 7869, 38600000),
  ('hist_1990s_ORL_bo_outlaw', 'ORL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2355, 780000),
  ('hist_1990s_ORL_brian_shaw', 'ORL', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 2729, 864000),
  ('hist_1990s_ORL_danny_schayes', 'ORL', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1210, 522000),
  ('hist_1990s_ORL_darrell_armstrong', 'ORL', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 2769, 5490000),
  ('hist_1990s_ORL_dennis_scott', 'ORL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2362, 5130000),
  ('hist_1990s_ORL_derek_strong', 'ORL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1827, 661000),
  ('hist_1990s_ORL_gerald_wilkins', 'ORL', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 4993, 1370000),
  ('hist_1990s_ORL_horace_grant', 'ORL', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4262, 6840000),
  ('hist_1990s_ORL_matt_harpring', 'ORL', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4235, 1200000),
  ('hist_1990s_ORL_nick_anderson', 'ORL', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 4109, 6700000),
  ('hist_1990s_ORL_rony_seikaly', 'ORL', '1990s', ARRAY['C', 'PF']::text[], 'superstar', 554, 16700000),
  ('hist_1990s_ORL_shaquille_o_neal', 'ORL', '1990s', ARRAY['C', 'PF']::text[], 'goat', 5000, 140000000),
  ('hist_1990s_ORL_tariq_abdul_wahad', 'ORL', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 3369, 1010000),
  ('hist_1990s_ORL_tree_rollins', 'ORL', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1214, 523000),
  ('hist_1990s_PHI_aaron_mckie', 'PHI', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 4386, 1240000),
  ('hist_1990s_PHI_allen_iverson', 'PHI', '1990s', ARRAY['PG', 'SG']::text[], 'legend', 8020, 86100000),
  ('hist_1990s_PHI_charles_barkley', 'PHI', '1990s', ARRAY['PF', 'C']::text[], 'legend', 8637, 88900000),
  ('hist_1990s_PHI_clarence_weatherspoon', 'PHI', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2851, 5570000),
  ('hist_1990s_PHI_derrick_coleman', 'PHI', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 904, 17700000),
  ('hist_1990s_PHI_doug_overton', 'PHI', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 1985, 697000),
  ('hist_1990s_PHI_eric_snow', 'PHI', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 3139, 956000),
  ('hist_1990s_PHI_george_lynch', 'PHI', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3697, 1080000),
  ('hist_1990s_PHI_jerry_stackhouse', 'PHI', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 3549, 25600000),
  ('hist_1990s_PHI_johnny_dawkins', 'PHI', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 1421, 4280000),
  ('hist_1990s_PHI_matt_geiger', 'PHI', '1990s', ARRAY['C', 'PF']::text[], 'pro', 4429, 1250000),
  ('hist_1990s_PHI_theo_ratliff', 'PHI', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 1982, 4780000),
  ('hist_1990s_PHI_tim_thomas', 'PHI', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4583, 1280000),
  ('hist_1990s_PHI_tony_massenburg', 'PHI', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2779, 875000),
  ('hist_1990s_PHI_vernon_maxwell', 'PHI', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 5574, 1500000),
  ('hist_1990s_PHI_willie_green', 'PHI', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 1460, 579000),
  ('hist_1990s_PHX_a_c_green', 'PHX', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4826, 1340000),
  ('hist_1990s_PHX_cedric_ceballos', 'PHX', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2139, 21400000),
  ('hist_1990s_PHX_charles_barkley', 'PHX', '1990s', ARRAY['PF', 'C']::text[], 'legend', 7378, 83200000),
  ('hist_1990s_PHX_cliff_robinson', 'PHX', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5258, 7730000),
  ('hist_1990s_PHX_dan_majerle', 'PHX', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 5249, 7720000),
  ('hist_1990s_PHX_danny_ainge', 'PHX', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 4566, 1280000),
  ('hist_1990s_PHX_danny_manning', 'PHX', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2470, 22400000),
  ('hist_1990s_PHX_jason_kidd', 'PHX', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 5066, 30200000),
  ('hist_1990s_PHX_kevin_johnson', 'PHX', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 4921, 29800000),
  ('hist_1990s_PHX_luc_longley', 'PHX', '1990s', ARRAY['C', 'PF']::text[], 'pro', 4238, 1200000),
  ('hist_1990s_PHX_michael_finley', 'PHX', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 5329, 31000000),
  ('hist_1990s_PHX_oliver_miller', 'PHX', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 1321, 4190000),
  ('hist_1990s_PHX_rex_chapman', 'PHX', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 769, 3690000),
  ('hist_1990s_PHX_tom_chambers', 'PHX', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3452, 25400000),
  ('hist_1990s_PHX_wesley_person', 'PHX', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 3579, 1060000),
  ('hist_1990s_POR_arvydas_sabonis', 'POR', '1990s', ARRAY['C', 'PF']::text[], 'pro', 5498, 1490000),
  ('hist_1990s_POR_brian_grant', 'POR', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5505, 1490000),
  ('hist_1990s_POR_buck_williams', 'POR', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 1538, 4380000),
  ('hist_1990s_POR_cliff_robinson', 'POR', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5086, 7580000),
  ('hist_1990s_POR_clyde_drexler', 'POR', '1990s', ARRAY['SG', 'PG']::text[], 'legend', 3764, 66900000),
  ('hist_1990s_POR_harvey_grant', 'POR', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5242, 1430000),
  ('hist_1990s_POR_isaiah_rider', 'POR', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 4471, 7020000),
  ('hist_1990s_POR_jerome_kersey', 'POR', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2697, 5430000),
  ('hist_1990s_POR_jim_paxson', 'POR', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 1760, 20300000),
  ('hist_1990s_POR_kenny_anderson', 'POR', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 1249, 4120000),
  ('hist_1990s_POR_kevin_duckworth', 'POR', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 3747, 6370000),
  ('hist_1990s_POR_rasheed_wallace', 'POR', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5412, 7870000),
  ('hist_1990s_POR_rod_strickland', 'POR', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 4697, 29100000),
  ('hist_1990s_POR_stacey_augmon', 'POR', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1638, 4470000),
  ('hist_1990s_POR_terry_porter', 'POR', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 2480, 22400000),
  ('hist_1990s_SAC_billy_owens', 'SAC', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3240, 5920000),
  ('hist_1990s_SAC_bobby_hurley', 'SAC', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 3700, 1080000),
  ('hist_1990s_SAC_brian_grant', 'SAC', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5508, 1490000),
  ('hist_1990s_SAC_chris_webber', 'SAC', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 8448, 40300000),
  ('hist_1990s_SAC_corliss_williamson', 'SAC', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 380, 3340000),
  ('hist_1990s_SAC_jason_williams', 'SAC', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 1819, 4640000),
  ('hist_1990s_SAC_lionel_simmons', 'SAC', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2932, 5640000),
  ('hist_1990s_SAC_mahmoud_abdul_rauf', 'SAC', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 0, 15000000),
  ('hist_1990s_SAC_michael_smith', 'SAC', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3841, 1110000),
  ('hist_1990s_SAC_mitch_richmond', 'SAC', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 5173, 30500000),
  ('hist_1990s_SAC_olden_polynice', 'SAC', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2395, 789000),
  ('hist_1990s_SAC_tony_delk', 'SAC', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2815, 883000),
  ('hist_1990s_SAC_tyus_edney', 'SAC', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 4028, 1160000),
  ('hist_1990s_SAC_vlade_divac', 'SAC', '1990s', ARRAY['C', 'PF']::text[], 'pro', 5980, 1600000),
  ('hist_1990s_SAC_walt_williams', 'SAC', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4366, 1230000),
  ('hist_1990s_SAS_antonio_daniels', 'SAS', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 2907, 904000),
  ('hist_1990s_SAS_avery_johnson', 'SAS', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 4793, 1330000),
  ('hist_1990s_SAS_chuck_person', 'SAS', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2290, 5060000),
  ('hist_1990s_SAS_david_robinson', 'SAS', '1990s', ARRAY['C']::text[], 'legend', 8559, 88500000),
  ('hist_1990s_SAS_dennis_rodman', 'SAS', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4132, 6720000),
  ('hist_1990s_SAS_jaren_jackson', 'SAS', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 3789, 1100000),
  ('hist_1990s_SAS_jerome_kersey', 'SAS', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2552, 5300000),
  ('hist_1990s_SAS_malik_rose', 'SAS', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1545, 598000),
  ('hist_1990s_SAS_mario_elie', 'SAS', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 3251, 981000),
  ('hist_1990s_SAS_sean_elliott', 'SAS', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1195, 4080000),
  ('hist_1990s_SAS_steve_kerr', 'SAS', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 1479, 583000),
  ('hist_1990s_SAS_terry_cummings', 'SAS', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5683, 8110000),
  ('hist_1990s_SAS_tim_duncan', 'SAS', '1990s', ARRAY['PF', 'C']::text[], 'legend', 7056, 81800000),
  ('hist_1990s_SAS_vinny_del_negro', 'SAS', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 3894, 1130000),
  ('hist_1990s_SAS_will_perdue', 'SAS', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1217, 524000),
  ('hist_1990s_TOR_alvin_williams', 'TOR', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 3448, 1030000),
  ('hist_1990s_TOR_antonio_davis', 'TOR', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3861, 1120000),
  ('hist_1990s_TOR_charles_oakley', 'TOR', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5616, 1510000),
  ('hist_1990s_TOR_damon_stoudamire', 'TOR', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 5086, 30300000),
  ('hist_1990s_TOR_dee_brown', 'TOR', '1990s', ARRAY['PG', 'SG']::text[], 'all_star', 3448, 6100000),
  ('hist_1990s_TOR_dell_curry', 'TOR', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 5564, 1500000),
  ('hist_1990s_TOR_doug_christie', 'TOR', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 5373, 1460000),
  ('hist_1990s_TOR_john_wallace', 'TOR', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3044, 935000),
  ('hist_1990s_TOR_kevin_willis', 'TOR', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 4941, 7450000),
  ('hist_1990s_TOR_marcus_camby', 'TOR', '1990s', ARRAY['C', 'PF']::text[], 'pro', 5600, 1510000),
  ('hist_1990s_TOR_oliver_miller', 'TOR', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 1330, 4200000),
  ('hist_1990s_TOR_tracy_mcgrady', 'TOR', '1990s', ARRAY['SG', 'SF']::text[], 'all_star', 7906, 10100000),
  ('hist_1990s_TOR_vince_carter', 'TOR', '1990s', ARRAY['SG', 'SF']::text[], 'legend', 5504, 74800000),
  ('hist_1990s_TOR_willie_anderson', 'TOR', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 5439, 1470000),
  ('hist_1990s_UTA_adam_keefe', 'UTA', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1401, 565000),
  ('hist_1990s_UTA_antoine_carr', 'UTA', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5059, 7550000),
  ('hist_1990s_UTA_blue_edwards', 'UTA', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 4691, 1310000),
  ('hist_1990s_UTA_bryon_russell', 'UTA', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4586, 1280000),
  ('hist_1990s_UTA_chris_morris', 'UTA', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4097, 1170000),
  ('hist_1990s_UTA_felton_spencer', 'UTA', '1990s', ARRAY['C', 'PF']::text[], 'pro', 4819, 1330000),
  ('hist_1990s_UTA_greg_foster', 'UTA', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2063, 714000),
  ('hist_1990s_UTA_greg_ostertag', 'UTA', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1427, 571000),
  ('hist_1990s_UTA_howard_eisley', 'UTA', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 3048, 936000),
  ('hist_1990s_UTA_jeff_hornacek', 'UTA', '1990s', ARRAY['SG', 'PG']::text[], 'all_star', 1611, 4450000),
  ('hist_1990s_UTA_jeff_malone', 'UTA', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 447, 16300000),
  ('hist_1990s_UTA_john_stockton', 'UTA', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 6155, 33500000),
  ('hist_1990s_UTA_karl_malone', 'UTA', '1990s', ARRAY['PF', 'C']::text[], 'legend', 8451, 88000000),
  ('hist_1990s_UTA_olden_polynice', 'UTA', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2398, 790000),
  ('hist_1990s_UTA_shandon_anderson', 'UTA', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3254, 982000),
  ('hist_1990s_WAS_ben_wallace', 'WAS', '1990s', ARRAY['C', 'PF']::text[], 'pro', 1453, 577000),
  ('hist_1990s_WAS_bernard_king', 'WAS', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 2679, 62100000),
  ('hist_1990s_WAS_calbert_cheaney', 'WAS', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5016, 1380000),
  ('hist_1990s_WAS_chris_webber', 'WAS', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 8457, 40400000),
  ('hist_1990s_WAS_chris_whitney', 'WAS', '1990s', ARRAY['PG', 'SG']::text[], 'pro', 3258, 983000),
  ('hist_1990s_WAS_don_maclean', 'WAS', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3589, 1060000),
  ('hist_1990s_WAS_gheorghe_muresan', 'WAS', '1990s', ARRAY['C', 'PF']::text[], 'all_star', 5140, 7630000),
  ('hist_1990s_WAS_harvey_grant', 'WAS', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5245, 1430000),
  ('hist_1990s_WAS_jeff_malone', 'WAS', '1990s', ARRAY['SG', 'PG']::text[], 'legend', 27, 50100000),
  ('hist_1990s_WAS_juwan_howard', 'WAS', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3063, 24200000),
  ('hist_1990s_WAS_ledell_eackles', 'WAS', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2598, 835000),
  ('hist_1990s_WAS_mitch_richmond', 'WAS', '1990s', ARRAY['SG', 'PG']::text[], 'superstar', 4979, 29900000),
  ('hist_1990s_WAS_rasheed_wallace', 'WAS', '1990s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5158, 7640000),
  ('hist_1990s_WAS_rod_strickland', 'WAS', '1990s', ARRAY['PG', 'SG']::text[], 'superstar', 4707, 29100000),
  ('hist_1990s_WAS_terry_davis', 'WAS', '1990s', ARRAY['C', 'PF']::text[], 'pro', 2067, 715000),
  ('hist_1990s_WAS_tim_legler', 'WAS', '1990s', ARRAY['SG', 'PG']::text[], 'pro', 2677, 852000),
  ('hist_1990s_WAS_tracy_murray', 'WAS', '1990s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3641, 1070000),
  ('hist_2000s_ATL_al_harrington', 'ATL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 214, 15600000),
  ('hist_2000s_ATL_antoine_walker', 'ATL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4590, 28800000),
  ('hist_2000s_ATL_boris_diaw', 'ATL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3143, 957000),
  ('hist_2000s_ATL_glenn_robinson', 'ATL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4502, 28500000),
  ('hist_2000s_ATL_jamal_crawford', 'ATL', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 3385, 6050000),
  ('hist_2000s_ATL_jason_terry', 'ATL', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 3676, 26000000),
  ('hist_2000s_ATL_joe_johnson', 'ATL', '2000s', ARRAY['SG', 'PG']::text[], 'legend', 214, 51000000),
  ('hist_2000s_ATL_josh_childress', 'ATL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4307, 1220000),
  ('hist_2000s_ATL_josh_smith', 'ATL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5747, 8170000),
  ('hist_2000s_ATL_marvin_williams', 'ATL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4114, 1180000),
  ('hist_2000s_ATL_mike_bibby', 'ATL', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 3285, 5960000),
  ('hist_2000s_ATL_shareef_abdur_rahim', 'ATL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4755, 29300000),
  ('hist_2000s_ATL_speedy_claxton', 'ATL', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 2247, 756000),
  ('hist_2000s_ATL_theo_ratliff', 'ATL', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 1493, 4340000),
  ('hist_2000s_ATL_tony_delk', 'ATL', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 2592, 833000),
  ('hist_2000s_ATL_tyronn_lue', 'ATL', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 1788, 652000),
  ('hist_2000s_ATL_zaza_pachulia', 'ATL', '2000s', ARRAY['C', 'PF']::text[], 'pro', 3349, 1000000),
  ('hist_2000s_BKN_bostjan_nachbar', 'BKN', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1939, 686000),
  ('hist_2000s_BKN_brian_scalabrine', 'BKN', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 538, 371000),
  ('hist_2000s_BKN_brook_lopez', 'BKN', '2000s', ARRAY['C', 'PF']::text[], 'superstar', 2869, 23600000),
  ('hist_2000s_BKN_cliff_robinson', 'BKN', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5267, 7740000),
  ('hist_2000s_BKN_devin_harris', 'BKN', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 1974, 20900000),
  ('hist_2000s_BKN_jason_collins', 'BKN', '2000s', ARRAY['C', 'PF']::text[], 'pro', 292, 316000),
  ('hist_2000s_BKN_jason_kidd', 'BKN', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 5076, 30200000),
  ('hist_2000s_BKN_keith_van_horn', 'BKN', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2626, 22900000),
  ('hist_2000s_BKN_kenyon_martin', 'BKN', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4878, 7390000),
  ('hist_2000s_BKN_kerry_kittles', 'BKN', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 3195, 5880000),
  ('hist_2000s_BKN_kris_humphries', 'BKN', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4160, 1190000),
  ('hist_2000s_BKN_lucious_harris', 'BKN', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 3645, 1070000),
  ('hist_2000s_BKN_nenad_krstic', 'BKN', '2000s', ARRAY['C', 'PF']::text[], 'pro', 5833, 1560000),
  ('hist_2000s_BKN_richard_jefferson', 'BKN', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1955, 20900000),
  ('hist_2000s_BKN_stephon_marbury', 'BKN', '2000s', ARRAY['PG', 'SG']::text[], 'legend', 3725, 66800000),
  ('hist_2000s_BKN_vince_carter', 'BKN', '2000s', ARRAY['SG', 'SF']::text[], 'legend', 6307, 78400000),
  ('hist_2000s_BOS_al_jefferson', 'BOS', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 564, 16700000),
  ('hist_2000s_BOS_antoine_walker', 'BOS', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5679, 32000000),
  ('hist_2000s_BOS_delonte_west', 'BOS', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 4304, 1220000),
  ('hist_2000s_BOS_eddie_house', 'BOS', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 1906, 679000),
  ('hist_2000s_BOS_james_posey', 'BOS', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1548, 598000),
  ('hist_2000s_BOS_kendrick_perkins', 'BOS', '2000s', ARRAY['C', 'PF']::text[], 'pro', 1647, 621000),
  ('hist_2000s_BOS_kevin_garnett', 'BOS', '2000s', ARRAY['PF', 'C']::text[], 'superstar', 7462, 37400000),
  ('hist_2000s_BOS_leon_powe', 'BOS', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1552, 599000),
  ('hist_2000s_BOS_paul_pierce', 'BOS', '2000s', ARRAY['SG', 'SF']::text[], 'legend', 7085, 81900000),
  ('hist_2000s_BOS_rajon_rondo', 'BOS', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 1701, 4530000),
  ('hist_2000s_BOS_ray_allen', 'BOS', '2000s', ARRAY['SG', 'SF']::text[], 'superstar', 8240, 39700000),
  ('hist_2000s_BOS_ricky_davis', 'BOS', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 5385, 7850000),
  ('hist_2000s_BOS_tony_allen', 'BOS', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 1942, 687000),
  ('hist_2000s_BOS_wally_szczerbiak', 'BOS', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5869, 1570000),
  ('hist_2000s_BOS_walter_mccarty', 'BOS', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 814, 433000),
  ('hist_2000s_CHA_adam_morrison', 'CHA', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1132, 505000),
  ('hist_2000s_CHA_boris_diaw', 'CHA', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5042, 1380000),
  ('hist_2000s_CHA_brevin_knight', 'CHA', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3146, 958000),
  ('hist_2000s_CHA_d_j_augustin', 'CHA', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 4465, 1250000),
  ('hist_2000s_CHA_emeka_okafor', 'CHA', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 1864, 4680000),
  ('hist_2000s_CHA_gerald_wallace', 'CHA', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5529, 7980000),
  ('hist_2000s_CHA_jamal_mashburn', 'CHA', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4366, 28100000),
  ('hist_2000s_CHA_jason_richardson', 'CHA', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 1371, 19100000),
  ('hist_2000s_CHA_matt_carroll', 'CHA', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 3648, 1070000),
  ('hist_2000s_CHA_nazr_mohammed', 'CHA', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2359, 781000),
  ('hist_2000s_CHA_primoz_brezec', 'CHA', '2000s', ARRAY['C', 'PF']::text[], 'pro', 4242, 1200000),
  ('hist_2000s_CHA_raja_bell', 'CHA', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 2847, 891000),
  ('hist_2000s_CHA_raymond_felton', 'CHA', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 4652, 7190000),
  ('hist_2000s_CHA_sean_may', 'CHA', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1831, 662000),
  ('hist_2000s_CHA_stephen_jackson', 'CHA', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 4473, 28400000),
  ('hist_2000s_CHA_tyson_chandler', 'CHA', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2989, 923000),
  ('hist_2000s_CHI_andres_nocioni', 'CHI', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4032, 1160000),
  ('hist_2000s_CHI_ben_gordon', 'CHI', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 418, 16300000),
  ('hist_2000s_CHI_ben_wallace', 'CHI', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2802, 880000),
  ('hist_2000s_CHI_brad_miller', 'CHI', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 434, 3390000),
  ('hist_2000s_CHI_chris_duhon', 'CHI', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3149, 959000),
  ('hist_2000s_CHI_derrick_rose', 'CHI', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 4423, 28300000),
  ('hist_2000s_CHI_jalen_rose', 'CHI', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5290, 30900000),
  ('hist_2000s_CHI_jannero_pargo', 'CHI', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 1512, 590000),
  ('hist_2000s_CHI_joakim_noah', 'CHI', '2000s', ARRAY['C', 'PF']::text[], 'pro', 5223, 1430000),
  ('hist_2000s_CHI_john_salmons', 'CHI', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 3873, 6490000),
  ('hist_2000s_CHI_kirk_hinrich', 'CHI', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 1430, 4290000),
  ('hist_2000s_CHI_larry_hughes', 'CHI', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 507, 3460000),
  ('hist_2000s_CHI_luol_deng', 'CHI', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 4851, 7370000),
  ('hist_2000s_CHI_ron_artest', 'CHI', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 846, 17500000),
  ('hist_2000s_CHI_tyrus_thomas', 'CHI', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3549, 1050000),
  ('hist_2000s_CHI_tyson_chandler', 'CHI', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2992, 923000),
  ('hist_2000s_CLE_anderson_varejao', 'CLE', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2575, 829000),
  ('hist_2000s_CLE_antawn_jamison', 'CLE', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3997, 27000000),
  ('hist_2000s_CLE_ben_wallace', 'CLE', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2660, 849000),
  ('hist_2000s_CLE_daniel_gibson', 'CLE', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 1909, 680000),
  ('hist_2000s_CLE_delonte_west', 'CLE', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 4589, 1280000),
  ('hist_2000s_CLE_donyell_marshall', 'CLE', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4717, 1310000),
  ('hist_2000s_CLE_drew_gooden', 'CLE', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2452, 5210000),
  ('hist_2000s_CLE_eric_snow', 'CLE', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 1870, 671000),
  ('hist_2000s_CLE_larry_hughes', 'CLE', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 217, 3200000),
  ('hist_2000s_CLE_lebron_james', 'CLE', '2000s', ARRAY['PG', 'SG', 'SF', 'PF', 'C']::text[], 'goat', 9375, 175000000),
  ('hist_2000s_CLE_mo_williams', 'CLE', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 311, 15900000),
  ('hist_2000s_CLE_sasha_pavlovic', 'CLE', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 1135, 505000),
  ('hist_2000s_CLE_shaquille_o_neal', 'CLE', '2000s', ARRAY['C', 'PF']::text[], 'legend', 3800, 67100000),
  ('hist_2000s_CLE_wally_szczerbiak', 'CLE', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5872, 1570000),
  ('hist_2000s_CLE_zydrunas_ilgauskas', 'CLE', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 1683, 4510000),
  ('hist_2000s_DAL_antoine_walker', 'DAL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5203, 30600000),
  ('hist_2000s_DAL_brendan_haywood', 'DAL', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2362, 781000),
  ('hist_2000s_DAL_devin_harris', 'DAL', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 1946, 4750000),
  ('hist_2000s_DAL_dirk_nowitzki', 'DAL', '2000s', ARRAY['PF', 'C']::text[], 'legend', 8770, 89500000),
  ('hist_2000s_DAL_eduardo_najera', 'DAL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1604, 611000),
  ('hist_2000s_DAL_erick_dampier', 'DAL', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2159, 736000),
  ('hist_2000s_DAL_jason_kidd', 'DAL', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 5085, 30300000),
  ('hist_2000s_DAL_jason_terry', 'DAL', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 4308, 6880000),
  ('hist_2000s_DAL_jerry_stackhouse', 'DAL', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 4805, 7320000),
  ('hist_2000s_DAL_josh_howard', 'DAL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 583, 16700000),
  ('hist_2000s_DAL_michael_finley', 'DAL', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 5047, 30100000),
  ('hist_2000s_DAL_nick_van_exel', 'DAL', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 1556, 19700000),
  ('hist_2000s_DAL_shawn_marion', 'DAL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 4751, 7280000),
  ('hist_2000s_DAL_steve_nash', 'DAL', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 7110, 36300000),
  ('hist_2000s_DAL_tyson_chandler', 'DAL', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2995, 924000),
  ('hist_2000s_DEN_allen_iverson', 'DEN', '2000s', ARRAY['PG', 'SG']::text[], 'legend', 7511, 83800000),
  ('hist_2000s_DEN_andre_miller', 'DEN', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 3122, 5810000),
  ('hist_2000s_DEN_anthony_carter', 'DEN', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 1834, 663000),
  ('hist_2000s_DEN_carmelo_anthony', 'DEN', '2000s', ARRAY['SF', 'PF']::text[], 'legend', 5343, 74000000),
  ('hist_2000s_DEN_chauncey_billups', 'DEN', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 3882, 6490000),
  ('hist_2000s_DEN_chris_andersen', 'DEN', '2000s', ARRAY['C', 'PF']::text[], 'pro', 1663, 624000),
  ('hist_2000s_DEN_earl_boykins', 'DEN', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 5423, 1470000),
  ('hist_2000s_DEN_eduardo_najera', 'DEN', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1607, 612000),
  ('hist_2000s_DEN_j_r_smith', 'DEN', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 5268, 1440000),
  ('hist_2000s_DEN_kenyon_martin', 'DEN', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4715, 7240000),
  ('hist_2000s_DEN_linas_kleiza', 'DEN', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3907, 1130000),
  ('hist_2000s_DEN_marcus_camby', 'DEN', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 4081, 6670000),
  ('hist_2000s_DEN_nene', 'DEN', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 1303, 4170000),
  ('hist_2000s_DEN_ty_lawson', 'DEN', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3093, 946000),
  ('hist_2000s_DET_antonio_mcdyess', 'DET', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 154, 3140000),
  ('hist_2000s_DET_ben_gordon', 'DET', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 428, 16300000),
  ('hist_2000s_DET_ben_wallace', 'DET', '2000s', ARRAY['C', 'PF']::text[], 'pro', 4281, 1210000),
  ('hist_2000s_DET_chauncey_billups', 'DET', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 3891, 6500000),
  ('hist_2000s_DET_corliss_williamson', 'DET', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4599, 1280000),
  ('hist_2000s_DET_grant_hill', 'DET', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4032, 68100000),
  ('hist_2000s_DET_jason_maxiell', 'DET', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1696, 632000),
  ('hist_2000s_DET_jerry_stackhouse', 'DET', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 4357, 28100000),
  ('hist_2000s_DET_lindsey_hunter', 'DET', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 817, 434000),
  ('hist_2000s_DET_mehmet_okur', 'DET', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 1041, 3940000),
  ('hist_2000s_DET_rasheed_wallace', 'DET', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2317, 5090000),
  ('hist_2000s_DET_richard_hamilton', 'DET', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 4995, 7500000),
  ('hist_2000s_DET_rodney_stuckey', 'DET', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 1403, 4260000),
  ('hist_2000s_DET_tayshaun_prince', 'DET', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5462, 1480000),
  ('hist_2000s_DET_will_bynum', 'DET', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3018, 929000),
  ('hist_2000s_GSW_adonal_foyle', 'GSW', '2000s', ARRAY['C', 'PF']::text[], 'pro', 295, 316000),
  ('hist_2000s_GSW_al_harrington', 'GSW', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 88, 15300000),
  ('hist_2000s_GSW_andris_biedrins', 'GSW', '2000s', ARRAY['C', 'PF']::text[], 'pro', 3510, 1040000),
  ('hist_2000s_GSW_antawn_jamison', 'GSW', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5358, 31100000),
  ('hist_2000s_GSW_anthony_morrow', 'GSW', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 3385, 1010000),
  ('hist_2000s_GSW_anthony_randolph', 'GSW', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1699, 632000),
  ('hist_2000s_GSW_baron_davis', 'GSW', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 4386, 28200000),
  ('hist_2000s_GSW_corey_maggette', 'GSW', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3430, 6090000),
  ('hist_2000s_GSW_jamal_crawford', 'GSW', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 3593, 6230000),
  ('hist_2000s_GSW_jason_richardson', 'GSW', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 1498, 19500000),
  ('hist_2000s_GSW_kelenna_azubuike', 'GSW', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 3051, 936000),
  ('hist_2000s_GSW_mickael_pietrus', 'GSW', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1945, 688000),
  ('hist_2000s_GSW_monta_ellis', 'GSW', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 2577, 22700000),
  ('hist_2000s_GSW_stephen_curry', 'GSW', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 5657, 32000000),
  ('hist_2000s_GSW_stephen_jackson', 'GSW', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 4905, 7410000),
  ('hist_2000s_GSW_troy_murphy', 'GSW', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5521, 1490000),
  ('hist_2000s_HOU_aaron_brooks', 'HOU', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 4665, 1300000),
  ('hist_2000s_HOU_bonzi_wells', 'HOU', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 5449, 1480000),
  ('hist_2000s_HOU_carl_landry', 'HOU', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4478, 1260000),
  ('hist_2000s_HOU_chuck_hayes', 'HOU', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 134, 280000),
  ('hist_2000s_HOU_cuttino_mobley', 'HOU', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 2887, 5600000),
  ('hist_2000s_HOU_dikembe_mutombo', 'HOU', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 6366, 8730000),
  ('hist_2000s_HOU_kelvin_cato', 'HOU', '2000s', ARRAY['C', 'PF']::text[], 'pro', 1086, 494000),
  ('hist_2000s_HOU_luis_scola', 'HOU', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4733, 7260000),
  ('hist_2000s_HOU_mike_james', 'HOU', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 5357, 1460000),
  ('hist_2000s_HOU_rafer_alston', 'HOU', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 4396, 1240000),
  ('hist_2000s_HOU_ron_artest', 'HOU', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1089, 18300000),
  ('hist_2000s_HOU_shane_battier', 'HOU', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3536, 1050000),
  ('hist_2000s_HOU_steve_francis', 'HOU', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 4998, 30000000),
  ('hist_2000s_HOU_tracy_mcgrady', 'HOU', '2000s', ARRAY['SG', 'SF']::text[], 'legend', 7968, 85900000),
  ('hist_2000s_HOU_yao_ming', 'HOU', '2000s', ARRAY['C', 'PF']::text[], 'superstar', 6926, 35800000),
  ('hist_2000s_IND_al_harrington', 'IND', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 224, 15700000),
  ('hist_2000s_IND_austin_croshere', 'IND', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3303, 993000),
  ('hist_2000s_IND_danny_granger', 'IND', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1186, 18600000),
  ('hist_2000s_IND_david_harrison', 'IND', '2000s', ARRAY['C', 'PF']::text[], 'pro', 853, 442000),
  ('hist_2000s_IND_jamaal_tinsley', 'IND', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 5603, 1510000),
  ('hist_2000s_IND_jeff_foster', 'IND', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2585, 832000),
  ('hist_2000s_IND_jermaine_o_neal', 'IND', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3909, 26700000),
  ('hist_2000s_IND_jonathan_bender', 'IND', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1516, 591000),
  ('hist_2000s_IND_mike_dunleavy_jr', 'IND', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2661, 5390000),
  ('hist_2000s_IND_reggie_miller', 'IND', '2000s', ARRAY['SG', 'SF']::text[], 'superstar', 8872, 41600000),
  ('hist_2000s_IND_ron_artest', 'IND', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1167, 18500000),
  ('hist_2000s_IND_sarunas_jasikevicius', 'IND', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 2250, 756000),
  ('hist_2000s_IND_stephen_jackson', 'IND', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 5557, 8000000),
  ('hist_2000s_IND_t_j_ford', 'IND', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 5911, 1580000),
  ('hist_2000s_IND_troy_murphy', 'IND', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5560, 1500000),
  ('hist_2000s_LAC_al_thornton', 'LAC', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4468, 1260000),
  ('hist_2000s_LAC_andre_miller', 'LAC', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 3231, 5910000),
  ('hist_2000s_LAC_baron_davis', 'LAC', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 4395, 28200000),
  ('hist_2000s_LAC_chris_kaman', 'LAC', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 18, 3020000),
  ('hist_2000s_LAC_corey_maggette', 'LAC', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3439, 6100000),
  ('hist_2000s_LAC_cuttino_mobley', 'LAC', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 3059, 5750000),
  ('hist_2000s_LAC_darius_miles', 'LAC', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3704, 1080000),
  ('hist_2000s_LAC_deandre_jordan', 'LAC', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2145, 733000),
  ('hist_2000s_LAC_elton_brand', 'LAC', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5436, 31300000),
  ('hist_2000s_LAC_eric_gordon', 'LAC', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 3005, 5700000),
  ('hist_2000s_LAC_lamar_odom', 'LAC', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1011, 18000000),
  ('hist_2000s_LAC_marcus_camby', 'LAC', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 3837, 6450000),
  ('hist_2000s_LAC_quentin_richardson', 'LAC', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 5403, 1470000),
  ('hist_2000s_LAC_sam_cassell', 'LAC', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 5656, 8090000),
  ('hist_2000s_LAC_tim_thomas', 'LAC', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4668, 1300000),
  ('hist_2000s_LAC_zach_randolph', 'LAC', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4940, 29800000),
  ('hist_2000s_LAL_andrew_bynum', 'LAL', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 1575, 4420000),
  ('hist_2000s_LAL_brian_shaw', 'LAL', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 2733, 865000),
  ('hist_2000s_LAL_derek_fisher', 'LAL', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3527, 1040000),
  ('hist_2000s_LAL_glen_rice', 'LAL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3413, 25200000),
  ('hist_2000s_LAL_jordan_farmar', 'LAL', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 1489, 585000),
  ('hist_2000s_LAL_kobe_bryant', 'LAL', '2000s', ARRAY['SG', 'SF']::text[], 'goat', 6250, 150000000),
  ('hist_2000s_LAL_lamar_odom', 'LAL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 661, 17000000),
  ('hist_2000s_LAL_metta_world_peace', 'LAL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1099, 18300000),
  ('hist_2000s_LAL_pau_gasol', 'LAL', '2000s', ARRAY['PF', 'C']::text[], 'superstar', 6684, 35100000),
  ('hist_2000s_LAL_rick_fox', 'LAL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5255, 1430000),
  ('hist_2000s_LAL_robert_horry', 'LAL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1611, 612000),
  ('hist_2000s_LAL_ron_harper', 'LAL', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 543, 3490000),
  ('hist_2000s_LAL_shaquille_o_neal', 'LAL', '2000s', ARRAY['C', 'PF']::text[], 'goat', 5000, 140000000),
  ('hist_2000s_LAL_smush_parker', 'LAL', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 4671, 1300000),
  ('hist_2000s_LAL_trevor_ariza', 'LAL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3261, 984000),
  ('hist_2000s_MEM_bonzi_wells', 'MEM', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 5537, 1500000),
  ('hist_2000s_MEM_darrell_arthur', 'MEM', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1555, 600000),
  ('hist_2000s_MEM_hakim_warrick', 'MEM', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3910, 1130000),
  ('hist_2000s_MEM_james_posey', 'MEM', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1558, 601000),
  ('hist_2000s_MEM_jason_williams', 'MEM', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 1647, 4480000),
  ('hist_2000s_MEM_lorenzen_wright', 'MEM', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2365, 782000),
  ('hist_2000s_MEM_marc_gasol', 'MEM', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 4163, 6750000),
  ('hist_2000s_MEM_mike_conley', 'MEM', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 5465, 1480000),
  ('hist_2000s_MEM_mike_miller', 'MEM', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 1005, 3900000),
  ('hist_2000s_MEM_o_j_mayo', 'MEM', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 788, 17400000),
  ('hist_2000s_MEM_pau_gasol', 'MEM', '2000s', ARRAY['PF', 'C']::text[], 'superstar', 6441, 34300000),
  ('hist_2000s_MEM_rudy_gay', 'MEM', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 574, 16700000),
  ('hist_2000s_MEM_shane_battier', 'MEM', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3540, 1050000),
  ('hist_2000s_MEM_shareef_abdur_rahim', 'MEM', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4677, 29000000),
  ('hist_2000s_MEM_stromile_swift', 'MEM', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1361, 556000),
  ('hist_2000s_MEM_tony_allen', 'MEM', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 1949, 689000),
  ('hist_2000s_MIA_alonzo_mourning', 'MIA', '2000s', ARRAY['C', 'PF']::text[], 'legend', 3109, 64000000),
  ('hist_2000s_MIA_antoine_walker', 'MIA', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5689, 32100000),
  ('hist_2000s_MIA_carlos_arroyo', 'MIA', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 2254, 757000),
  ('hist_2000s_MIA_daequan_cook', 'MIA', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 1109, 500000),
  ('hist_2000s_MIA_dwyane_wade', 'MIA', '2000s', ARRAY['SG', 'PG', 'SF']::text[], 'legend', 9320, 91900000),
  ('hist_2000s_MIA_eddie_jones', 'MIA', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 5213, 7690000),
  ('hist_2000s_MIA_gary_payton', 'MIA', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 3629, 25900000),
  ('hist_2000s_MIA_james_posey', 'MIA', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1562, 601000),
  ('hist_2000s_MIA_jason_williams', 'MIA', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 1656, 4490000),
  ('hist_2000s_MIA_jermaine_o_neal', 'MIA', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3919, 26800000),
  ('hist_2000s_MIA_mario_chalmers', 'MIA', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 2618, 839000),
  ('hist_2000s_MIA_michael_beasley', 'MIA', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5587, 1510000),
  ('hist_2000s_MIA_rasual_butler', 'MIA', '2000s', ARRAY['SG', 'SF', 'PF']::text[], 'pro', 2601, 835000),
  ('hist_2000s_MIA_shaquille_o_neal', 'MIA', '2000s', ARRAY['C', 'PF']::text[], 'goat', 5000, 140000000),
  ('hist_2000s_MIA_udonis_haslem', 'MIA', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4078, 1170000),
  ('hist_2000s_MIL_andrew_bogut', 'MIL', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 1882, 4690000),
  ('hist_2000s_MIL_bobby_simmons', 'MIL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5636, 1520000),
  ('hist_2000s_MIL_charlie_bell', 'MIL', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 2851, 891000),
  ('hist_2000s_MIL_charlie_villanueva', 'MIL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5590, 1510000),
  ('hist_2000s_MIL_dan_gadzuric', 'MIL', '2000s', ARRAY['C', 'PF']::text[], 'pro', 718, 412000),
  ('hist_2000s_MIL_desmond_mason', 'MIL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4750, 1320000),
  ('hist_2000s_MIL_ersan_ilyasova', 'MIL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4252, 1210000),
  ('hist_2000s_MIL_glenn_robinson', 'MIL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4658, 29000000),
  ('hist_2000s_MIL_hakim_warrick', 'MIL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3914, 1130000),
  ('hist_2000s_MIL_joe_smith', 'MIL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4652, 1300000),
  ('hist_2000s_MIL_luke_ridnour', 'MIL', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 4035, 1160000),
  ('hist_2000s_MIL_michael_redd', 'MIL', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 2723, 23200000),
  ('hist_2000s_MIL_mo_williams', 'MIL', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 1799, 20400000),
  ('hist_2000s_MIL_ramon_sessions', 'MIL', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 0, 3000000),
  ('hist_2000s_MIL_ray_allen', 'MIL', '2000s', ARRAY['SG', 'SF']::text[], 'superstar', 8270, 39800000),
  ('hist_2000s_MIL_richard_jefferson', 'MIL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5828, 8250000),
  ('hist_2000s_MIN_al_jefferson', 'MIN', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3102, 24300000),
  ('hist_2000s_MIN_corey_brewer', 'MIN', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2214, 748000),
  ('hist_2000s_MIN_craig_smith', 'MIN', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3116, 951000),
  ('hist_2000s_MIN_kevin_garnett', 'MIN', '2000s', ARRAY['PF', 'C']::text[], 'legend', 6575, 79600000),
  ('hist_2000s_MIN_kevin_love', 'MIN', '2000s', ARRAY['PF', 'C']::text[], 'superstar', 914, 17700000),
  ('hist_2000s_MIN_latrell_sprewell', 'MIN', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 4235, 6810000),
  ('hist_2000s_MIN_mark_blount', 'MIN', '2000s', ARRAY['C', 'PF']::text[], 'pro', 1703, 633000),
  ('hist_2000s_MIN_michael_olowokandi', 'MIN', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2529, 819000),
  ('hist_2000s_MIN_randy_foye', 'MIN', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 4753, 1320000),
  ('hist_2000s_MIN_ricky_davis', 'MIN', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 5394, 7850000),
  ('hist_2000s_MIN_sam_cassell', 'MIN', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 3287, 24900000),
  ('hist_2000s_MIN_sebastian_telfair', 'MIN', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 1988, 697000),
  ('hist_2000s_MIN_trenton_hassell', 'MIN', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 1315, 546000),
  ('hist_2000s_MIN_troy_hudson', 'MIN', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 5888, 1570000),
  ('hist_2000s_MIN_wally_szczerbiak', 'MIN', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 963, 17900000),
  ('hist_2000s_NOP_baron_davis', 'NOP', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 4405, 28200000),
  ('hist_2000s_NOP_bobby_jackson', 'NOP', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3021, 930000),
  ('hist_2000s_NOP_chris_paul', 'NOP', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 8780, 41300000),
  ('hist_2000s_NOP_david_west', 'NOP', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2898, 23700000),
  ('hist_2000s_NOP_devin_brown', 'NOP', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 2854, 892000),
  ('hist_2000s_NOP_emeka_okafor', 'NOP', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 1719, 4550000),
  ('hist_2000s_NOP_j_r_smith', 'NOP', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 5344, 1450000),
  ('hist_2000s_NOP_jamal_mashburn', 'NOP', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3034, 24100000),
  ('hist_2000s_NOP_julian_wright', 'NOP', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1565, 602000),
  ('hist_2000s_NOP_morris_peterson', 'NOP', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2857, 893000),
  ('hist_2000s_NOP_p_j_brown', 'NOP', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4730, 1310000),
  ('hist_2000s_NOP_peja_stojakovic', 'NOP', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 4480, 7030000),
  ('hist_2000s_NOP_rasual_butler', 'NOP', '2000s', ARRAY['SG', 'SF', 'PF']::text[], 'pro', 2687, 855000),
  ('hist_2000s_NOP_tyson_chandler', 'NOP', '2000s', ARRAY['C', 'PF']::text[], 'pro', 3769, 1100000),
  ('hist_2000s_NYK_al_harrington', 'NYK', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3754, 26300000),
  ('hist_2000s_NYK_allan_houston', 'NYK', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 292, 15900000),
  ('hist_2000s_NYK_chris_duhon', 'NYK', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3153, 959000),
  ('hist_2000s_NYK_danilo_gallinari', 'NYK', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2063, 4860000),
  ('hist_2000s_NYK_david_lee', 'NYK', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4425, 6980000),
  ('hist_2000s_NYK_eddy_curry', 'NYK', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 2751, 5480000),
  ('hist_2000s_NYK_jamal_crawford', 'NYK', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 3394, 6050000),
  ('hist_2000s_NYK_latrell_sprewell', 'NYK', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 4065, 27200000),
  ('hist_2000s_NYK_marcus_camby', 'NYK', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 4181, 6760000),
  ('hist_2000s_NYK_nate_robinson', 'NYK', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 5239, 1430000),
  ('hist_2000s_NYK_quentin_richardson', 'NYK', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 5541, 1500000),
  ('hist_2000s_NYK_stephon_marbury', 'NYK', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 7044, 36100000),
  ('hist_2000s_NYK_steve_francis', 'NYK', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 5650, 32000000),
  ('hist_2000s_NYK_trevor_ariza', 'NYK', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3264, 984000),
  ('hist_2000s_NYK_wilson_chandler', 'NYK', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1204, 4080000),
  ('hist_2000s_NYK_zach_randolph', 'NYK', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5417, 31300000),
  ('hist_2000s_OKC_chris_wilcox', 'OKC', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5951, 1590000),
  ('hist_2000s_OKC_desmond_mason', 'OKC', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4757, 1320000),
  ('hist_2000s_OKC_earl_watson', 'OKC', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 2503, 813000),
  ('hist_2000s_OKC_gary_payton', 'OKC', '2000s', ARRAY['PG', 'SG']::text[], 'legend', 5719, 75700000),
  ('hist_2000s_OKC_james_harden', 'OKC', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 6398, 1690000),
  ('hist_2000s_OKC_jeff_green', 'OKC', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2679, 5410000),
  ('hist_2000s_OKC_kevin_durant', 'OKC', '2000s', ARRAY['SG', 'SF', 'PF']::text[], 'legend', 7993, 86000000),
  ('hist_2000s_OKC_luke_ridnour', 'OKC', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 4117, 1180000),
  ('hist_2000s_OKC_nenad_krstic', 'OKC', '2000s', ARRAY['C', 'PF']::text[], 'pro', 5836, 1560000),
  ('hist_2000s_OKC_nick_collison', 'OKC', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 902, 453000),
  ('hist_2000s_OKC_rashard_lewis', 'OKC', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 97, 15300000),
  ('hist_2000s_OKC_ray_allen', 'OKC', '2000s', ARRAY['SG', 'SF']::text[], 'legend', 4219, 69000000),
  ('hist_2000s_OKC_russell_westbrook', 'OKC', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 8203, 10400000),
  ('hist_2000s_OKC_serge_ibaka', 'OKC', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1069, 491000),
  ('hist_2000s_OKC_thabo_sefolosha', 'OKC', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 1568, 603000),
  ('hist_2000s_OKC_wally_szczerbiak', 'OKC', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 807, 17400000),
  ('hist_2000s_ORL_courtney_lee', 'ORL', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 1745, 643000),
  ('hist_2000s_ORL_dwight_howard', 'ORL', '2000s', ARRAY['C', 'PF']::text[], 'superstar', 7842, 38500000),
  ('hist_2000s_ORL_grant_hill', 'ORL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4809, 71600000),
  ('hist_2000s_ORL_hedo_turkoglu', 'ORL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3249, 5920000),
  ('hist_2000s_ORL_j_j_redick', 'ORL', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 6000, 1600000),
  ('hist_2000s_ORL_jameer_nelson', 'ORL', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 5764, 1550000),
  ('hist_2000s_ORL_keith_bogans', 'ORL', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 1319, 547000),
  ('hist_2000s_ORL_marcin_gortat', 'ORL', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2070, 716000),
  ('hist_2000s_ORL_mickael_pietrus', 'ORL', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1952, 689000),
  ('hist_2000s_ORL_pat_garrity', 'ORL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1138, 506000),
  ('hist_2000s_ORL_rafer_alston', 'ORL', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 4488, 1260000),
  ('hist_2000s_ORL_rashard_lewis', 'ORL', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 379, 16100000),
  ('hist_2000s_ORL_tony_battie', 'ORL', '2000s', ARRAY['C', 'PF']::text[], 'pro', 1430, 572000),
  ('hist_2000s_ORL_tracy_mcgrady', 'ORL', '2000s', ARRAY['SG', 'SF']::text[], 'legend', 8021, 86100000),
  ('hist_2000s_ORL_vince_carter', 'ORL', '2000s', ARRAY['SG', 'SF']::text[], 'legend', 5905, 76600000),
  ('hist_2000s_PHI_aaron_mckie', 'PHI', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 4484, 1260000),
  ('hist_2000s_PHI_allen_iverson', 'PHI', '2000s', ARRAY['PG', 'SG']::text[], 'legend', 8904, 90100000),
  ('hist_2000s_PHI_andre_iguodala', 'PHI', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5710, 8140000),
  ('hist_2000s_PHI_andre_miller', 'PHI', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 2941, 5650000),
  ('hist_2000s_PHI_chris_webber', 'PHI', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 8467, 40400000),
  ('hist_2000s_PHI_dikembe_mutombo', 'PHI', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 6375, 8740000),
  ('hist_2000s_PHI_elton_brand', 'PHI', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4950, 29900000),
  ('hist_2000s_PHI_jrue_holiday', 'PHI', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 2264, 759000),
  ('hist_2000s_PHI_kyle_korver', 'PHI', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 3569, 1050000),
  ('hist_2000s_PHI_lou_williams', 'PHI', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3897, 1130000),
  ('hist_2000s_PHI_marc_jackson', 'PHI', '2000s', ARRAY['C', 'PF']::text[], 'pro', 3484, 1030000),
  ('hist_2000s_PHI_samuel_dalembert', 'PHI', '2000s', ARRAY['C', 'PF']::text[], 'pro', 3566, 1050000),
  ('hist_2000s_PHI_thaddeus_young', 'PHI', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5826, 1560000),
  ('hist_2000s_PHI_theo_ratliff', 'PHI', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 1991, 4790000),
  ('hist_2000s_PHI_willie_green', 'PHI', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 2690, 855000),
  ('hist_2000s_PHX_amar_e_stoudemire', 'PHX', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4843, 29500000),
  ('hist_2000s_PHX_boris_diaw', 'PHX', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5328, 1450000),
  ('hist_2000s_PHX_channing_frye', 'PHX', '2000s', ARRAY['C', 'PF']::text[], 'pro', 4120, 1180000),
  ('hist_2000s_PHX_goran_dragic', 'PHX', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 1991, 698000),
  ('hist_2000s_PHX_grant_hill', 'PHX', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4059, 68300000),
  ('hist_2000s_PHX_jason_richardson', 'PHX', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 1507, 19500000),
  ('hist_2000s_PHX_joe_johnson', 'PHX', '2000s', ARRAY['SG', 'PG']::text[], 'legend', 241, 51100000),
  ('hist_2000s_PHX_leandro_barbosa', 'PHX', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 5124, 1400000),
  ('hist_2000s_PHX_matt_barnes', 'PHX', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3592, 1060000),
  ('hist_2000s_PHX_quentin_richardson', 'PHX', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 5469, 1480000),
  ('hist_2000s_PHX_raja_bell', 'PHX', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 2861, 894000),
  ('hist_2000s_PHX_robin_lopez', 'PHX', '2000s', ARRAY['C', 'PF']::text[], 'pro', 3307, 994000),
  ('hist_2000s_PHX_shaquille_o_neal', 'PHX', '2000s', ARRAY['C', 'PF']::text[], 'legend', 9211, 91400000),
  ('hist_2000s_PHX_shawn_marion', 'PHX', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3365, 25100000),
  ('hist_2000s_PHX_stephon_marbury', 'PHX', '2000s', ARRAY['PG', 'SG']::text[], 'legend', 2948, 63300000),
  ('hist_2000s_PHX_steve_nash', 'PHX', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 7489, 37500000),
  ('hist_2000s_POR_andre_miller', 'POR', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 3131, 5820000),
  ('hist_2000s_POR_bonzi_wells', 'POR', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 5452, 1480000),
  ('hist_2000s_POR_brandon_roy', 'POR', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 4075, 27200000),
  ('hist_2000s_POR_damon_stoudamire', 'POR', '2000s', ARRAY['PG', 'SG']::text[], 'all_star', 2326, 5090000),
  ('hist_2000s_POR_greg_oden', 'POR', '2000s', ARRAY['C', 'PF']::text[], 'pro', 4432, 1250000),
  ('hist_2000s_POR_joel_przybilla', 'POR', '2000s', ARRAY['C', 'PF']::text[], 'pro', 1102, 498000),
  ('hist_2000s_POR_juwan_howard', 'POR', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3199, 24600000),
  ('hist_2000s_POR_lamarcus_aldridge', 'POR', '2000s', ARRAY['PF', 'C']::text[], 'superstar', 1585, 19800000),
  ('hist_2000s_POR_marcus_camby', 'POR', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 4190, 6770000),
  ('hist_2000s_POR_martell_webster', 'POR', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2864, 894000),
  ('hist_2000s_POR_nicolas_batum', 'POR', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3458, 1030000),
  ('hist_2000s_POR_rasheed_wallace', 'POR', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5421, 7880000),
  ('hist_2000s_POR_steve_blake', 'POR', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 2631, 842000),
  ('hist_2000s_POR_travis_outlaw', 'POR', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3054, 937000),
  ('hist_2000s_POR_zach_randolph', 'POR', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4862, 29600000),
  ('hist_2000s_SAC_beno_udrih', 'SAC', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 5580, 1510000),
  ('hist_2000s_SAC_bobby_hurley', 'SAC', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3707, 1080000),
  ('hist_2000s_SAC_bobby_jackson', 'SAC', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3025, 931000),
  ('hist_2000s_SAC_brad_miller', 'SAC', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 2353, 5120000),
  ('hist_2000s_SAC_chris_webber', 'SAC', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 5291, 73800000),
  ('hist_2000s_SAC_corliss_williamson', 'SAC', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4521, 1270000),
  ('hist_2000s_SAC_doug_christie', 'SAC', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 5095, 1400000),
  ('hist_2000s_SAC_francisco_garcia', 'SAC', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2405, 791000),
  ('hist_2000s_SAC_kevin_martin', 'SAC', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 2840, 23500000),
  ('hist_2000s_SAC_mike_bibby', 'SAC', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 1031, 18100000),
  ('hist_2000s_SAC_peja_stojakovic', 'SAC', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 476, 16400000),
  ('hist_2000s_SAC_ron_artest', 'SAC', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1109, 18300000),
  ('hist_2000s_SAC_spencer_hawes', 'SAC', '2000s', ARRAY['C', 'PF']::text[], 'pro', 3743, 1090000),
  ('hist_2000s_SAC_tyreke_evans', 'SAC', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 4911, 29700000),
  ('hist_2000s_SAC_vlade_divac', 'SAC', '2000s', ARRAY['C', 'PF']::text[], 'pro', 5984, 1600000),
  ('hist_2000s_SAS_antonio_mcdyess', 'SAS', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 163, 3150000),
  ('hist_2000s_SAS_brent_barry', 'SAS', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 3418, 1020000),
  ('hist_2000s_SAS_bruce_bowen', 'SAS', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 820, 435000),
  ('hist_2000s_SAS_david_robinson', 'SAS', '2000s', ARRAY['C']::text[], 'superstar', 7961, 38900000),
  ('hist_2000s_SAS_fabricio_oberto', 'SAS', '2000s', ARRAY['C', 'PF']::text[], 'pro', 308, 319000),
  ('hist_2000s_SAS_george_hill', 'SAS', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3057, 938000),
  ('hist_2000s_SAS_manu_ginobili', 'SAS', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 8120, 10300000),
  ('hist_2000s_SAS_michael_finley', 'SAS', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 4823, 29500000),
  ('hist_2000s_SAS_nazr_mohammed', 'SAS', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2369, 783000),
  ('hist_2000s_SAS_richard_jefferson', 'SAS', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5837, 8250000),
  ('hist_2000s_SAS_robert_horry', 'SAS', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1614, 613000),
  ('hist_2000s_SAS_roger_mason_jr', 'SAS', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 2605, 836000),
  ('hist_2000s_SAS_stephen_jackson', 'SAS', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 5077, 7570000),
  ('hist_2000s_SAS_tim_duncan', 'SAS', '2000s', ARRAY['PF', 'C']::text[], 'legend', 9440, 92500000),
  ('hist_2000s_SAS_tony_parker', 'SAS', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 6359, 34100000),
  ('hist_2000s_TOR_amir_johnson', 'TOR', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2782, 876000),
  ('hist_2000s_TOR_andrea_bargnani', 'TOR', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 977, 3880000),
  ('hist_2000s_TOR_anthony_parker', 'TOR', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 4025, 1160000),
  ('hist_2000s_TOR_charlie_villanueva', 'TOR', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5793, 1550000),
  ('hist_2000s_TOR_chris_bosh', 'TOR', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5835, 32500000),
  ('hist_2000s_TOR_jalen_rose', 'TOR', '2000s', ARRAY['SG', 'PG']::text[], 'superstar', 1332, 19000000),
  ('hist_2000s_TOR_jamario_moon', 'TOR', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2024, 705000),
  ('hist_2000s_TOR_jermaine_o_neal', 'TOR', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4172, 27500000),
  ('hist_2000s_TOR_jorge_garbajosa', 'TOR', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2286, 764000),
  ('hist_2000s_TOR_jose_calderon', 'TOR', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 4714, 1310000),
  ('hist_2000s_TOR_mike_james', 'TOR', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 5360, 1460000),
  ('hist_2000s_TOR_morris_peterson', 'TOR', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2867, 895000),
  ('hist_2000s_TOR_rasho_nesterovic', 'TOR', '2000s', ARRAY['C', 'PF']::text[], 'pro', 1220, 525000),
  ('hist_2000s_TOR_t_j_ford', 'TOR', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 5915, 1580000),
  ('hist_2000s_TOR_vince_carter', 'TOR', '2000s', ARRAY['SG', 'SF']::text[], 'legend', 6334, 78500000),
  ('hist_2000s_UTA_andrei_kirilenko', 'UTA', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5679, 1530000),
  ('hist_2000s_UTA_c_j_miles', 'UTA', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 1748, 643000),
  ('hist_2000s_UTA_c_j_watson', 'UTA', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3215, 973000),
  ('hist_2000s_UTA_carlos_boozer', 'UTA', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2499, 22500000),
  ('hist_2000s_UTA_derek_fisher', 'UTA', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 3425, 1020000),
  ('hist_2000s_UTA_deron_williams', 'UTA', '2000s', ARRAY['PG', 'SG']::text[], 'superstar', 2207, 21600000),
  ('hist_2000s_UTA_gordan_giricek', 'UTA', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 3651, 1070000),
  ('hist_2000s_UTA_karl_malone', 'UTA', '2000s', ARRAY['PF', 'C']::text[], 'legend', 4540, 70400000),
  ('hist_2000s_UTA_kyle_korver', 'UTA', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 3572, 1050000),
  ('hist_2000s_UTA_matt_harpring', 'UTA', '2000s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4612, 1290000),
  ('hist_2000s_UTA_mehmet_okur', 'UTA', '2000s', ARRAY['C', 'PF']::text[], 'all_star', 887, 3800000),
  ('hist_2000s_UTA_milt_palacio', 'UTA', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 672, 401000),
  ('hist_2000s_UTA_paul_millsap', 'UTA', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4072, 6660000),
  ('hist_2000s_UTA_raja_bell', 'UTA', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 2870, 896000),
  ('hist_2000s_UTA_ronnie_brewer', 'UTA', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 2874, 897000),
  ('hist_2000s_WAS_andray_blatche', 'WAS', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3956, 1140000),
  ('hist_2000s_WAS_antawn_jamison', 'WAS', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4006, 27000000),
  ('hist_2000s_WAS_antonio_daniels', 'WAS', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 1995, 699000),
  ('hist_2000s_WAS_brendan_haywood', 'WAS', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2654, 847000),
  ('hist_2000s_WAS_caron_butler', 'WAS', '2000s', ARRAY['SG', 'SF', 'PF']::text[], 'superstar', 1342, 19000000),
  ('hist_2000s_WAS_chris_webber', 'WAS', '2000s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 8477, 40400000),
  ('hist_2000s_WAS_deshawn_stevenson', 'WAS', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 1752, 644000),
  ('hist_2000s_WAS_etan_thomas', 'WAS', '2000s', ARRAY['C', 'PF']::text[], 'pro', 1224, 525000),
  ('hist_2000s_WAS_gilbert_arenas', 'WAS', '2000s', ARRAY['PG', 'SG']::text[], 'legend', 5747, 75900000),
  ('hist_2000s_WAS_javale_mcgee', 'WAS', '2000s', ARRAY['C', 'PF']::text[], 'pro', 2647, 846000),
  ('hist_2000s_WAS_juan_dixon', 'WAS', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 1913, 680000),
  ('hist_2000s_WAS_larry_hughes', 'WAS', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 226, 3200000),
  ('hist_2000s_WAS_michael_jordan', 'WAS', '2000s', ARRAY['SG', 'SF']::text[], 'superstar', 9874, 44600000),
  ('hist_2000s_WAS_mike_miller', 'WAS', '2000s', ARRAY['SG', 'PG']::text[], 'all_star', 1014, 3910000),
  ('hist_2000s_WAS_nick_young', 'WAS', '2000s', ARRAY['SG', 'PG']::text[], 'pro', 4537, 1270000),
  ('hist_2000s_WAS_randy_foye', 'WAS', '2000s', ARRAY['PG', 'SG']::text[], 'pro', 4760, 1320000),
  ('hist_2010s_ATL_al_horford', 'ATL', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 4398, 6960000),
  ('hist_2010s_ATL_demarre_carroll', 'ATL', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3061, 939000),
  ('hist_2010s_ATL_dennis_schroder', 'ATL', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 1566, 4410000),
  ('hist_2010s_ATL_jamal_crawford', 'ATL', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 3276, 5950000),
  ('hist_2010s_ATL_jeff_teague', 'ATL', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 2271, 5040000),
  ('hist_2010s_ATL_joe_johnson', 'ATL', '2010s', ARRAY['SG', 'PG']::text[], 'legend', 268, 51200000),
  ('hist_2010s_ATL_john_collins', 'ATL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1449, 19300000),
  ('hist_2010s_ATL_josh_smith', 'ATL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5756, 8180000),
  ('hist_2010s_ATL_kent_bazemore', 'ATL', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4005, 1150000),
  ('hist_2010s_ATL_kyle_korver', 'ATL', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 3625, 1070000),
  ('hist_2010s_ATL_mike_scott', 'ATL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1322, 547000),
  ('hist_2010s_ATL_paul_millsap', 'ATL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5910, 8320000),
  ('hist_2010s_ATL_taurean_prince', 'ATL', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4593, 1280000),
  ('hist_2010s_ATL_tim_hardaway_jr', 'ATL', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 5567, 1500000),
  ('hist_2010s_ATL_trae_young', 'ATL', '2010s', ARRAY['PG', 'SG']::text[], 'legend', 7353, 83100000),
  ('hist_2010s_BKN_andray_blatche', 'BKN', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3382, 1010000),
  ('hist_2010s_BKN_bojan_bogdanovic', 'BKN', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3389, 1010000),
  ('hist_2010s_BKN_brook_lopez', 'BKN', '2010s', ARRAY['C', 'PF']::text[], 'superstar', 2665, 23000000),
  ('hist_2010s_BKN_caris_levert', 'BKN', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 5839, 1560000),
  ('hist_2010s_BKN_d_angelo_russell', 'BKN', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 3044, 24100000),
  ('hist_2010s_BKN_deron_williams', 'BKN', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 739, 17200000),
  ('hist_2010s_BKN_jarrett_allen', 'BKN', '2010s', ARRAY['C', 'PF']::text[], 'pro', 4268, 1210000),
  ('hist_2010s_BKN_jeremy_lin', 'BKN', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5085, 1390000),
  ('hist_2010s_BKN_joe_harris', 'BKN', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2877, 897000),
  ('hist_2010s_BKN_joe_johnson', 'BKN', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 3023, 5720000),
  ('hist_2010s_BKN_kevin_garnett', 'BKN', '2010s', ARRAY['PF', 'C']::text[], 'superstar', 7209, 36600000),
  ('hist_2010s_BKN_mason_plumlee', 'BKN', '2010s', ARRAY['C', 'PF']::text[], 'pro', 3172, 964000),
  ('hist_2010s_BKN_paul_pierce', 'BKN', '2010s', ARRAY['SG', 'SF']::text[], 'superstar', 5381, 31100000),
  ('hist_2010s_BKN_spencer_dinwiddie', 'BKN', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 109, 3100000),
  ('hist_2010s_BKN_thaddeus_young', 'BKN', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5721, 1540000),
  ('hist_2010s_BOS_al_horford', 'BOS', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 4407, 6970000),
  ('hist_2010s_BOS_avery_bradley', 'BOS', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 4183, 1190000),
  ('hist_2010s_BOS_gordon_hayward', 'BOS', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3222, 5900000),
  ('hist_2010s_BOS_isaiah_thomas', 'BOS', '2010s', ARRAY['PG', 'SG']::text[], 'legend', 80, 50400000),
  ('hist_2010s_BOS_jae_crowder', 'BOS', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4311, 1220000),
  ('hist_2010s_BOS_jaylen_brown', 'BOS', '2010s', ARRAY['SG', 'SF']::text[], 'pro', 8154, 2080000),
  ('hist_2010s_BOS_jayson_tatum', 'BOS', '2010s', ARRAY['SF', 'PF']::text[], 'superstar', 4717, 29200000),
  ('hist_2010s_BOS_kelly_olynyk', 'BOS', '2010s', ARRAY['C', 'PF']::text[], 'pro', 3595, 1060000),
  ('hist_2010s_BOS_kevin_garnett', 'BOS', '2010s', ARRAY['PF', 'C']::text[], 'superstar', 7306, 36900000),
  ('hist_2010s_BOS_kyrie_irving', 'BOS', '2010s', ARRAY['PG', 'SG']::text[], 'legend', 8289, 87300000),
  ('hist_2010s_BOS_marcus_morris', 'BOS', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5892, 1580000),
  ('hist_2010s_BOS_marcus_smart', 'BOS', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 4140, 1180000),
  ('hist_2010s_BOS_paul_pierce', 'BOS', '2010s', ARRAY['SG', 'SF']::text[], 'legend', 7112, 82000000),
  ('hist_2010s_BOS_rajon_rondo', 'BOS', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 1710, 4540000),
  ('hist_2010s_BOS_terry_rozier', 'BOS', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 3599, 1060000),
  ('hist_2010s_CHA_al_jefferson', 'CHA', '2010s', ARRAY['C', 'PF']::text[], 'superstar', 3472, 25400000),
  ('hist_2010s_CHA_bismack_biyombo', 'CHA', '2010s', ARRAY['C', 'PF']::text[], 'pro', 1250, 531000),
  ('hist_2010s_CHA_cody_zeller', 'CHA', '2010s', ARRAY['C', 'PF']::text[], 'pro', 2966, 917000),
  ('hist_2010s_CHA_devonte_graham', 'CHA', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 1818, 20500000),
  ('hist_2010s_CHA_dwight_howard', 'CHA', '2010s', ARRAY['C', 'PF']::text[], 'superstar', 6334, 34000000),
  ('hist_2010s_CHA_gerald_henderson', 'CHA', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 4330, 1220000),
  ('hist_2010s_CHA_jeremy_lamb', 'CHA', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 4009, 1150000),
  ('hist_2010s_CHA_kemba_walker', 'CHA', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 3938, 26800000),
  ('hist_2010s_CHA_malik_monk', 'CHA', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2680, 853000),
  ('hist_2010s_CHA_marvin_williams', 'CHA', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4038, 1160000),
  ('hist_2010s_CHA_michael_kidd_gilchrist', 'CHA', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2736, 866000),
  ('hist_2010s_CHA_miles_bridges', 'CHA', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5738, 1540000),
  ('hist_2010s_CHA_nicolas_batum', 'CHA', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 425, 3380000),
  ('hist_2010s_CHA_terry_rozier', 'CHA', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 3710, 1080000),
  ('hist_2010s_CHA_tony_parker', 'CHA', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 7298, 9570000),
  ('hist_2010s_CHI_ben_gordon', 'CHI', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 438, 16300000),
  ('hist_2010s_CHI_bobby_portis', 'CHI', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4399, 1240000),
  ('hist_2010s_CHI_carlos_boozer', 'CHI', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4380, 6940000),
  ('hist_2010s_CHI_derrick_rose', 'CHI', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 6047, 33100000),
  ('hist_2010s_CHI_jimmy_butler', 'CHI', '2010s', ARRAY['SG', 'SF', 'PF']::text[], 'superstar', 5556, 31700000),
  ('hist_2010s_CHI_joakim_noah', 'CHI', '2010s', ARRAY['C', 'PF']::text[], 'pro', 4278, 1210000),
  ('hist_2010s_CHI_kirk_hinrich', 'CHI', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 1439, 4300000),
  ('hist_2010s_CHI_lauri_markkanen', 'CHI', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4253, 6830000),
  ('hist_2010s_CHI_luol_deng', 'CHI', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 4697, 7230000),
  ('hist_2010s_CHI_nikola_mirotic', 'CHI', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4042, 1160000),
  ('hist_2010s_CHI_pau_gasol', 'CHI', '2010s', ARRAY['PF', 'C']::text[], 'superstar', 5488, 31500000),
  ('hist_2010s_CHI_robin_lopez', 'CHI', '2010s', ARRAY['C', 'PF']::text[], 'pro', 3746, 1090000),
  ('hist_2010s_CHI_taj_gibson', 'CHI', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3487, 1030000),
  ('hist_2010s_CHI_thaddeus_young', 'CHI', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5724, 1540000),
  ('hist_2010s_CHI_zach_lavine', 'CHI', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 3540, 25600000),
  ('hist_2010s_CLE_anderson_varejao', 'CLE', '2010s', ARRAY['C', 'PF']::text[], 'pro', 2378, 785000),
  ('hist_2010s_CLE_channing_frye', 'CLE', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4124, 1180000),
  ('hist_2010s_CLE_collin_sexton', 'CLE', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 39, 15100000),
  ('hist_2010s_CLE_iman_shumpert', 'CLE', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 1001, 475000),
  ('hist_2010s_CLE_j_r_smith', 'CLE', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 4455, 1250000),
  ('hist_2010s_CLE_jordan_clarkson', 'CLE', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 778, 3700000),
  ('hist_2010s_CLE_kevin_love', 'CLE', '2010s', ARRAY['PF', 'C']::text[], 'superstar', 3511, 25500000),
  ('hist_2010s_CLE_kyrie_irving', 'CLE', '2010s', ARRAY['PG', 'SG']::text[], 'legend', 9119, 91000000),
  ('hist_2010s_CLE_larry_nance_jr', 'CLE', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2441, 799000),
  ('hist_2010s_CLE_lebron_james', 'CLE', '2010s', ARRAY['PG', 'SG', 'SF', 'PF', 'C']::text[], 'goat', 9375, 175000000),
  ('hist_2010s_CLE_matthew_dellavedova', 'CLE', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 1365, 557000),
  ('hist_2010s_CLE_mo_williams', 'CLE', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5875, 1570000),
  ('hist_2010s_CLE_richard_jefferson', 'CLE', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5846, 8260000),
  ('hist_2010s_CLE_timofey_mozgov', 'CLE', '2010s', ARRAY['C', 'PF']::text[], 'pro', 2296, 767000),
  ('hist_2010s_CLE_tristan_thompson', 'CLE', '2010s', ARRAY['C', 'PF']::text[], 'pro', 3874, 1120000),
  ('hist_2010s_DAL_chandler_parsons', 'DAL', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1448, 4300000),
  ('hist_2010s_DAL_deandre_jordan', 'DAL', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 679, 3610000),
  ('hist_2010s_DAL_dennis_smith_jr', 'DAL', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 860, 3770000),
  ('hist_2010s_DAL_dirk_nowitzki', 'DAL', '2010s', ARRAY['PF', 'C']::text[], 'superstar', 9372, 43100000),
  ('hist_2010s_DAL_harrison_barnes', 'DAL', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 204, 15600000),
  ('hist_2010s_DAL_j_j_barea', 'DAL', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 3523, 1040000),
  ('hist_2010s_DAL_jalen_brunson', 'DAL', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5280, 1440000),
  ('hist_2010s_DAL_jason_kidd', 'DAL', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 8761, 2220000),
  ('hist_2010s_DAL_jason_terry', 'DAL', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 2606, 5350000),
  ('hist_2010s_DAL_jose_calderon', 'DAL', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 4796, 1330000),
  ('hist_2010s_DAL_luka_doncic', 'DAL', '2010s', ARRAY['PG', 'SG', 'SF']::text[], 'legend', 9252, 91600000),
  ('hist_2010s_DAL_monta_ellis', 'DAL', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 2120, 21400000),
  ('hist_2010s_DAL_shawn_marion', 'DAL', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5413, 1470000),
  ('hist_2010s_DAL_tyson_chandler', 'DAL', '2010s', ARRAY['C', 'PF']::text[], 'pro', 4908, 1350000),
  ('hist_2010s_DAL_wesley_matthews', 'DAL', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 4996, 1370000),
  ('hist_2010s_DEN_andre_miller', 'DEN', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 3140, 5830000),
  ('hist_2010s_DEN_arron_afflalo', 'DEN', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 4334, 1230000),
  ('hist_2010s_DEN_carmelo_anthony', 'DEN', '2010s', ARRAY['SF', 'PF']::text[], 'legend', 6280, 78300000),
  ('hist_2010s_DEN_danilo_gallinari', 'DEN', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2624, 5360000),
  ('hist_2010s_DEN_emmanuel_mudiay', 'DEN', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5029, 1380000),
  ('hist_2010s_DEN_gary_harris', 'DEN', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 5078, 1390000),
  ('hist_2010s_DEN_j_r_smith', 'DEN', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 5347, 1450000),
  ('hist_2010s_DEN_jamal_murray', 'DEN', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 5041, 7540000),
  ('hist_2010s_DEN_kenneth_faried', 'DEN', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5052, 1390000),
  ('hist_2010s_DEN_nene', 'DEN', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 1312, 4180000),
  ('hist_2010s_DEN_nikola_jokic', 'DEN', '2010s', ARRAY['C', 'PF']::text[], 'superstar', 6907, 35700000),
  ('hist_2010s_DEN_paul_millsap', 'DEN', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5919, 8330000),
  ('hist_2010s_DEN_ty_lawson', 'DEN', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 3312, 5980000),
  ('hist_2010s_DEN_will_barton', 'DEN', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 5770, 1550000),
  ('hist_2010s_DEN_wilson_chandler', 'DEN', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 552, 3500000),
  ('hist_2010s_DET_andre_drummond', 'DET', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 5973, 8380000),
  ('hist_2010s_DET_ben_wallace', 'DET', '2010s', ARRAY['C', 'PF']::text[], 'pro', 4284, 1210000),
  ('hist_2010s_DET_blake_griffin', 'DET', '2010s', ARRAY['PF', 'C']::text[], 'legend', 3469, 65600000),
  ('hist_2010s_DET_brandon_jennings', 'DET', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 4326, 6890000),
  ('hist_2010s_DET_greg_monroe', 'DET', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 3828, 6450000),
  ('hist_2010s_DET_ish_smith', 'DET', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 4127, 1180000),
  ('hist_2010s_DET_jonas_jerebko', 'DET', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 856, 443000),
  ('hist_2010s_DET_kentavious_caldwell_pope', 'DET', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 4288, 1210000),
  ('hist_2010s_DET_luke_kennard', 'DET', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2880, 898000),
  ('hist_2010s_DET_reggie_bullock', 'DET', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2608, 837000),
  ('hist_2010s_DET_reggie_jackson', 'DET', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 4824, 7340000),
  ('hist_2010s_DET_richard_hamilton', 'DET', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 5195, 7680000),
  ('hist_2010s_DET_rodney_stuckey', 'DET', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 1213, 4090000),
  ('hist_2010s_DET_tayshaun_prince', 'DET', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5472, 1480000),
  ('hist_2010s_DET_tobias_harris', 'DET', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3937, 6540000),
  ('hist_2010s_GSW_andre_iguodala', 'GSW', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5682, 1530000),
  ('hist_2010s_GSW_andrew_bogut', 'GSW', '2010s', ARRAY['C', 'PF']::text[], 'pro', 3868, 1120000),
  ('hist_2010s_GSW_andrew_wiggins', 'GSW', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1789, 20400000),
  ('hist_2010s_GSW_d_angelo_russell', 'GSW', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 3297, 24900000),
  ('hist_2010s_GSW_david_lee', 'GSW', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5946, 8350000),
  ('hist_2010s_GSW_david_west', 'GSW', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 1484, 4340000),
  ('hist_2010s_GSW_draymond_green', 'GSW', '2010s', ARRAY['PF', 'C', 'SF']::text[], 'all_star', 5071, 7560000),
  ('hist_2010s_GSW_harrison_barnes', 'GSW', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 10, 15000000),
  ('hist_2010s_GSW_javale_mcgee', 'GSW', '2010s', ARRAY['C', 'PF']::text[], 'pro', 2257, 758000),
  ('hist_2010s_GSW_kevin_durant', 'GSW', '2010s', ARRAY['SG', 'SF', 'PF']::text[], 'goat', 2500, 120000000),
  ('hist_2010s_GSW_kevon_looney', 'GSW', '2010s', ARRAY['C', 'PF']::text[], 'pro', 905, 454000),
  ('hist_2010s_GSW_klay_thompson', 'GSW', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 4170, 27500000),
  ('hist_2010s_GSW_monta_ellis', 'GSW', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 2558, 22700000),
  ('hist_2010s_GSW_shaun_livingston', 'GSW', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 1178, 515000),
  ('hist_2010s_GSW_stephen_curry', 'GSW', '2010s', ARRAY['PG', 'SG']::text[], 'goat', 3125, 125000000),
  ('hist_2010s_HOU_chandler_parsons', 'HOU', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1457, 4310000),
  ('hist_2010s_HOU_chris_paul', 'HOU', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 8964, 41900000),
  ('hist_2010s_HOU_clint_capela', 'HOU', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 2724, 5450000),
  ('hist_2010s_HOU_danuel_house_jr', 'HOU', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3267, 985000),
  ('hist_2010s_HOU_dwight_howard', 'HOU', '2010s', ARRAY['C', 'PF']::text[], 'superstar', 5907, 32700000),
  ('hist_2010s_HOU_eric_gordon', 'HOU', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 2588, 5330000),
  ('hist_2010s_HOU_james_harden', 'HOU', '2010s', ARRAY['PG', 'SG']::text[], 'legend', 9226, 91500000),
  ('hist_2010s_HOU_kevin_martin', 'HOU', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 3530, 25600000),
  ('hist_2010s_HOU_lou_williams', 'HOU', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 5339, 7810000),
  ('hist_2010s_HOU_nene', 'HOU', '2010s', ARRAY['C', 'PF']::text[], 'pro', 4402, 1240000),
  ('hist_2010s_HOU_p_j_tucker', 'HOU', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1627, 616000),
  ('hist_2010s_HOU_patrick_beverley', 'HOU', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 3310, 995000),
  ('hist_2010s_HOU_russell_westbrook', 'HOU', '2010s', ARRAY['PG', 'SG']::text[], 'legend', 7271, 82700000),
  ('hist_2010s_HOU_ryan_anderson', 'HOU', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5593, 1510000),
  ('hist_2010s_HOU_trevor_ariza', 'HOU', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4101, 1170000),
  ('hist_2010s_HOU_trevor_booker', 'HOU', '2010s', ARRAY['SG', 'SF']::text[], 'pro', 2326, 773000),
  ('hist_2010s_IND_bojan_bogdanovic', 'IND', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 941, 3850000),
  ('hist_2010s_IND_c_j_miles', 'IND', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2457, 803000),
  ('hist_2010s_IND_danny_granger', 'IND', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2305, 21900000),
  ('hist_2010s_IND_darren_collison', 'IND', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5400, 1470000),
  ('hist_2010s_IND_david_west', 'IND', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5176, 7660000),
  ('hist_2010s_IND_domantas_sabonis', 'IND', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4579, 7120000),
  ('hist_2010s_IND_george_hill', 'IND', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5019, 1380000),
  ('hist_2010s_IND_ian_mahinmi', 'IND', '2010s', ARRAY['C', 'PF']::text[], 'pro', 761, 421000),
  ('hist_2010s_IND_lance_stephenson', 'IND', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 4934, 1360000),
  ('hist_2010s_IND_luis_scola', 'IND', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4742, 7270000),
  ('hist_2010s_IND_myles_turner', 'IND', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 1810, 4630000),
  ('hist_2010s_IND_paul_george', 'IND', '2010s', ARRAY['SG', 'SF', 'PF']::text[], 'superstar', 3968, 26900000),
  ('hist_2010s_IND_roy_hibbert', 'IND', '2010s', ARRAY['C', 'PF']::text[], 'pro', 5098, 1400000),
  ('hist_2010s_IND_thaddeus_young', 'IND', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 398, 3360000),
  ('hist_2010s_IND_victor_oladipo', 'IND', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 4736, 29200000),
  ('hist_2010s_LAC_austin_rivers', 'LAC', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2113, 725000),
  ('hist_2010s_LAC_blake_griffin', 'LAC', '2010s', ARRAY['PF', 'C']::text[], 'legend', 3496, 65700000),
  ('hist_2010s_LAC_chris_paul', 'LAC', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 8974, 41900000),
  ('hist_2010s_LAC_danilo_gallinari', 'LAC', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2633, 5370000),
  ('hist_2010s_LAC_deandre_jordan', 'LAC', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 2507, 5260000),
  ('hist_2010s_LAC_eric_gordon', 'LAC', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 2516, 5260000),
  ('hist_2010s_LAC_j_j_redick', 'LAC', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 36, 3030000),
  ('hist_2010s_LAC_jamal_crawford', 'LAC', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 1738, 4560000),
  ('hist_2010s_LAC_landry_shamet', 'LAC', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2611, 837000),
  ('hist_2010s_LAC_lou_williams', 'LAC', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 5348, 7810000),
  ('hist_2010s_LAC_marcus_morris_sr', 'LAC', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5895, 1580000),
  ('hist_2010s_LAC_matt_barnes', 'LAC', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3602, 1060000),
  ('hist_2010s_LAC_montrezl_harrell', 'LAC', '2010s', ARRAY['C', 'PF']::text[], 'pro', 5475, 1480000),
  ('hist_2010s_LAC_patrick_beverley', 'LAC', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 3313, 995000),
  ('hist_2010s_LAC_tobias_harris', 'LAC', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3946, 6550000),
  ('hist_2010s_LAL_andrew_bynum', 'LAL', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 5113, 7600000),
  ('hist_2010s_LAL_anthony_davis', 'LAL', '2010s', ARRAY['PF', 'C']::text[], 'legend', 8986, 90400000),
  ('hist_2010s_LAL_brandon_ingram', 'LAL', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 4534, 7080000),
  ('hist_2010s_LAL_d_angelo_russell', 'LAL', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 3306, 24900000),
  ('hist_2010s_LAL_derek_fisher', 'LAL', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 3428, 1020000),
  ('hist_2010s_LAL_dwight_howard', 'LAL', '2010s', ARRAY['C', 'PF']::text[], 'superstar', 6344, 34000000),
  ('hist_2010s_LAL_jordan_clarkson', 'LAL', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 959, 3860000),
  ('hist_2010s_LAL_julius_randle', 'LAL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1614, 19800000),
  ('hist_2010s_LAL_kobe_bryant', 'LAL', '2010s', ARRAY['SG', 'SF']::text[], 'legend', 9451, 92500000),
  ('hist_2010s_LAL_kyle_kuzma', 'LAL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3900, 6510000),
  ('hist_2010s_LAL_lamar_odom', 'LAL', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 671, 17000000),
  ('hist_2010s_LAL_lebron_james', 'LAL', '2010s', ARRAY['PG', 'SG', 'SF', 'PF', 'C']::text[], 'goat', 9375, 175000000),
  ('hist_2010s_LAL_lonzo_ball', 'LAL', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5524, 1490000),
  ('hist_2010s_LAL_metta_world_peace', 'LAL', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1177, 18500000),
  ('hist_2010s_LAL_pau_gasol', 'LAL', '2010s', ARRAY['PF', 'C']::text[], 'superstar', 5041, 30100000),
  ('hist_2010s_MEM_courtney_lee', 'MEM', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2460, 804000),
  ('hist_2010s_MEM_jamychal_green', 'MEM', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2651, 846000),
  ('hist_2010s_MEM_jaren_jackson_jr', 'MEM', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5862, 1570000),
  ('hist_2010s_MEM_jonas_valanciunas', 'MEM', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 281, 3250000),
  ('hist_2010s_MEM_marc_gasol', 'MEM', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 5122, 7610000),
  ('hist_2010s_MEM_marcus_morris_sr', 'MEM', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5898, 1580000),
  ('hist_2010s_MEM_mike_conley', 'MEM', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 4335, 6900000),
  ('hist_2010s_MEM_mike_miller', 'MEM', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 833, 3750000),
  ('hist_2010s_MEM_o_j_mayo', 'MEM', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 5715, 1540000),
  ('hist_2010s_MEM_rudy_gay', 'MEM', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1206, 18600000),
  ('hist_2010s_MEM_shane_battier', 'MEM', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3467, 1030000),
  ('hist_2010s_MEM_tony_allen', 'MEM', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 1794, 654000),
  ('hist_2010s_MEM_tyreke_evans', 'MEM', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 1420, 19300000),
  ('hist_2010s_MEM_vince_carter', 'MEM', '2010s', ARRAY['SG', 'SF']::text[], 'legend', 6361, 78600000),
  ('hist_2010s_MEM_zach_randolph', 'MEM', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1702, 20100000),
  ('hist_2010s_MIA_bam_adebayo', 'MIA', '2010s', ARRAY['PF', 'C']::text[], 'pro', 5216, 1420000),
  ('hist_2010s_MIA_chris_bosh', 'MIA', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5893, 32700000),
  ('hist_2010s_MIA_dwyane_wade', 'MIA', '2010s', ARRAY['SG', 'PG', 'SF']::text[], 'legend', 8436, 88000000),
  ('hist_2010s_MIA_goran_dragic', 'MIA', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 3928, 6540000),
  ('hist_2010s_MIA_hassan_whiteside', 'MIA', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 5955, 8360000),
  ('hist_2010s_MIA_jimmy_butler', 'MIA', '2010s', ARRAY['SG', 'SF', 'PF']::text[], 'superstar', 5731, 32200000),
  ('hist_2010s_MIA_josh_richardson', 'MIA', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 3064, 939000),
  ('hist_2010s_MIA_justise_winslow', 'MIA', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4150, 1180000),
  ('hist_2010s_MIA_lebron_james', 'MIA', '2010s', ARRAY['PG', 'SG', 'SF', 'PF', 'C']::text[], 'goat', 9375, 175000000),
  ('hist_2010s_MIA_mario_chalmers', 'MIA', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 2706, 859000),
  ('hist_2010s_MIA_mike_miller', 'MIA', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 842, 3760000),
  ('hist_2010s_MIA_ray_allen', 'MIA', '2010s', ARRAY['SG', 'SF']::text[], 'legend', 4674, 71000000),
  ('hist_2010s_MIA_shane_battier', 'MIA', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3471, 1030000),
  ('hist_2010s_MIA_tyler_johnson', 'MIA', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 3067, 940000),
  ('hist_2010s_MIA_udonis_haslem', 'MIA', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2372, 784000),
  ('hist_2010s_MIL_brandon_jennings', 'MIL', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 4633, 7170000),
  ('hist_2010s_MIL_brook_lopez', 'MIL', '2010s', ARRAY['C', 'PF']::text[], 'superstar', 2820, 23500000),
  ('hist_2010s_MIL_eric_bledsoe', 'MIL', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 1002, 18000000),
  ('hist_2010s_MIL_ersan_ilyasova', 'MIL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4255, 1210000),
  ('hist_2010s_MIL_george_hill', 'MIL', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5022, 1380000),
  ('hist_2010s_MIL_giannis_antetokounmpo', 'MIL', '2010s', ARRAY['SF', 'PF', 'C']::text[], 'goat', 1750, 114000000),
  ('hist_2010s_MIL_jabari_parker', 'MIL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2308, 5080000),
  ('hist_2010s_MIL_john_henson', 'MIL', '2010s', ARRAY['C', 'PF']::text[], 'pro', 2762, 871000),
  ('hist_2010s_MIL_khris_middleton', 'MIL', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5493, 7940000),
  ('hist_2010s_MIL_larry_sanders', 'MIL', '2010s', ARRAY['C', 'PF']::text[], 'pro', 2444, 800000),
  ('hist_2010s_MIL_malcolm_brogdon', 'MIL', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 4118, 6710000),
  ('hist_2010s_MIL_matthew_dellavedova', 'MIL', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 1368, 558000),
  ('hist_2010s_MIL_monta_ellis', 'MIL', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 2353, 22100000),
  ('hist_2010s_MIL_thon_maker', 'MIL', '2010s', ARRAY['C', 'PF']::text[], 'pro', 994, 474000),
  ('hist_2010s_MIL_tony_snell', 'MIL', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 1155, 510000),
  ('hist_2010s_MIN_andrew_wiggins', 'MIN', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1935, 20800000),
  ('hist_2010s_MIN_derrick_rose', 'MIN', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 6378, 34100000),
  ('hist_2010s_MIN_gorgui_dieng', 'MIN', '2010s', ARRAY['C', 'PF']::text[], 'pro', 4163, 1190000),
  ('hist_2010s_MIN_jarrett_culver', 'MIN', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2408, 792000),
  ('hist_2010s_MIN_jeff_teague', 'MIN', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 2398, 5160000),
  ('hist_2010s_MIN_jimmy_butler', 'MIN', '2010s', ARRAY['SG', 'SF', 'PF']::text[], 'superstar', 5741, 32200000),
  ('hist_2010s_MIN_karl_anthony_towns', 'MIN', '2010s', ARRAY['C', 'PF']::text[], 'legend', 3241, 64600000),
  ('hist_2010s_MIN_kevin_love', 'MIN', '2010s', ARRAY['PF', 'C']::text[], 'superstar', 3520, 25600000),
  ('hist_2010s_MIN_kevin_martin', 'MIN', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 4624, 7160000),
  ('hist_2010s_MIN_nemanja_bjelica', 'MIN', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2739, 866000),
  ('hist_2010s_MIN_nikola_pekovic', 'MIN', '2010s', ARRAY['C', 'PF']::text[], 'pro', 5259, 1430000),
  ('hist_2010s_MIN_ricky_rubio', 'MIN', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 299, 3270000),
  ('hist_2010s_MIN_robert_covington', 'MIN', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5478, 1480000),
  ('hist_2010s_MIN_taj_gibson', 'MIN', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3490, 1040000),
  ('hist_2010s_MIN_zach_lavine', 'MIN', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 58, 15200000),
  ('hist_2010s_NOP_anthony_davis', 'NOP', '2010s', ARRAY['PF', 'C']::text[], 'legend', 8798, 89600000),
  ('hist_2010s_NOP_brandon_ingram', 'NOP', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 4643, 7180000),
  ('hist_2010s_NOP_chris_paul', 'NOP', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 9023, 42100000),
  ('hist_2010s_NOP_david_west', 'NOP', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2674, 23000000),
  ('hist_2010s_NOP_demarcus_cousins', 'NOP', '2010s', ARRAY['C', 'PF']::text[], 'legend', 723, 53300000),
  ('hist_2010s_NOP_eric_gordon', 'NOP', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 2733, 5460000),
  ('hist_2010s_NOP_j_j_redick', 'NOP', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 45, 3040000),
  ('hist_2010s_NOP_jahlil_okafor', 'NOP', '2010s', ARRAY['C', 'PF']::text[], 'pro', 4130, 1180000),
  ('hist_2010s_NOP_jrue_holiday', 'NOP', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 331, 16000000),
  ('hist_2010s_NOP_julius_randle', 'NOP', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5669, 32000000),
  ('hist_2010s_NOP_lonzo_ball', 'NOP', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5416, 1470000),
  ('hist_2010s_NOP_nikola_mirotic', 'NOP', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4045, 1160000),
  ('hist_2010s_NOP_ryan_anderson', 'NOP', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5649, 1520000),
  ('hist_2010s_NOP_tyreke_evans', 'NOP', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 1566, 19700000),
  ('hist_2010s_NOP_tyson_chandler', 'NOP', '2010s', ARRAY['C', 'PF']::text[], 'pro', 3773, 1100000),
  ('hist_2010s_NOP_zion_williamson', 'NOP', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 8219, 39700000),
  ('hist_2010s_NYK_amar_e_stoudemire', 'NYK', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4930, 29800000),
  ('hist_2010s_NYK_carmelo_anthony', 'NYK', '2010s', ARRAY['SF', 'PF']::text[], 'legend', 5396, 74300000),
  ('hist_2010s_NYK_danilo_gallinari', 'NYK', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2643, 5380000),
  ('hist_2010s_NYK_iman_shumpert', 'NYK', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 1004, 476000),
  ('hist_2010s_NYK_j_r_smith', 'NYK', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 5275, 1440000),
  ('hist_2010s_NYK_jeremy_lin', 'NYK', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5088, 1390000),
  ('hist_2010s_NYK_julius_randle', 'NYK', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1624, 19900000),
  ('hist_2010s_NYK_kristaps_porzingis', 'NYK', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1381, 19100000),
  ('hist_2010s_NYK_landry_fields', 'NYK', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 1837, 663000),
  ('hist_2010s_NYK_marcus_morris_sr', 'NYK', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5902, 1580000),
  ('hist_2010s_NYK_mitchell_robinson', 'NYK', '2010s', ARRAY['C', 'PF']::text[], 'pro', 2306, 769000),
  ('hist_2010s_NYK_raymond_felton', 'NYK', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 4552, 7100000),
  ('hist_2010s_NYK_steve_novak', 'NYK', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 925, 458000),
  ('hist_2010s_NYK_tim_hardaway_jr', 'NYK', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 5623, 1520000),
  ('hist_2010s_NYK_tyson_chandler', 'NYK', '2010s', ARRAY['C', 'PF']::text[], 'pro', 3776, 1100000),
  ('hist_2010s_OKC_andre_roberson', 'OKC', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 397, 339000),
  ('hist_2010s_OKC_carmelo_anthony', 'OKC', '2010s', ARRAY['SF', 'PF']::text[], 'legend', 5423, 74400000),
  ('hist_2010s_OKC_dennis_schroder', 'OKC', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 1629, 4470000),
  ('hist_2010s_OKC_enes_kanter', 'OKC', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 1502, 4350000),
  ('hist_2010s_OKC_james_harden', 'OKC', '2010s', ARRAY['PG', 'SG']::text[], 'legend', 6923, 81200000),
  ('hist_2010s_OKC_jerami_grant', 'OKC', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3802, 1110000),
  ('hist_2010s_OKC_kevin_durant', 'OKC', '2010s', ARRAY['SG', 'SF', 'PF']::text[], 'goat', 2500, 120000000),
  ('hist_2010s_OKC_nick_collison', 'OKC', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 909, 455000),
  ('hist_2010s_OKC_paul_george', 'OKC', '2010s', ARRAY['SG', 'SF', 'PF']::text[], 'superstar', 4094, 27300000),
  ('hist_2010s_OKC_reggie_jackson', 'OKC', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 4679, 7210000),
  ('hist_2010s_OKC_russell_westbrook', 'OKC', '2010s', ARRAY['PG', 'SG']::text[], 'legend', 8396, 87800000),
  ('hist_2010s_OKC_serge_ibaka', 'OKC', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 1828, 4650000),
  ('hist_2010s_OKC_steven_adams', 'OKC', '2010s', ARRAY['C', 'PF']::text[], 'pro', 4271, 1210000),
  ('hist_2010s_OKC_thabo_sefolosha', 'OKC', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 1657, 623000),
  ('hist_2010s_OKC_victor_oladipo', 'OKC', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 4561, 28700000),
  ('hist_2010s_ORL_aaron_gordon', 'ORL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 1846, 4660000),
  ('hist_2010s_ORL_d_j_augustin', 'ORL', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 4104, 1170000),
  ('hist_2010s_ORL_dwight_howard', 'ORL', '2010s', ARRAY['C', 'PF']::text[], 'superstar', 7919, 38800000),
  ('hist_2010s_ORL_elfrid_payton', 'ORL', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5488, 1480000),
  ('hist_2010s_ORL_evan_fournier', 'ORL', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 1747, 4570000),
  ('hist_2010s_ORL_hedo_turkoglu', 'ORL', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3303, 5970000),
  ('hist_2010s_ORL_j_j_redick', 'ORL', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 54, 3050000),
  ('hist_2010s_ORL_jameer_nelson', 'ORL', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5767, 1550000),
  ('hist_2010s_ORL_jonathan_isaac', 'ORL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2910, 905000),
  ('hist_2010s_ORL_nikola_vucevic', 'ORL', '2010s', ARRAY['C', 'PF']::text[], 'superstar', 2703, 23100000),
  ('hist_2010s_ORL_rashard_lewis', 'ORL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 233, 15700000),
  ('hist_2010s_ORL_ryan_anderson', 'ORL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5652, 1520000),
  ('hist_2010s_ORL_terrence_ross', 'ORL', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 3392, 1010000),
  ('hist_2010s_ORL_tobias_harris', 'ORL', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3729, 6360000),
  ('hist_2010s_ORL_victor_oladipo', 'ORL', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 4746, 29200000),
  ('hist_2010s_PHI_al_horford', 'PHI', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 4416, 6970000),
  ('hist_2010s_PHI_andre_iguodala', 'PHI', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5719, 8150000),
  ('hist_2010s_PHI_ben_simmons', 'PHI', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 3122, 24400000),
  ('hist_2010s_PHI_dario_saric', 'PHI', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5196, 1420000),
  ('hist_2010s_PHI_evan_turner', 'PHI', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4258, 1210000),
  ('hist_2010s_PHI_j_j_redick', 'PHI', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 317, 3290000),
  ('hist_2010s_PHI_jimmy_butler', 'PHI', '2010s', ARRAY['SG', 'SF', 'PF']::text[], 'superstar', 5566, 31700000),
  ('hist_2010s_PHI_joel_embiid', 'PHI', '2010s', ARRAY['C', 'PF']::text[], 'legend', 7379, 83200000),
  ('hist_2010s_PHI_jrue_holiday', 'PHI', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 515, 16500000),
  ('hist_2010s_PHI_lou_williams', 'PHI', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 5357, 7820000),
  ('hist_2010s_PHI_markelle_fultz', 'PHI', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 1998, 700000),
  ('hist_2010s_PHI_robert_covington', 'PHI', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5406, 1470000),
  ('hist_2010s_PHI_t_j_mcconnell', 'PHI', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 2073, 716000),
  ('hist_2010s_PHI_thaddeus_young', 'PHI', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 407, 3370000),
  ('hist_2010s_PHI_tobias_harris', 'PHI', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4127, 6710000),
  ('hist_2010s_PHX_amar_e_stoudemire', 'PHX', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5076, 30200000),
  ('hist_2010s_PHX_channing_frye', 'PHX', '2010s', ARRAY['C', 'PF']::text[], 'pro', 4048, 1160000),
  ('hist_2010s_PHX_deandre_ayton', 'PHX', '2010s', ARRAY['C', 'PF']::text[], 'superstar', 535, 16600000),
  ('hist_2010s_PHX_devin_booker', 'PHX', '2010s', ARRAY['SG', 'SF']::text[], 'legend', 7862, 85400000),
  ('hist_2010s_PHX_eric_bledsoe', 'PHX', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 875, 17600000),
  ('hist_2010s_PHX_goran_dragic', 'PHX', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 2081, 4870000),
  ('hist_2010s_PHX_jared_dudley', 'PHX', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1840, 664000),
  ('hist_2010s_PHX_kelly_oubre_jr', 'PHX', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4855, 1340000),
  ('hist_2010s_PHX_leandro_barbosa', 'PHX', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 5236, 1430000),
  ('hist_2010s_PHX_marcin_gortat', 'PHX', '2010s', ARRAY['C', 'PF']::text[], 'pro', 4081, 1170000),
  ('hist_2010s_PHX_p_j_tucker', 'PHX', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1630, 617000),
  ('hist_2010s_PHX_ricky_rubio', 'PHX', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 643, 3580000),
  ('hist_2010s_PHX_steve_nash', 'PHX', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 8744, 41200000),
  ('hist_2010s_PHX_t_j_warren', 'PHX', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1122, 4010000),
  ('hist_2010s_PHX_tyler_johnson', 'PHX', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 3071, 941000),
  ('hist_2010s_POR_al_farouq_aminu', 'POR', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2969, 918000),
  ('hist_2010s_POR_andre_miller', 'POR', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 3149, 5830000),
  ('hist_2010s_POR_brandon_roy', 'POR', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 3958, 26900000),
  ('hist_2010s_POR_cj_mccollum', 'POR', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 2412, 22200000),
  ('hist_2010s_POR_damian_lillard', 'POR', '2010s', ARRAY['PG', 'SG']::text[], 'legend', 8183, 86800000),
  ('hist_2010s_POR_enes_kanter', 'POR', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 1276, 4150000),
  ('hist_2010s_POR_jusuf_nurkic', 'POR', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 3647, 6280000),
  ('hist_2010s_POR_lamarcus_aldridge', 'POR', '2010s', ARRAY['PF', 'C']::text[], 'superstar', 4853, 29600000),
  ('hist_2010s_POR_marcus_camby', 'POR', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 4199, 6780000),
  ('hist_2010s_POR_maurice_harkless', 'POR', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2126, 728000),
  ('hist_2010s_POR_meyers_leonard', 'POR', '2010s', ARRAY['SG', 'SF']::text[], 'pro', 2027, 706000),
  ('hist_2010s_POR_nicolas_batum', 'POR', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3461, 1030000),
  ('hist_2010s_POR_robin_lopez', 'POR', '2010s', ARRAY['C', 'PF']::text[], 'pro', 3750, 1090000),
  ('hist_2010s_POR_seth_curry', 'POR', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 3202, 970000),
  ('hist_2010s_POR_wesley_matthews', 'POR', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 4999, 1370000),
  ('hist_2010s_SAC_ben_mclemore', 'SAC', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 1755, 645000),
  ('hist_2010s_SAC_bogdan_bogdanovic', 'SAC', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 5442, 1470000),
  ('hist_2010s_SAC_buddy_hield', 'SAC', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 3204, 5880000),
  ('hist_2010s_SAC_darren_collison', 'SAC', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 5455, 1480000),
  ('hist_2010s_SAC_de_aaron_fox', 'SAC', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 865, 17600000),
  ('hist_2010s_SAC_demarcus_cousins', 'SAC', '2010s', ARRAY['C', 'PF']::text[], 'legend', 750, 53400000),
  ('hist_2010s_SAC_harrison_barnes', 'SAC', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 68, 15200000),
  ('hist_2010s_SAC_isaiah_thomas', 'SAC', '2010s', ARRAY['PG', 'SG']::text[], 'legend', 107, 50500000),
  ('hist_2010s_SAC_kosta_koufos', 'SAC', '2010s', ARRAY['C', 'PF']::text[], 'pro', 1434, 573000),
  ('hist_2010s_SAC_marvin_bagley_iii', 'SAC', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2561, 5300000),
  ('hist_2010s_SAC_nemanja_bjelica', 'SAC', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2742, 867000),
  ('hist_2010s_SAC_omri_casspi', 'SAC', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1571, 603000),
  ('hist_2010s_SAC_rudy_gay', 'SAC', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1118, 18400000),
  ('hist_2010s_SAC_tyreke_evans', 'SAC', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 1575, 19700000),
  ('hist_2010s_SAC_willie_cauley_stein', 'SAC', '2010s', ARRAY['C', 'PF']::text[], 'pro', 3845, 1120000),
  ('hist_2010s_SAS_boris_diaw', 'SAS', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5272, 1440000),
  ('hist_2010s_SAS_danny_ferry', 'SAS', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 823, 435000),
  ('hist_2010s_SAS_danny_green', 'SAS', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2218, 749000),
  ('hist_2010s_SAS_dejounte_murray', 'SAS', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 4061, 1160000),
  ('hist_2010s_SAS_demar_derozan', 'SAS', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 6869, 35600000),
  ('hist_2010s_SAS_kawhi_leonard', 'SAS', '2010s', ARRAY['SG', 'SF']::text[], 'superstar', 9171, 42500000),
  ('hist_2010s_SAS_lamarcus_aldridge', 'SAS', '2010s', ARRAY['PF', 'C']::text[], 'superstar', 5387, 31200000),
  ('hist_2010s_SAS_manu_ginobili', 'SAS', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 4265, 6840000),
  ('hist_2010s_SAS_marco_belinelli', 'SAS', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2451, 801000),
  ('hist_2010s_SAS_patty_mills', 'SAS', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 2818, 884000),
  ('hist_2010s_SAS_richard_jefferson', 'SAS', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5475, 7930000),
  ('hist_2010s_SAS_rudy_gay', 'SAS', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1274, 18800000),
  ('hist_2010s_SAS_tiago_splitter', 'SAS', '2010s', ARRAY['C', 'PF']::text[], 'pro', 2634, 843000),
  ('hist_2010s_SAS_tim_duncan', 'SAS', '2010s', ARRAY['PF', 'C']::text[], 'all_star', 9440, 11500000),
  ('hist_2010s_SAS_tony_parker', 'SAS', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 7868, 10100000),
  ('hist_2010s_TOR_amir_johnson', 'TOR', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2785, 877000),
  ('hist_2010s_TOR_andrea_bargnani', 'TOR', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 986, 3890000),
  ('hist_2010s_TOR_chris_bosh', 'TOR', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4600, 28800000),
  ('hist_2010s_TOR_danny_green', 'TOR', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2221, 750000),
  ('hist_2010s_TOR_demar_derozan', 'TOR', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 6256, 33800000),
  ('hist_2010s_TOR_fred_vanvleet', 'TOR', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 4370, 1230000),
  ('hist_2010s_TOR_jonas_valanciunas', 'TOR', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 615, 3550000),
  ('hist_2010s_TOR_jose_calderon', 'TOR', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 4799, 1330000),
  ('hist_2010s_TOR_kawhi_leonard', 'TOR', '2010s', ARRAY['SG', 'SF']::text[], 'legend', 9093, 90900000),
  ('hist_2010s_TOR_kyle_lowry', 'TOR', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 2645, 22900000),
  ('hist_2010s_TOR_norman_powell', 'TOR', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2693, 856000),
  ('hist_2010s_TOR_og_anunoby', 'TOR', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1371, 558000),
  ('hist_2010s_TOR_pascal_siakam', 'TOR', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5931, 1580000),
  ('hist_2010s_TOR_serge_ibaka', 'TOR', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 1665, 4500000),
  ('hist_2010s_TOR_terrence_ross', 'TOR', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 3395, 1010000),
  ('hist_2010s_UTA_al_jefferson', 'UTA', '2010s', ARRAY['C', 'PF']::text[], 'superstar', 3588, 25800000),
  ('hist_2010s_UTA_alec_burks', 'UTA', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 2884, 899000),
  ('hist_2010s_UTA_carlos_boozer', 'UTA', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2509, 22500000),
  ('hist_2010s_UTA_deron_williams', 'UTA', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 2344, 22000000),
  ('hist_2010s_UTA_derrick_favors', 'UTA', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5701, 1530000),
  ('hist_2010s_UTA_donovan_mitchell', 'UTA', '2010s', ARRAY['PG', 'SG']::text[], 'legend', 2987, 63400000),
  ('hist_2010s_UTA_enes_kanter', 'UTA', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 1285, 4160000),
  ('hist_2010s_UTA_gordon_hayward', 'UTA', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3086, 5780000),
  ('hist_2010s_UTA_joe_ingles', 'UTA', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2129, 729000),
  ('hist_2010s_UTA_mehmet_okur', 'UTA', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 896, 3810000),
  ('hist_2010s_UTA_mike_conley', 'UTA', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 4344, 6910000),
  ('hist_2010s_UTA_paul_millsap', 'UTA', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5928, 8340000),
  ('hist_2010s_UTA_ricky_rubio', 'UTA', '2010s', ARRAY['PG', 'SG']::text[], 'all_star', 652, 3590000),
  ('hist_2010s_UTA_rodney_hood', 'UTA', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 4337, 1230000),
  ('hist_2010s_UTA_rudy_gobert', 'UTA', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 1729, 4560000),
  ('hist_2010s_WAS_antawn_jamison', 'WAS', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3831, 26500000),
  ('hist_2010s_WAS_bradley_beal', 'WAS', '2010s', ARRAY['SG', 'PG']::text[], 'superstar', 3160, 24500000),
  ('hist_2010s_WAS_emeka_okafor', 'WAS', '2010s', ARRAY['C', 'PF']::text[], 'all_star', 1873, 4690000),
  ('hist_2010s_WAS_gilbert_arenas', 'WAS', '2010s', ARRAY['PG', 'SG']::text[], 'legend', 5774, 76000000),
  ('hist_2010s_WAS_jared_dudley', 'WAS', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1706, 634000),
  ('hist_2010s_WAS_john_wall', 'WAS', '2010s', ARRAY['PG', 'SG']::text[], 'superstar', 5125, 30400000),
  ('hist_2010s_WAS_jordan_crawford', 'WAS', '2010s', ARRAY['SG', 'PG']::text[], 'pro', 3654, 1070000),
  ('hist_2010s_WAS_kelly_oubre_jr', 'WAS', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4858, 1340000),
  ('hist_2010s_WAS_marcin_gortat', 'WAS', '2010s', ARRAY['C', 'PF']::text[], 'pro', 5065, 1390000),
  ('hist_2010s_WAS_markieff_morris', 'WAS', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 869, 3780000),
  ('hist_2010s_WAS_mike_miller', 'WAS', '2010s', ARRAY['SG', 'PG']::text[], 'all_star', 851, 3770000),
  ('hist_2010s_WAS_nene', 'WAS', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4645, 1300000),
  ('hist_2010s_WAS_otto_porter_jr', 'WAS', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4694, 1310000),
  ('hist_2010s_WAS_rui_hachimura', 'WAS', '2010s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 136, 3120000),
  ('hist_2010s_WAS_tomas_satoransky', 'WAS', '2010s', ARRAY['PG', 'SG']::text[], 'pro', 2533, 820000),
  ('hist_2010s_WAS_trevor_ariza', 'WAS', '2010s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4107, 1170000),
  ('hist_2020s_ATL_bogdan_bogdanovic', 'ATL', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 2262, 5040000),
  ('hist_2020s_ATL_cam_reddish', 'ATL', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2595, 834000),
  ('hist_2020s_ATL_clint_capela', 'ATL', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 308, 3280000),
  ('hist_2020s_ATL_danilo_gallinari', 'ATL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4481, 1260000),
  ('hist_2020s_ATL_de_andre_hunter', 'ATL', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5718, 1540000),
  ('hist_2020s_ATL_dejounte_murray', 'ATL', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 3335, 25000000),
  ('hist_2020s_ATL_dyson_daniels', 'ATL', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 172, 3150000),
  ('hist_2020s_ATL_jalen_johnson', 'ATL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 759, 17300000),
  ('hist_2020s_ATL_john_collins', 'ATL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5285, 7760000),
  ('hist_2020s_ATL_kevin_huerter', 'ATL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4868, 1350000),
  ('hist_2020s_ATL_lou_williams', 'ATL', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 5806, 1560000),
  ('hist_2020s_ATL_onyeka_okongwu', 'ATL', '2020s', ARRAY['C', 'PF']::text[], 'pro', 3960, 1140000),
  ('hist_2020s_ATL_saddiq_bey', 'ATL', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 389, 3350000),
  ('hist_2020s_ATL_trae_young', 'ATL', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 8318, 87400000),
  ('hist_2020s_BKN_ben_simmons', 'BKN', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 3394, 25200000),
  ('hist_2020s_BKN_bruce_brown', 'BKN', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3605, 1060000),
  ('hist_2020s_BKN_cam_thomas', 'BKN', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 4415, 28200000),
  ('hist_2020s_BKN_d_angelo_russell', 'BKN', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 1828, 20500000),
  ('hist_2020s_BKN_dennis_schroder', 'BKN', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 2090, 4880000),
  ('hist_2020s_BKN_dorian_finney_smith', 'BKN', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2746, 868000),
  ('hist_2020s_BKN_james_harden', 'BKN', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 8208, 86900000),
  ('hist_2020s_BKN_jarrett_allen', 'BKN', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 2968, 5670000),
  ('hist_2020s_BKN_joe_harris', 'BKN', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4514, 1270000),
  ('hist_2020s_BKN_kevin_durant', 'BKN', '2020s', ARRAY['SG', 'SF', 'PF']::text[], 'legend', 9573, 93100000),
  ('hist_2020s_BKN_kyrie_irving', 'BKN', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 8155, 86700000),
  ('hist_2020s_BKN_mikal_bridges', 'BKN', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2995, 24000000),
  ('hist_2020s_BKN_nic_claxton', 'BKN', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 1348, 4210000),
  ('hist_2020s_BKN_seth_curry', 'BKN', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 5072, 1390000),
  ('hist_2020s_BKN_spencer_dinwiddie', 'BKN', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 5882, 8290000),
  ('hist_2020s_BOS_al_horford', 'BOS', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 1511, 4360000),
  ('hist_2020s_BOS_derrick_white', 'BOS', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 3955, 6560000),
  ('hist_2020s_BOS_gordon_hayward', 'BOS', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2198, 21600000),
  ('hist_2020s_BOS_grant_williams', 'BOS', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1575, 604000),
  ('hist_2020s_BOS_jaylen_brown', 'BOS', '2020s', ARRAY['SG', 'SF']::text[], 'legend', 7139, 82100000),
  ('hist_2020s_BOS_jayson_tatum', 'BOS', '2020s', ARRAY['SF', 'PF']::text[], 'legend', 7914, 85600000),
  ('hist_2020s_BOS_jrue_holiday', 'BOS', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 2023, 21100000),
  ('hist_2020s_BOS_kemba_walker', 'BOS', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 2917, 23800000),
  ('hist_2020s_BOS_kristaps_porzingis', 'BOS', '2020s', ARRAY['C', 'PF']::text[], 'superstar', 3870, 26600000),
  ('hist_2020s_BOS_malcolm_brogdon', 'BOS', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 3719, 6350000),
  ('hist_2020s_BOS_marcus_smart', 'BOS', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 5934, 1590000),
  ('hist_2020s_BOS_payton_pritchard', 'BOS', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 3582, 1060000),
  ('hist_2020s_BOS_robert_williams_iii', 'BOS', '2020s', ARRAY['C', 'PF']::text[], 'pro', 3563, 1050000),
  ('hist_2020s_BOS_sam_hauser', 'BOS', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1965, 692000),
  ('hist_2020s_CHA_brandon_miller', 'CHA', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2149, 21400000),
  ('hist_2020s_CHA_cody_martin', 'CHA', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2132, 730000),
  ('hist_2020s_CHA_devonte_graham', 'CHA', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 2136, 4920000),
  ('hist_2020s_CHA_gordon_hayward', 'CHA', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2042, 21100000),
  ('hist_2020s_CHA_grant_williams', 'CHA', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1578, 605000),
  ('hist_2020s_CHA_kelly_oubre_jr', 'CHA', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1140, 4030000),
  ('hist_2020s_CHA_kemba_walker', 'CHA', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 3180, 24500000),
  ('hist_2020s_CHA_lamelo_ball', 'CHA', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 5720, 75700000),
  ('hist_2020s_CHA_malik_monk', 'CHA', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 2380, 5140000),
  ('hist_2020s_CHA_mark_williams', 'CHA', '2020s', ARRAY['C', 'PF']::text[], 'pro', 5688, 1530000),
  ('hist_2020s_CHA_miles_bridges', 'CHA', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4240, 27700000),
  ('hist_2020s_CHA_nick_richards', 'CHA', '2020s', ARRAY['C', 'PF']::text[], 'pro', 3330, 999000),
  ('hist_2020s_CHA_p_j_washington', 'CHA', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5656, 1520000),
  ('hist_2020s_CHA_terry_rozier', 'CHA', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 3442, 25300000),
  ('hist_2020s_CHA_tre_mann', 'CHA', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 4012, 1150000),
  ('hist_2020s_CHI_alex_caruso', 'CHI', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3120, 952000),
  ('hist_2020s_CHI_andre_drummond', 'CHI', '2020s', ARRAY['C', 'PF']::text[], 'pro', 3763, 1100000),
  ('hist_2020s_CHI_ayo_dosunmu', 'CHI', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 4110, 1170000),
  ('hist_2020s_CHI_cameron_payne', 'CHI', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 2710, 860000),
  ('hist_2020s_CHI_coby_white', 'CHI', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 3629, 6270000),
  ('hist_2020s_CHI_demar_derozan', 'CHI', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4368, 69700000),
  ('hist_2020s_CHI_jevon_carter', 'CHI', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 1519, 592000),
  ('hist_2020s_CHI_josh_giddey', 'CHI', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 1128, 18400000),
  ('hist_2020s_CHI_lauri_markkanen', 'CHI', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 982, 17900000),
  ('hist_2020s_CHI_lonzo_ball', 'CHI', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 2000, 4800000),
  ('hist_2020s_CHI_matas_buzelis', 'CHI', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3074, 942000),
  ('hist_2020s_CHI_nikola_vucevic', 'CHI', '2020s', ARRAY['C', 'PF']::text[], 'superstar', 3773, 26300000),
  ('hist_2020s_CHI_patrick_williams', 'CHI', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3077, 942000),
  ('hist_2020s_CHI_wendell_carter_jr', 'CHI', '2020s', ARRAY['C', 'PF']::text[], 'pro', 5967, 1590000),
  ('hist_2020s_CHI_zach_lavine', 'CHI', '2020s', ARRAY['SG', 'PG']::text[], 'legend', 1286, 55800000),
  ('hist_2020s_CLE_caris_levert', 'CLE', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 3077, 5770000),
  ('hist_2020s_CLE_collin_sexton', 'CLE', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 2538, 22600000),
  ('hist_2020s_CLE_darius_garland', 'CLE', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 4541, 28600000),
  ('hist_2020s_CLE_de_andre_hunter', 'CLE', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 968, 3870000),
  ('hist_2020s_CLE_donovan_mitchell', 'CLE', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 6657, 80000000),
  ('hist_2020s_CLE_evan_mobley', 'CLE', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 525, 16600000),
  ('hist_2020s_CLE_isaac_okoro', 'CLE', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2191, 743000),
  ('hist_2020s_CLE_jarrett_allen', 'CLE', '2020s', ARRAY['C', 'PF']::text[], 'superstar', 370, 16100000),
  ('hist_2020s_CLE_kevin_love', 'CLE', '2020s', ARRAY['PF', 'C']::text[], 'all_star', 271, 3240000),
  ('hist_2020s_CLE_lauri_markkanen', 'CLE', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 720, 17200000),
  ('hist_2020s_CLE_max_strus', 'CLE', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 5311, 1440000),
  ('hist_2020s_CLE_rajon_rondo', 'CLE', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 5610, 1510000),
  ('hist_2020s_CLE_ricky_rubio', 'CLE', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 661, 3590000),
  ('hist_2020s_CLE_sam_merrill', 'CLE', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 1283, 539000),
  ('hist_2020s_CLE_ty_jerome', 'CLE', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 3422, 1020000),
  ('hist_2020s_DAL_anthony_davis', 'DAL', '2020s', ARRAY['PF', 'C']::text[], 'legend', 8557, 88500000),
  ('hist_2020s_DAL_christian_wood', 'DAL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4869, 7380000),
  ('hist_2020s_DAL_daniel_gafford', 'DAL', '2020s', ARRAY['C', 'PF']::text[], 'pro', 5206, 1420000),
  ('hist_2020s_DAL_dereck_lively_ii', 'DAL', '2020s', ARRAY['C', 'PF']::text[], 'pro', 3494, 1040000),
  ('hist_2020s_DAL_dorian_finney_smith', 'DAL', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2749, 869000),
  ('hist_2020s_DAL_jalen_brunson', 'DAL', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 8742, 41200000),
  ('hist_2020s_DAL_josh_green', 'DAL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 2224, 750000),
  ('hist_2020s_DAL_klay_thompson', 'DAL', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 4180, 27500000),
  ('hist_2020s_DAL_kristaps_porzingis', 'DAL', '2020s', ARRAY['C', 'PF']::text[], 'superstar', 4133, 27400000),
  ('hist_2020s_DAL_kyrie_irving', 'DAL', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 8101, 86500000),
  ('hist_2020s_DAL_luka_doncic', 'DAL', '2020s', ARRAY['PG', 'SG', 'SF']::text[], 'goat', 2000, 116000000),
  ('hist_2020s_DAL_p_j_washington', 'DAL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5659, 1520000),
  ('hist_2020s_DAL_quentin_grimes', 'DAL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3271, 986000),
  ('hist_2020s_DAL_spencer_dinwiddie', 'DAL', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 5891, 8300000),
  ('hist_2020s_DAL_tim_hardaway_jr', 'DAL', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 471, 3420000),
  ('hist_2020s_DEN_aaron_gordon', 'DEN', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3765, 6390000),
  ('hist_2020s_DEN_bol_bol', 'DEN', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1709, 635000),
  ('hist_2020s_DEN_bones_hyland', 'DEN', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 3218, 974000),
  ('hist_2020s_DEN_bruce_brown', 'DEN', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3714, 1090000),
  ('hist_2020s_DEN_christian_braun', 'DEN', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4491, 1260000),
  ('hist_2020s_DEN_jamal_murray', 'DEN', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 4833, 29500000),
  ('hist_2020s_DEN_jerami_grant', 'DEN', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5482, 1480000),
  ('hist_2020s_DEN_kentavious_caldwell_pope', 'DEN', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3658, 1070000),
  ('hist_2020s_DEN_mason_plumlee', 'DEN', '2020s', ARRAY['C', 'PF']::text[], 'pro', 3871, 1120000),
  ('hist_2020s_DEN_michael_porter_jr', 'DEN', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5167, 7650000),
  ('hist_2020s_DEN_monte_morris', 'DEN', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 4780, 1330000),
  ('hist_2020s_DEN_nikola_jokic', 'DEN', '2020s', ARRAY['C', 'PF']::text[], 'goat', 1250, 110000000),
  ('hist_2020s_DEN_paul_millsap', 'DEN', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5741, 1540000),
  ('hist_2020s_DEN_russell_westbrook', 'DEN', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 4700, 71200000),
  ('hist_2020s_DEN_will_barton', 'DEN', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 1258, 4130000),
  ('hist_2020s_DET_ausar_thompson', 'DET', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4265, 1210000),
  ('hist_2020s_DET_bojan_bogdanovic', 'DET', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2295, 21900000),
  ('hist_2020s_DET_cade_cunningham', 'DET', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 5089, 72900000),
  ('hist_2020s_DET_dennis_schroder', 'DET', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 2100, 4890000),
  ('hist_2020s_DET_isaiah_livers', 'DET', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 646, 395000),
  ('hist_2020s_DET_isaiah_stewart', 'DET', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4153, 1180000),
  ('hist_2020s_DET_jaden_ivey', 'DET', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 4833, 7350000),
  ('hist_2020s_DET_jalen_brunson', 'DET', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 8751, 41300000),
  ('hist_2020s_DET_jalen_duren', 'DET', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 3557, 6200000),
  ('hist_2020s_DET_javonte_green', 'DET', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 1525, 593000),
  ('hist_2020s_DET_jerami_grant', 'DET', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2567, 22700000),
  ('hist_2020s_DET_malik_beasley', 'DET', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4291, 1220000),
  ('hist_2020s_DET_saddiq_bey', 'DET', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 118, 3110000),
  ('hist_2020s_DET_tim_hardaway_jr', 'DET', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 208, 3190000),
  ('hist_2020s_DET_tobias_harris', 'DET', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3964, 6570000),
  ('hist_2020s_GSW_andrew_wiggins', 'GSW', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 321, 16000000),
  ('hist_2020s_GSW_brandin_podziemski', 'GSW', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 5045, 1390000),
  ('hist_2020s_GSW_buddy_hield', 'GSW', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 2896, 5610000),
  ('hist_2020s_GSW_chris_paul', 'GSW', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 4715, 29100000),
  ('hist_2020s_GSW_dennis_schroder', 'GSW', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 2109, 4900000),
  ('hist_2020s_GSW_draymond_green', 'GSW', '2020s', ARRAY['PF', 'C', 'SF']::text[], 'pro', 7718, 1990000),
  ('hist_2020s_GSW_gary_payton_ii', 'GSW', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 1325, 548000),
  ('hist_2020s_GSW_jimmy_butler', 'GSW', '2020s', ARRAY['SG', 'SF', 'PF']::text[], 'superstar', 8503, 40500000),
  ('hist_2020s_GSW_jonathan_kuminga', 'GSW', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 3701, 6330000),
  ('hist_2020s_GSW_jordan_poole', 'GSW', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 5638, 8070000),
  ('hist_2020s_GSW_kevon_looney', 'GSW', '2020s', ARRAY['C', 'PF']::text[], 'pro', 2588, 832000),
  ('hist_2020s_GSW_klay_thompson', 'GSW', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 4374, 28100000),
  ('hist_2020s_GSW_moses_moody', 'GSW', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 2697, 857000),
  ('hist_2020s_GSW_otto_porter_jr', 'GSW', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2513, 815000),
  ('hist_2020s_GSW_stephen_curry', 'GSW', '2020s', ARRAY['PG', 'SG']::text[], 'goat', 3125, 125000000),
  ('hist_2020s_HOU_alperen_sengun', 'HOU', '2020s', ARRAY['C', 'PF']::text[], 'legend', 2946, 63300000),
  ('hist_2020s_HOU_amen_thompson', 'HOU', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5765, 8190000),
  ('hist_2020s_HOU_cam_whitmore', 'HOU', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4356, 1230000),
  ('hist_2020s_HOU_christian_wood', 'HOU', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 4493, 28500000),
  ('hist_2020s_HOU_dillon_brooks', 'HOU', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5810, 1560000),
  ('hist_2020s_HOU_eric_gordon', 'HOU', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 199, 3180000),
  ('hist_2020s_HOU_fred_vanvleet', 'HOU', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 1867, 20600000),
  ('hist_2020s_HOU_jabari_smith_jr', 'HOU', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2217, 5000000),
  ('hist_2020s_HOU_jalen_green', 'HOU', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 4250, 27800000),
  ('hist_2020s_HOU_james_harden', 'HOU', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 8235, 87100000),
  ('hist_2020s_HOU_kevin_durant', 'HOU', '2020s', ARRAY['SG', 'SF', 'PF']::text[], 'legend', 9279, 91800000),
  ('hist_2020s_HOU_kevin_porter_jr', 'HOU', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 2937, 23800000),
  ('hist_2020s_HOU_reed_sheppard', 'HOU', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 3681, 1080000),
  ('hist_2020s_HOU_russell_westbrook', 'HOU', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 4485, 70200000),
  ('hist_2020s_HOU_steven_adams', 'HOU', '2020s', ARRAY['C', 'PF']::text[], 'pro', 5337, 1450000),
  ('hist_2020s_HOU_tari_eason', 'HOU', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4406, 1240000),
  ('hist_2020s_IND_aaron_nesmith', 'IND', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4471, 1260000),
  ('hist_2020s_IND_andrew_nembhard', 'IND', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 4875, 1350000),
  ('hist_2020s_IND_bennedict_mathurin', 'IND', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 3068, 5760000),
  ('hist_2020s_IND_buddy_hield', 'IND', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 3403, 6060000),
  ('hist_2020s_IND_caris_levert', 'IND', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 5855, 8270000),
  ('hist_2020s_IND_domantas_sabonis', 'IND', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5008, 30000000),
  ('hist_2020s_IND_malcolm_brogdon', 'IND', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 2859, 23600000),
  ('hist_2020s_IND_myles_turner', 'IND', '2020s', ARRAY['C', 'PF']::text[], 'superstar', 642, 16900000),
  ('hist_2020s_IND_obi_toppin', 'IND', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3805, 1110000),
  ('hist_2020s_IND_pascal_siakam', 'IND', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5796, 32400000),
  ('hist_2020s_IND_t_j_mcconnell', 'IND', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 4409, 1240000),
  ('hist_2020s_IND_t_j_warren', 'IND', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2371, 5130000),
  ('hist_2020s_IND_tyrese_haliburton', 'IND', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 5988, 76900000),
  ('hist_2020s_IND_victor_oladipo', 'IND', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 4668, 29000000),
  ('hist_2020s_LAC_chris_paul', 'LAC', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 4559, 28700000),
  ('hist_2020s_LAC_eric_gordon', 'LAC', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 462, 3420000),
  ('hist_2020s_LAC_ivica_zubac', 'LAC', '2020s', ARRAY['C', 'PF']::text[], 'superstar', 622, 16900000),
  ('hist_2020s_LAC_james_harden', 'LAC', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 6842, 80800000),
  ('hist_2020s_LAC_john_wall', 'LAC', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 5135, 30400000),
  ('hist_2020s_LAC_kawhi_leonard', 'LAC', '2020s', ARRAY['SG', 'SF']::text[], 'legend', 8155, 86700000),
  ('hist_2020s_LAC_luke_kennard', 'LAC', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3809, 1110000),
  ('hist_2020s_LAC_marcus_morris_sr', 'LAC', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 81, 3070000),
  ('hist_2020s_LAC_nicolas_batum', 'LAC', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2752, 869000),
  ('hist_2020s_LAC_norman_powell', 'LAC', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 5584, 8030000),
  ('hist_2020s_LAC_patrick_beverley', 'LAC', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 3933, 1130000),
  ('hist_2020s_LAC_paul_george', 'LAC', '2020s', ARRAY['SG', 'SF', 'PF']::text[], 'legend', 1821, 58200000),
  ('hist_2020s_LAC_reggie_jackson', 'LAC', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 3213, 5890000),
  ('hist_2020s_LAC_russell_westbrook', 'LAC', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 4887, 72000000),
  ('hist_2020s_LAC_terance_mann', 'LAC', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3451, 1030000),
  ('hist_2020s_LAL_alex_caruso', 'LAL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3123, 953000),
  ('hist_2020s_LAL_anthony_davis', 'LAL', '2020s', ARRAY['PF', 'C']::text[], 'legend', 8584, 88600000),
  ('hist_2020s_LAL_austin_reaves', 'LAL', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 729, 17200000),
  ('hist_2020s_LAL_d_angelo_russell', 'LAL', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 2314, 21900000),
  ('hist_2020s_LAL_dennis_schroder', 'LAL', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 2118, 4910000),
  ('hist_2020s_LAL_dwight_howard', 'LAL', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 4652, 7190000),
  ('hist_2020s_LAL_jarred_vanderbilt', 'LAL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2559, 826000),
  ('hist_2020s_LAL_kentavious_caldwell_pope', 'LAL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4340, 1230000),
  ('hist_2020s_LAL_kyle_kuzma', 'LAL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1877, 20600000),
  ('hist_2020s_LAL_lebron_james', 'LAL', '2020s', ARRAY['PG', 'SG', 'SF', 'PF', 'C']::text[], 'goat', 9375, 175000000),
  ('hist_2020s_LAL_luka_doncic', 'LAL', '2020s', ARRAY['PG', 'SG', 'SF']::text[], 'goat', 2000, 116000000),
  ('hist_2020s_LAL_malik_monk', 'LAL', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 2253, 5030000),
  ('hist_2020s_LAL_marc_gasol', 'LAL', '2020s', ARRAY['C', 'PF']::text[], 'pro', 4845, 1340000),
  ('hist_2020s_LAL_rui_hachimura', 'LAL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5305, 1440000),
  ('hist_2020s_LAL_russell_westbrook', 'LAL', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 4512, 70300000),
  ('hist_2020s_MEM_brandon_clarke', 'MEM', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 4245, 1210000),
  ('hist_2020s_MEM_desmond_bane', 'MEM', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 4551, 28700000),
  ('hist_2020s_MEM_dillon_brooks', 'MEM', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5711, 1530000),
  ('hist_2020s_MEM_grayson_allen', 'MEM', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3080, 943000),
  ('hist_2020s_MEM_ja_morant', 'MEM', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 6938, 81200000),
  ('hist_2020s_MEM_jaren_jackson_jr', 'MEM', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3812, 26400000),
  ('hist_2020s_MEM_jaylen_wells', 'MEM', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4015, 1150000),
  ('hist_2020s_MEM_jonas_valanciunas', 'MEM', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 5448, 7900000),
  ('hist_2020s_MEM_kyle_anderson', 'MEM', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3326, 998000),
  ('hist_2020s_MEM_luke_kennard', 'MEM', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3900, 1130000),
  ('hist_2020s_MEM_marcus_smart', 'MEM', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 5938, 1590000),
  ('hist_2020s_MEM_santi_aldama', 'MEM', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3848, 1120000),
  ('hist_2020s_MEM_steven_adams', 'MEM', '2020s', ARRAY['C', 'PF']::text[], 'pro', 5341, 1450000),
  ('hist_2020s_MEM_tyus_jones', 'MEM', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 4878, 1350000),
  ('hist_2020s_MEM_zach_edey', 'MEM', '2020s', ARRAY['C', 'PF']::text[], 'pro', 5511, 1490000),
  ('hist_2020s_MIA_andrew_wiggins', 'MIA', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 486, 16500000),
  ('hist_2020s_MIA_bam_adebayo', 'MIA', '2020s', ARRAY['PF', 'C']::text[], 'superstar', 4901, 29700000),
  ('hist_2020s_MIA_caleb_martin', 'MIA', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3274, 987000),
  ('hist_2020s_MIA_davion_mitchell', 'MIA', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 2913, 905000),
  ('hist_2020s_MIA_duncan_robinson', 'MIA', '2020s', ARRAY['PF', 'C']::text[], 'pro', 4169, 1190000),
  ('hist_2020s_MIA_gabe_vincent', 'MIA', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 3221, 975000),
  ('hist_2020s_MIA_goran_dragic', 'MIA', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 5665, 8100000),
  ('hist_2020s_MIA_jimmy_butler', 'MIA', '2020s', ARRAY['SG', 'SF', 'PF']::text[], 'superstar', 8571, 40700000),
  ('hist_2020s_MIA_kendrick_nunn', 'MIA', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 1557, 4400000),
  ('hist_2020s_MIA_kyle_lowry', 'MIA', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 5276, 7750000),
  ('hist_2020s_MIA_max_strus', 'MIA', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4550, 1270000),
  ('hist_2020s_MIA_p_j_tucker', 'MIA', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2329, 774000),
  ('hist_2020s_MIA_terry_rozier', 'MIA', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 1391, 19200000),
  ('hist_2020s_MIA_tyler_herro', 'MIA', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 5300, 30900000),
  ('hist_2020s_MIA_victor_oladipo', 'MIA', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 4571, 28700000),
  ('hist_2020s_MIL_aj_green', 'MIL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 2700, 858000),
  ('hist_2020s_MIL_bobby_portis', 'MIL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2344, 5110000),
  ('hist_2020s_MIL_brook_lopez', 'MIL', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 5403, 7860000),
  ('hist_2020s_MIL_bryn_forbes', 'MIL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 2447, 801000),
  ('hist_2020s_MIL_damian_lillard', 'MIL', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 6870, 80900000),
  ('hist_2020s_MIL_donte_divincenzo', 'MIL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3832, 1110000),
  ('hist_2020s_MIL_gary_trent_jr', 'MIL', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 63, 3060000),
  ('hist_2020s_MIL_giannis_antetokounmpo', 'MIL', '2020s', ARRAY['SF', 'PF', 'C']::text[], 'goat', 1750, 114000000),
  ('hist_2020s_MIL_grayson_allen', 'MIL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3904, 1130000),
  ('hist_2020s_MIL_jrue_holiday', 'MIL', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 3462, 25400000),
  ('hist_2020s_MIL_khris_middleton', 'MIL', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2635, 22900000),
  ('hist_2020s_MIL_kyle_kuzma', 'MIL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 2032, 21100000),
  ('hist_2020s_MIL_malik_beasley', 'MIL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4294, 1220000),
  ('hist_2020s_MIL_p_j_tucker', 'MIL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2332, 775000),
  ('hist_2020s_MIL_pat_connaughton', 'MIL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 1844, 665000),
  ('hist_2020s_MIN_anthony_edwards', 'MIN', '2020s', ARRAY['SG', 'SF']::text[], 'legend', 8343, 87500000),
  ('hist_2020s_MIN_d_angelo_russell', 'MIN', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 1838, 20500000),
  ('hist_2020s_MIN_donte_divincenzo', 'MIN', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3937, 1140000),
  ('hist_2020s_MIN_jaden_mcdaniels', 'MIN', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4917, 1360000),
  ('hist_2020s_MIN_jarred_vanderbilt', 'MIN', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2562, 826000),
  ('hist_2020s_MIN_julius_randle', 'MIN', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 1393, 56300000),
  ('hist_2020s_MIN_karl_anthony_towns', 'MIN', '2020s', ARRAY['C', 'PF']::text[], 'legend', 2866, 62900000),
  ('hist_2020s_MIN_malik_beasley', 'MIN', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4297, 1220000),
  ('hist_2020s_MIN_mike_conley', 'MIN', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 4543, 7090000),
  ('hist_2020s_MIN_naz_reid', 'MIN', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 878, 3790000),
  ('hist_2020s_MIN_nickeil_alexander_walker', 'MIN', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3084, 944000),
  ('hist_2020s_MIN_patrick_beverley', 'MIN', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 3940, 1140000),
  ('hist_2020s_MIN_rob_dillingham', 'MIN', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 4596, 1280000),
  ('hist_2020s_MIN_rudy_gobert', 'MIN', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 4606, 7150000),
  ('hist_2020s_MIN_walker_kessler', 'MIN', '2020s', ARRAY['C', 'PF']::text[], 'pro', 4901, 1350000),
  ('hist_2020s_NOP_brandon_ingram', 'NOP', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 321, 51400000),
  ('hist_2020s_NOP_cj_mccollum', 'NOP', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 4891, 29700000),
  ('hist_2020s_NOP_dejounte_murray', 'NOP', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 3083, 24200000),
  ('hist_2020s_NOP_devonte_graham', 'NOP', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 2145, 4930000),
  ('hist_2020s_NOP_dyson_daniels', 'NOP', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 9, 3010000),
  ('hist_2020s_NOP_herbert_jones', 'NOP', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4206, 1200000),
  ('hist_2020s_NOP_jonas_valanciunas', 'NOP', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 5774, 8200000),
  ('hist_2020s_NOP_jose_alvarado', 'NOP', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 3586, 1060000),
  ('hist_2020s_NOP_josh_hart', 'NOP', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 290, 3260000),
  ('hist_2020s_NOP_jrue_holiday', 'NOP', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 3579, 25700000),
  ('hist_2020s_NOP_lonzo_ball', 'NOP', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 2226, 5000000),
  ('hist_2020s_NOP_nickeil_alexander_walker', 'NOP', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3087, 945000),
  ('hist_2020s_NOP_steven_adams', 'NOP', '2020s', ARRAY['C', 'PF']::text[], 'pro', 5393, 1460000),
  ('hist_2020s_NOP_trey_murphy_iii', 'NOP', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3910, 6520000),
  ('hist_2020s_NOP_zion_williamson', 'NOP', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 7112, 82000000),
  ('hist_2020s_NYK_derrick_rose', 'NYK', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 4851, 29600000),
  ('hist_2020s_NYK_donte_divincenzo', 'NYK', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 516, 3460000),
  ('hist_2020s_NYK_evan_fournier', 'NYK', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 787, 3710000),
  ('hist_2020s_NYK_immanuel_quickley', 'NYK', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 2742, 5470000),
  ('hist_2020s_NYK_isaiah_hartenstein', 'NYK', '2020s', ARRAY['C', 'PF']::text[], 'pro', 4317, 1220000),
  ('hist_2020s_NYK_jalen_brunson', 'NYK', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 7970, 85900000),
  ('hist_2020s_NYK_josh_hart', 'NYK', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 624, 3560000),
  ('hist_2020s_NYK_julius_randle', 'NYK', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 1875, 58400000),
  ('hist_2020s_NYK_karl_anthony_towns', 'NYK', '2020s', ARRAY['C', 'PF']::text[], 'legend', 3643, 66400000),
  ('hist_2020s_NYK_mikal_bridges', 'NYK', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 3005, 24000000),
  ('hist_2020s_NYK_miles_mcbride', 'NYK', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 3028, 931000),
  ('hist_2020s_NYK_mitchell_robinson', 'NYK', '2020s', ARRAY['C', 'PF']::text[], 'pro', 3766, 1100000),
  ('hist_2020s_NYK_og_anunoby', 'NYK', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3611, 6250000),
  ('hist_2020s_NYK_quentin_grimes', 'NYK', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3372, 1010000),
  ('hist_2020s_NYK_rj_barrett', 'NYK', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1984, 21000000),
  ('hist_2020s_OKC_aaron_wiggins', 'OKC', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4019, 1150000),
  ('hist_2020s_OKC_al_horford', 'OKC', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 1294, 4160000),
  ('hist_2020s_OKC_alex_caruso', 'OKC', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3126, 953000),
  ('hist_2020s_OKC_cason_wallace', 'OKC', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 3454, 1030000),
  ('hist_2020s_OKC_chet_holmgren', 'OKC', '2020s', ARRAY['C', 'PF']::text[], 'superstar', 5815, 32400000),
  ('hist_2020s_OKC_chris_paul', 'OKC', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 4481, 28400000),
  ('hist_2020s_OKC_davis_bertans', 'OKC', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3090, 945000),
  ('hist_2020s_OKC_dennis_schroder', 'OKC', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 2127, 4910000),
  ('hist_2020s_OKC_isaiah_hartenstein', 'OKC', '2020s', ARRAY['C', 'PF']::text[], 'pro', 4274, 1210000),
  ('hist_2020s_OKC_isaiah_joe', 'OKC', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3622, 1060000),
  ('hist_2020s_OKC_isaiah_roby', 'OKC', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2031, 707000),
  ('hist_2020s_OKC_jalen_williams', 'OKC', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5368, 31100000),
  ('hist_2020s_OKC_josh_giddey', 'OKC', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 1138, 18400000),
  ('hist_2020s_OKC_luguentz_dort', 'OKC', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 5131, 1400000),
  ('hist_2020s_OKC_shai_gilgeous_alexander', 'OKC', '2020s', ARRAY['PG', 'SG']::text[], 'goat', 125, 101000000),
  ('hist_2020s_ORL_aaron_gordon', 'ORL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4009, 6610000),
  ('hist_2020s_ORL_anthony_black', 'ORL', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 3943, 1140000),
  ('hist_2020s_ORL_cole_anthony', 'ORL', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 127, 3110000),
  ('hist_2020s_ORL_evan_fournier', 'ORL', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 796, 3720000),
  ('hist_2020s_ORL_franz_wagner', 'ORL', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 4084, 27300000),
  ('hist_2020s_ORL_gary_harris', 'ORL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3399, 1010000),
  ('hist_2020s_ORL_jalen_suggs', 'ORL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 5446, 1480000),
  ('hist_2020s_ORL_jonathan_isaac', 'ORL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3100, 948000),
  ('hist_2020s_ORL_kentavious_caldwell_pope', 'ORL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4343, 1230000),
  ('hist_2020s_ORL_markelle_fultz', 'ORL', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 5662, 1520000),
  ('hist_2020s_ORL_mo_wagner', 'ORL', '2020s', ARRAY['C', 'PF']::text[], 'pro', 4133, 1180000),
  ('hist_2020s_ORL_nikola_vucevic', 'ORL', '2020s', ARRAY['C', 'PF']::text[], 'superstar', 3608, 25800000),
  ('hist_2020s_ORL_paolo_banchero', 'ORL', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 1554, 57000000),
  ('hist_2020s_ORL_terrence_ross', 'ORL', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4173, 1190000),
  ('hist_2020s_ORL_wendell_carter_jr', 'ORL', '2020s', ARRAY['C', 'PF']::text[], 'pro', 5970, 1590000),
  ('hist_2020s_PHI_al_horford', 'PHI', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 1104, 3990000),
  ('hist_2020s_PHI_andre_drummond', 'PHI', '2020s', ARRAY['C', 'PF']::text[], 'pro', 3615, 1060000),
  ('hist_2020s_PHI_ben_simmons', 'PHI', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 3248, 24700000),
  ('hist_2020s_PHI_buddy_hield', 'PHI', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 3412, 6070000),
  ('hist_2020s_PHI_danny_green', 'PHI', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 2227, 751000),
  ('hist_2020s_PHI_james_harden', 'PHI', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 6146, 77700000),
  ('hist_2020s_PHI_jaylen_brown', 'PHI', '2020s', ARRAY['SG', 'SF']::text[], 'legend', 7166, 82200000),
  ('hist_2020s_PHI_jimmy_butler', 'PHI', '2020s', ARRAY['SG', 'SF', 'PF']::text[], 'superstar', 8581, 40700000),
  ('hist_2020s_PHI_joel_embiid', 'PHI', '2020s', ARRAY['C', 'PF']::text[], 'goat', 250, 102000000),
  ('hist_2020s_PHI_kelly_oubre_jr', 'PHI', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1149, 4030000),
  ('hist_2020s_PHI_lebron_james', 'PHI', '2020s', ARRAY['PG', 'SG', 'SF', 'PF', 'C']::text[], 'goat', 9375, 175000000),
  ('hist_2020s_PHI_paul_george', 'PHI', '2020s', ARRAY['SG', 'SF', 'PF']::text[], 'legend', 1955, 58800000),
  ('hist_2020s_PHI_quentin_grimes', 'PHI', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3277, 987000),
  ('hist_2020s_PHI_seth_curry', 'PHI', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 5003, 1380000),
  ('hist_2020s_PHI_tobias_harris', 'PHI', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 4136, 6720000),
  ('hist_2020s_PHI_tyrese_haliburton', 'PHI', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 6015, 77100000),
  ('hist_2020s_PHI_tyrese_maxey', 'PHI', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 4098, 68400000),
  ('hist_2020s_PHX_bol_bol', 'PHX', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 1712, 635000),
  ('hist_2020s_PHX_bradley_beal', 'PHX', '2020s', ARRAY['SG', 'PG']::text[], 'legend', 134, 50600000),
  ('hist_2020s_PHX_cameron_johnson', 'PHX', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 5364, 1460000),
  ('hist_2020s_PHX_cameron_payne', 'PHX', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 2713, 860000),
  ('hist_2020s_PHX_chris_paul', 'PHX', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 4802, 29400000),
  ('hist_2020s_PHX_deandre_ayton', 'PHX', '2020s', ARRAY['C', 'PF']::text[], 'superstar', 2684, 23100000),
  ('hist_2020s_PHX_devin_booker', 'PHX', '2020s', ARRAY['SG', 'SF']::text[], 'legend', 8424, 87900000),
  ('hist_2020s_PHX_grayson_allen', 'PHX', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3812, 1110000),
  ('hist_2020s_PHX_jae_crowder', 'PHX', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3717, 1090000),
  ('hist_2020s_PHX_jusuf_nurkic', 'PHX', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 3520, 6170000),
  ('hist_2020s_PHX_kelly_oubre_jr', 'PHX', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 1095, 3990000),
  ('hist_2020s_PHX_kevin_durant', 'PHX', '2020s', ARRAY['SG', 'SF', 'PF']::text[], 'legend', 9225, 91500000),
  ('hist_2020s_PHX_mikal_bridges', 'PHX', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5484, 7940000),
  ('hist_2020s_PHX_royce_o_neale', 'PHX', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 3156, 960000),
  ('hist_2020s_PHX_tyus_jones', 'PHX', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 4931, 1360000),
  ('hist_2020s_POR_anfernee_simons', 'POR', '2020s', ARRAY['PG', 'SG', 'SF']::text[], 'superstar', 5504, 31500000),
  ('hist_2020s_POR_carmelo_anthony', 'POR', '2020s', ARRAY['SF', 'PF']::text[], 'legend', 5450, 74500000),
  ('hist_2020s_POR_cj_mccollum', 'POR', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 4726, 29200000),
  ('hist_2020s_POR_damian_lillard', 'POR', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 8638, 88900000),
  ('hist_2020s_POR_deandre_ayton', 'POR', '2020s', ARRAY['C', 'PF']::text[], 'superstar', 2382, 22100000),
  ('hist_2020s_POR_deni_avdija', 'POR', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 389, 16200000),
  ('hist_2020s_POR_gary_trent_jr', 'POR', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 326, 3290000),
  ('hist_2020s_POR_jerami_grant', 'POR', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 3647, 25900000),
  ('hist_2020s_POR_josh_hart', 'POR', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 633, 3570000),
  ('hist_2020s_POR_jusuf_nurkic', 'POR', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 3529, 6180000),
  ('hist_2020s_POR_norman_powell', 'POR', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 5593, 8030000),
  ('hist_2020s_POR_robert_williams_iii', 'POR', '2020s', ARRAY['C', 'PF']::text[], 'pro', 3507, 1040000),
  ('hist_2020s_POR_scoot_henderson', 'POR', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 107, 15300000),
  ('hist_2020s_POR_shaedon_sharpe', 'POR', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 632, 16900000),
  ('hist_2020s_POR_toumani_camara', 'POR', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 4648, 1300000),
  ('hist_2020s_SAC_buddy_hield', 'SAC', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 3602, 6240000),
  ('hist_2020s_SAC_davion_mitchell', 'SAC', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 2916, 906000),
  ('hist_2020s_SAC_de_aaron_fox', 'SAC', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 5196, 73400000),
  ('hist_2020s_SAC_demar_derozan', 'SAC', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4395, 69800000),
  ('hist_2020s_SAC_domantas_sabonis', 'SAC', '2020s', ARRAY['C', 'PF']::text[], 'legend', 2625, 61800000),
  ('hist_2020s_SAC_donte_divincenzo', 'SAC', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3946, 1140000),
  ('hist_2020s_SAC_harrison_barnes', 'SAC', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 2208, 4990000),
  ('hist_2020s_SAC_keegan_murray', 'SAC', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 2407, 5170000),
  ('hist_2020s_SAC_keon_ellis', 'SAC', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 2887, 900000),
  ('hist_2020s_SAC_malik_monk', 'SAC', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 710, 17100000),
  ('hist_2020s_SAC_richaun_holmes', 'SAC', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 588, 3530000),
  ('hist_2020s_SAC_trey_lyles', 'SAC', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 2756, 870000),
  ('hist_2020s_SAC_tyrese_haliburton', 'SAC', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 6042, 77200000),
  ('hist_2020s_SAC_zach_lavine', 'SAC', '2020s', ARRAY['SG', 'PG']::text[], 'legend', 1313, 55900000),
  ('hist_2020s_SAS_chris_paul', 'SAS', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 4725, 29200000),
  ('hist_2020s_SAS_de_aaron_fox', 'SAS', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 4661, 71000000),
  ('hist_2020s_SAS_dejounte_murray', 'SAS', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 3345, 25000000),
  ('hist_2020s_SAS_demar_derozan', 'SAS', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'legend', 4100, 68500000),
  ('hist_2020s_SAS_derrick_white', 'SAS', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 4145, 6730000),
  ('hist_2020s_SAS_devin_vassell', 'SAS', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 496, 16500000),
  ('hist_2020s_SAS_jakob_poeltl', 'SAS', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 2018, 4820000),
  ('hist_2020s_SAS_jeremy_sochan', 'SAS', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5554, 1500000),
  ('hist_2020s_SAS_kawhi_leonard', 'SAS', '2020s', ARRAY['SG', 'SF']::text[], 'legend', 8182, 86800000),
  ('hist_2020s_SAS_keldon_johnson', 'SAS', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 5864, 8280000),
  ('hist_2020s_SAS_lamarcus_aldridge', 'SAS', '2020s', ARRAY['PF', 'C']::text[], 'superstar', 5397, 31200000),
  ('hist_2020s_SAS_lonnie_walker_iv', 'SAS', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4347, 1230000),
  ('hist_2020s_SAS_stephon_castle', 'SAS', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 3457, 6110000),
  ('hist_2020s_SAS_tre_jones', 'SAS', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 5387, 1460000),
  ('hist_2020s_SAS_victor_wembanyama', 'SAS', '2020s', ARRAY['PF', 'C']::text[], 'goat', 750, 106000000),
  ('hist_2020s_TOR_bruce_brown', 'TOR', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 3720, 1090000),
  ('hist_2020s_TOR_chris_boucher', 'TOR', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 3835, 1110000),
  ('hist_2020s_TOR_fred_vanvleet', 'TOR', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 2188, 21600000),
  ('hist_2020s_TOR_gary_trent_jr', 'TOR', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 72, 3060000),
  ('hist_2020s_TOR_gradey_dick', 'TOR', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 1783, 4600000),
  ('hist_2020s_TOR_immanuel_quickley', 'TOR', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 2670, 5400000),
  ('hist_2020s_TOR_jakob_poeltl', 'TOR', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 2027, 4820000),
  ('hist_2020s_TOR_kawhi_leonard', 'TOR', '2020s', ARRAY['SG', 'SF']::text[], 'legend', 8209, 86900000),
  ('hist_2020s_TOR_kyle_lowry', 'TOR', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 2810, 23400000),
  ('hist_2020s_TOR_marc_gasol', 'TOR', '2020s', ARRAY['C', 'PF']::text[], 'pro', 4832, 1340000),
  ('hist_2020s_TOR_norman_powell', 'TOR', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 5602, 8040000),
  ('hist_2020s_TOR_og_anunoby', 'TOR', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 3294, 5960000),
  ('hist_2020s_TOR_pascal_siakam', 'TOR', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 5806, 32400000),
  ('hist_2020s_TOR_rj_barrett', 'TOR', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1994, 21000000),
  ('hist_2020s_TOR_scottie_barnes', 'TOR', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 5825, 32500000),
  ('hist_2020s_TOR_serge_ibaka', 'TOR', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 1674, 4510000),
  ('hist_2020s_UTA_bojan_bogdanovic', 'UTA', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 2091, 21300000),
  ('hist_2020s_UTA_collin_sexton', 'UTA', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 2548, 22600000),
  ('hist_2020s_UTA_donovan_mitchell', 'UTA', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 6684, 80100000),
  ('hist_2020s_UTA_joe_ingles', 'UTA', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'pro', 2034, 708000),
  ('hist_2020s_UTA_john_collins', 'UTA', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'all_star', 5095, 7590000),
  ('hist_2020s_UTA_jordan_clarkson', 'UTA', '2020s', ARRAY['SG', 'PG']::text[], 'superstar', 953, 17900000),
  ('hist_2020s_UTA_kelly_olynyk', 'UTA', '2020s', ARRAY['C', 'PF']::text[], 'pro', 5492, 1490000),
  ('hist_2020s_UTA_keyonte_george', 'UTA', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 5502, 7950000),
  ('hist_2020s_UTA_lauri_markkanen', 'UTA', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'legend', 1848, 58300000),
  ('hist_2020s_UTA_mike_conley', 'UTA', '2020s', ARRAY['PG', 'SG']::text[], 'all_star', 4353, 6920000),
  ('hist_2020s_UTA_ochai_agbaji', 'UTA', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 2703, 858000),
  ('hist_2020s_UTA_rudy_gay', 'UTA', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 1284, 18900000),
  ('hist_2020s_UTA_rudy_gobert', 'UTA', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 4661, 7190000),
  ('hist_2020s_UTA_walker_kessler', 'UTA', '2020s', ARRAY['C', 'PF']::text[], 'pro', 4957, 1370000),
  ('hist_2020s_WAS_alex_sarr', 'WAS', '2020s', ARRAY['C', 'PF']::text[], 'pro', 5485, 1480000),
  ('hist_2020s_WAS_bilal_coulibaly', 'WAS', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'all_star', 824, 3740000),
  ('hist_2020s_WAS_bradley_beal', 'WAS', '2020s', ARRAY['SG', 'PG']::text[], 'legend', 161, 50700000),
  ('hist_2020s_WAS_corey_kispert', 'WAS', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4445, 1250000),
  ('hist_2020s_WAS_deni_avdija', 'WAS', '2020s', ARRAY['SF', 'SG', 'PF']::text[], 'superstar', 272, 15800000),
  ('hist_2020s_WAS_jonas_valanciunas', 'WAS', '2020s', ARRAY['C', 'PF']::text[], 'all_star', 5783, 8200000),
  ('hist_2020s_WAS_jordan_poole', 'WAS', '2020s', ARRAY['SG', 'PG']::text[], 'all_star', 5647, 8080000),
  ('hist_2020s_WAS_kentavious_caldwell_pope', 'WAS', '2020s', ARRAY['SG', 'PG']::text[], 'pro', 4350, 1230000),
  ('hist_2020s_WAS_kristaps_porzingis', 'WAS', '2020s', ARRAY['C', 'PF']::text[], 'superstar', 3987, 27000000),
  ('hist_2020s_WAS_kyle_kuzma', 'WAS', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'superstar', 1750, 20300000),
  ('hist_2020s_WAS_malcolm_brogdon', 'WAS', '2020s', ARRAY['PG', 'SG']::text[], 'superstar', 2801, 23400000),
  ('hist_2020s_WAS_rui_hachimura', 'WAS', '2020s', ARRAY['PF', 'SF', 'C']::text[], 'pro', 5367, 1460000),
  ('hist_2020s_WAS_russell_westbrook', 'WAS', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 4726, 71300000),
  ('hist_2020s_WAS_trae_young', 'WAS', '2020s', ARRAY['PG', 'SG']::text[], 'legend', 8130, 86600000),
  ('hist_2020s_WAS_tyus_jones', 'WAS', '2020s', ARRAY['PG', 'SG']::text[], 'pro', 4881, 1350000)
ON CONFLICT (player_id) DO UPDATE
  SET eligible = EXCLUDED.eligible, card_tier = EXCLUDED.card_tier,
      card_score_bp = EXCLUDED.card_score_bp, card_fans = EXCLUDED.card_fans;
-- END GENERATED FRANCHISE V5 DATA

-- ---------------------------------------------------------------------------
-- Helpers (internal)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.franchise_v5_slug(p_player text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT regexp_replace(p_player, '^hist_[0-9]{4}s_[A-Za-z]+_', ''); $$;

CREATE OR REPLACE FUNCTION public.franchise_v5_lineup_fans(p_uid uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce(sum(c.fans), 0)::bigint
  FROM public.franchise_lineup l
  JOIN public.franchise_cards c ON c.id = l.card_id
  WHERE l.user_id = p_uid;
$$;

-- Dollars for `p_fan_seconds` of exposure in one period.
CREATE OR REPLACE FUNCTION public.franchise_v5_period_pay(p_fan_seconds numeric)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT floor(greatest(p_fan_seconds, 0) * s.pay_ppm / (1000000::numeric * s.pay_period_hours * 3600))::bigint
  FROM public.franchise_settings s
  WHERE s.id;
$$;

-- Pays every finished period once. Caller holds the user lock.
CREATE OR REPLACE FUNCTION public.franchise_v5_settle(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  p public.franchise_pay%ROWTYPE;
  v_secs numeric;
  v_end timestamptz;
  v_pay bigint;
  v_paid bigint := 0;
  v_periods integer := 0;
BEGIN
  SELECT * INTO p FROM public.franchise_pay WHERE user_id = p_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('paid', 0, 'periods', 0);
  END IF;
  -- Sold through an older app: stop the clock without paying past the sale.
  IF NOT EXISTS (SELECT 1 FROM public.franchise_ownership WHERE id = p.ownership_id) THEN
    DELETE FROM public.franchise_pay WHERE user_id = p_uid;
    RETURN jsonb_build_object('paid', 0, 'periods', 0);
  END IF;
  SELECT pay_period_hours * 3600 INTO v_secs FROM public.franchise_settings WHERE id;

  LOOP
    v_end := p.period_start + make_interval(secs => v_secs);
    EXIT WHEN v_end > now() OR v_periods >= 400;
    v_pay := public.franchise_v5_period_pay(p.fan_seconds + p.fans * extract(epoch FROM v_end - p.last_at));
    IF v_pay > 0 AND public.bank_post(p_uid, v_pay, 'franchise_paycheck', p.ownership_id::text || ':' || p.periods_paid,
         jsonb_build_object('team_id', p.team_id, 'period', p.periods_paid, 'period_end', v_end)) THEN
      v_paid := v_paid + v_pay;
    END IF;
    p.periods_paid := p.periods_paid + 1;
    p.period_start := v_end;
    p.last_at := v_end;
    p.fan_seconds := 0;
    v_periods := v_periods + 1;
  END LOOP;

  UPDATE public.franchise_pay
  SET periods_paid = p.periods_paid, period_start = p.period_start, last_at = p.last_at, fan_seconds = p.fan_seconds
  WHERE user_id = p_uid;
  RETURN jsonb_build_object('paid', v_paid, 'periods', v_periods, 'team_id', p.team_id);
END;
$$;

-- After any lineup change: settle, bank the old lineup's fan-seconds, start counting the new one.
CREATE OR REPLACE FUNCTION public.franchise_v5_touch(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  PERFORM public.franchise_v5_settle(p_uid);
  UPDATE public.franchise_pay
  SET fan_seconds = fan_seconds + fans * greatest(extract(epoch FROM now() - last_at), 0),
      last_at = now(),
      fans = public.franchise_v5_lineup_fans(p_uid)
  WHERE user_id = p_uid;
END;
$$;

-- Starts the paycheck clock for the owned franchise (no-op if it is already running for it).
CREATE OR REPLACE FUNCTION public.franchise_v5_open_pay(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  o public.franchise_ownership%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.franchise_ownership WHERE user_id = p_uid;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  INSERT INTO public.franchise_pay (user_id, ownership_id, team_id, period_start, last_at, fans)
  VALUES (p_uid, o.id, o.team_id, now(), now(), public.franchise_v5_lineup_fans(p_uid))
  ON CONFLICT (user_id) DO UPDATE
    SET ownership_id = EXCLUDED.ownership_id, team_id = EXCLUDED.team_id, period_start = EXCLUDED.period_start,
        periods_paid = 0, last_at = EXCLUDED.last_at, fans = EXCLUDED.fans, fan_seconds = 0
    WHERE public.franchise_pay.ownership_id <> EXCLUDED.ownership_id;
END;
$$;

-- Before a sale: pay finished periods, then the partial period up to now, and stop the clock.
CREATE OR REPLACE FUNCTION public.franchise_v5_close_pay(p_uid uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  p public.franchise_pay%ROWTYPE;
  v_settle jsonb;
  v_pay bigint := 0;
BEGIN
  v_settle := public.franchise_v5_settle(p_uid);
  SELECT * INTO p FROM public.franchise_pay WHERE user_id = p_uid FOR UPDATE;
  IF FOUND THEN
    v_pay := public.franchise_v5_period_pay(p.fan_seconds + p.fans * greatest(extract(epoch FROM now() - p.last_at), 0));
    IF v_pay > 0 AND NOT public.bank_post(p_uid, v_pay, 'franchise_paycheck',
         p.ownership_id::text || ':' || p.periods_paid || ':final',
         jsonb_build_object('team_id', p.team_id, 'period', p.periods_paid, 'partial', true)) THEN
      v_pay := 0;
    END IF;
    DELETE FROM public.franchise_pay WHERE user_id = p_uid;
  END IF;
  RETURN coalesce((v_settle ->> 'paid')::bigint, 0) + v_pay;
END;
$$;

-- Weighted tier roll: returns one odds row.
CREATE OR REPLACE FUNCTION public.franchise_v5_roll(p_odds jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_r integer := floor(random() * 10000)::integer;
  v_acc integer := 0;
  o jsonb;
BEGIN
  FOR o IN SELECT value FROM jsonb_array_elements(p_odds) LOOP
    v_acc := v_acc + (o ->> 'bps')::integer;
    IF v_r < v_acc THEN
      RETURN o;
    END IF;
  END LOOP;
  RETURN p_odds -> (jsonb_array_length(p_odds) - 1);
END;
$$;

-- One random card of a tier (optionally for a seat, skipping people already drawn). If that
-- tier has nobody left for the seat, the next tier down is used, so a draw never fails.
CREATE OR REPLACE FUNCTION public.franchise_v5_draw(p_tier text, p_min_bp integer, p_slot text, p_exclude text[])
RETURNS public.franchise_player_pool
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_tiers text[] := ARRAY['goat', 'legend', 'superstar', 'all_star', 'pro'];
  v_from integer := coalesce(array_position(v_tiers, p_tier), 5);
  v_min integer := coalesce(p_min_bp, 0);
  r public.franchise_player_pool%ROWTYPE;
BEGIN
  FOR i IN v_from..5 LOOP
    SELECT * INTO r FROM public.franchise_player_pool pool
    WHERE pool.card_tier = v_tiers[i]
      AND pool.card_score_bp >= CASE WHEN i = v_from THEN v_min ELSE 0 END
      AND (p_slot IS NULL OR p_slot = ANY (pool.eligible))
      AND NOT (public.franchise_v5_slug(pool.player_id) = ANY (coalesce(p_exclude, '{}'::text[])))
    ORDER BY random()
    LIMIT 1;
    IF FOUND THEN
      RETURN r;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'empty_pool' USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.franchise_v5_open_json(o public.franchise_chest_opens)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', o.id,
    'request_id', o.request_id,
    'chest_id', o.chest_id,
    'price', o.price,
    'cards', o.cards,
    'created_at', o.created_at,
    'revealed', o.revealed_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.franchise_v5_snapshot(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  s public.franchise_settings%ROWTYPE;
  o public.franchise_ownership%ROWTYPE;
  pr public.franchise_profile%ROWTYPE;
  p public.franchise_pay%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.franchise_settings WHERE id;
  SELECT * INTO o FROM public.franchise_ownership WHERE user_id = p_uid;
  SELECT * INTO pr FROM public.franchise_profile WHERE user_id = p_uid;
  SELECT * INTO p FROM public.franchise_pay WHERE user_id = p_uid;
  RETURN jsonb_build_object(
    'version', 5,
    'server_time', now(),
    'settings', jsonb_build_object(
      'pay_period_hours', s.pay_period_hours,
      'pay_ppm', s.pay_ppm,
      'resale_bps', s.resale_bps
    ),
    'bank', coalesce((SELECT balance FROM public.bank_accounts WHERE user_id = p_uid), 0),
    'profile', jsonb_build_object(
      'intro_seen', pr.intro_seen_at IS NOT NULL,
      'starter_claimed', pr.starter_claimed_at IS NOT NULL
    ),
    'owned', CASE WHEN o.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'ownership_id', o.id,
      'team_id', o.team_id,
      'price_paid', o.price_paid,
      'purchased_at', o.purchased_at,
      'resale_value', o.price_paid * s.resale_bps / 10000
    ) END,
    'pay', CASE WHEN p.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'period_start', p.period_start,
      'period_end', p.period_start + make_interval(hours => s.pay_period_hours),
      'periods_paid', p.periods_paid,
      'last_at', p.last_at,
      'fans', p.fans,
      'fan_seconds', p.fan_seconds
    ) END,
    'lineup', coalesce((
      SELECT jsonb_agg(jsonb_build_object('slot', l.slot, 'card_id', l.card_id)) FROM public.franchise_lineup l
      WHERE l.user_id = p_uid
    ), '[]'::jsonb),
    'cards', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'player_id', c.player_id, 'tier', c.tier, 'fans', c.fans, 'source', c.source,
        'acquired_at', c.acquired_at
      ) ORDER BY c.fans DESC, c.acquired_at)
      FROM public.franchise_cards c WHERE c.user_id = p_uid
    ), '[]'::jsonb),
    'pending', coalesce((
      SELECT jsonb_agg(public.franchise_v5_open_json(x) ORDER BY x.created_at)
      FROM public.franchise_chest_opens x WHERE x.user_id = p_uid AND x.revealed_at IS NULL
    ), '[]'::jsonb),
    'chests', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', ch.id, 'price', ch.price, 'picks', ch.picks,
        'guarantee', ch.guarantee, 'odds', ch.odds) ORDER BY ch.sort)
      FROM public.franchise_chests ch
    ), '[]'::jsonb),
    'franchises', coalesce((
      SELECT jsonb_agg(jsonb_build_object('team_id', cat.team_id, 'name', cat.name,
        'championships', cat.championships, 'price', cat.price) ORDER BY cat.sort, cat.team_id)
      FROM public.franchise_catalog cat
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_v5_slug(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_v5_lineup_fans(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_v5_period_pay(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_v5_settle(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_v5_touch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_v5_open_pay(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_v5_close_pay(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_v5_roll(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_v5_draw(text, integer, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_v5_open_json(public.franchise_chest_opens) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.franchise_v5_snapshot(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

-- The whole Franchise screen. Pays any finished paychecks first (reported as paid_now).
CREATE OR REPLACE FUNCTION public.franchise_v5_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  v_settle jsonb;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);
  PERFORM public.franchise_v5_open_pay(v_uid);
  v_settle := public.franchise_v5_settle(v_uid);
  RETURN public.franchise_v5_snapshot(v_uid) || jsonb_build_object('paid_now', coalesce((v_settle ->> 'paid')::bigint, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_v5_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.franchise_v5_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.franchise_v5_mark_intro()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
BEGIN
  INSERT INTO public.franchise_profile (user_id, intro_seen_at) VALUES (v_uid, now())
  ON CONFLICT (user_id) DO UPDATE SET intro_seen_at = coalesce(public.franchise_profile.intro_seen_at, now());
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_v5_mark_intro() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.franchise_v5_mark_intro() TO authenticated;

-- Buy a franchise, or switch: sell the current one (resale + every paycheck owed) and buy the
-- new one in one transaction — if the Bank can't cover it, nothing happens.
CREATE OR REPLACE FUNCTION public.franchise_v5_buy(p_team text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  o public.franchise_ownership%ROWTYPE;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);
  IF NOT EXISTS (SELECT 1 FROM public.franchise_catalog WHERE team_id = p_team) THEN
    RAISE EXCEPTION 'unknown_franchise' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM public.franchise_ownership WHERE user_id = v_uid;
  IF FOUND AND o.team_id <> p_team THEN
    PERFORM public.sell_franchise(o.team_id);
  END IF;
  PERFORM public.buy_franchise(p_team);
  PERFORM public.franchise_v5_open_pay(v_uid);
  RETURN public.franchise_v5_snapshot(v_uid) || jsonb_build_object('paid_now', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_v5_buy(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.franchise_v5_buy(text) TO authenticated;

-- Open a chest. p_request is the app's id for this tap: repeating it returns the same opening.
CREATE OR REPLACE FUNCTION public.franchise_v5_open_chest(p_chest text, p_request text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  ch public.franchise_chests%ROWTYPE;
  pr public.franchise_profile%ROWTYPE;
  x public.franchise_chest_opens%ROWTYPE;
  v_open uuid := gen_random_uuid();
  v_slots text[] := ARRAY['PG', 'SG', 'SF', 'PF', 'C'];
  v_slot text;
  v_roll jsonb;
  r public.franchise_player_pool%ROWTYPE;
  v_card uuid;
  v_cards jsonb := '[]'::jsonb;
  v_drawn text[] := '{}';
BEGIN
  PERFORM public.franchise_lock_user(v_uid);

  SELECT * INTO x FROM public.franchise_chest_opens WHERE user_id = v_uid AND request_id = p_request;
  IF FOUND THEN
    RETURN jsonb_build_object('open', public.franchise_v5_open_json(x), 'state',
      public.franchise_v5_snapshot(v_uid) || jsonb_build_object('paid_now', 0));
  END IF;

  SELECT * INTO ch FROM public.franchise_chests WHERE id = p_chest;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_chest' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.franchise_ownership WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'no_franchise' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.franchise_profile (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO pr FROM public.franchise_profile WHERE user_id = v_uid FOR UPDATE;
  IF p_chest = 'starter' AND pr.starter_claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'starter_claimed' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.franchise_v5_open_pay(v_uid);
  PERFORM public.franchise_v5_settle(v_uid);

  IF ch.price > 0 THEN
    PERFORM public.bank_post(v_uid, -ch.price, 'franchise_chest', v_open::text,
      jsonb_build_object('chest_id', ch.id, 'price', ch.price));
  END IF;

  FOR i IN 1..ch.picks LOOP
    v_slot := CASE WHEN p_chest = 'starter' THEN v_slots[i] ELSE NULL END;
    v_roll := public.franchise_v5_roll(ch.odds);
    r := public.franchise_v5_draw(v_roll ->> 'tier', (v_roll ->> 'min_score_bp')::integer, v_slot, v_drawn);
    v_drawn := v_drawn || public.franchise_v5_slug(r.player_id);
    INSERT INTO public.franchise_cards (user_id, player_id, tier, fans, source, open_id)
    VALUES (v_uid, r.player_id, r.card_tier, r.card_fans, CASE WHEN p_chest = 'starter' THEN 'starter' ELSE 'chest' END, v_open)
    RETURNING id INTO v_card;
    -- The Starter Chest seats each player; a seat kept from an older roster is never replaced.
    IF v_slot IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.franchise_lineup WHERE user_id = v_uid AND slot = v_slot)
       AND NOT EXISTS (
         SELECT 1 FROM public.franchise_lineup l JOIN public.franchise_cards c ON c.id = l.card_id
         WHERE l.user_id = v_uid AND public.franchise_v5_slug(c.player_id) = public.franchise_v5_slug(r.player_id)
       ) THEN
      INSERT INTO public.franchise_lineup (user_id, slot, card_id) VALUES (v_uid, v_slot, v_card);
    END IF;
    v_cards := v_cards || jsonb_build_object('card_id', v_card, 'player_id', r.player_id, 'tier', r.card_tier,
      'fans', r.card_fans, 'slot', v_slot);
  END LOOP;

  INSERT INTO public.franchise_chest_opens (id, user_id, request_id, chest_id, price, cards)
  VALUES (v_open, v_uid, p_request, ch.id, ch.price, v_cards)
  RETURNING * INTO x;

  IF p_chest = 'starter' THEN
    UPDATE public.franchise_profile SET starter_claimed_at = now(), starter_open_id = v_open WHERE user_id = v_uid;
  END IF;

  PERFORM public.franchise_v5_touch(v_uid);
  RETURN jsonb_build_object('open', public.franchise_v5_open_json(x), 'state',
    public.franchise_v5_snapshot(v_uid) || jsonb_build_object('paid_now', 0));
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_v5_open_chest(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.franchise_v5_open_chest(text, text) TO authenticated;

-- The app finished showing an opening (it stays recoverable until then).
CREATE OR REPLACE FUNCTION public.franchise_v5_reveal(p_open uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
BEGIN
  UPDATE public.franchise_chest_opens SET revealed_at = now()
  WHERE id = p_open AND user_id = v_uid AND revealed_at IS NULL;
  RETURN public.franchise_v5_snapshot(v_uid) || jsonb_build_object('paid_now', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_v5_reveal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.franchise_v5_reveal(uuid) TO authenticated;

-- Put a card in a seat. If the card is already in another seat, the two seats swap (the
-- displaced player must be able to play the other seat). The replaced player stays owned.
CREATE OR REPLACE FUNCTION public.franchise_v5_set_lineup(p_slot text, p_card uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := public.franchise_require_user();
  c public.franchise_cards%ROWTYPE;
  v_from text;
  v_current uuid;
  v_current_player text;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);
  IF p_slot NOT IN ('PG', 'SG', 'SF', 'PF', 'C') THEN
    RAISE EXCEPTION 'invalid_slot' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM public.franchise_cards WHERE id = p_card AND user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_owned' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.franchise_player_pool WHERE player_id = c.player_id AND p_slot = ANY (eligible)) THEN
    RAISE EXCEPTION 'invalid_slot' USING ERRCODE = 'P0001';
  END IF;

  SELECT slot INTO v_from FROM public.franchise_lineup WHERE user_id = v_uid AND card_id = p_card;
  IF v_from = p_slot THEN
    RETURN public.franchise_v5_snapshot(v_uid) || jsonb_build_object('paid_now', 0);
  END IF;
  SELECT l.card_id, x.player_id INTO v_current, v_current_player
  FROM public.franchise_lineup l JOIN public.franchise_cards x ON x.id = l.card_id
  WHERE l.user_id = v_uid AND l.slot = p_slot;

  -- Nobody twice: the same person may not be in another seat (other than the two involved).
  IF EXISTS (
    SELECT 1 FROM public.franchise_lineup l JOIN public.franchise_cards x ON x.id = l.card_id
    WHERE l.user_id = v_uid AND l.slot <> p_slot AND l.slot IS DISTINCT FROM v_from
      AND public.franchise_v5_slug(x.player_id) = public.franchise_v5_slug(c.player_id)
  ) THEN
    RAISE EXCEPTION 'duplicate_player' USING ERRCODE = 'P0001';
  END IF;

  IF v_from IS NOT NULL AND v_current IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.franchise_player_pool WHERE player_id = v_current_player AND v_from = ANY (eligible)) THEN
      RAISE EXCEPTION 'invalid_slot' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.franchise_lineup WHERE user_id = v_uid AND slot IN (p_slot, v_from);
    INSERT INTO public.franchise_lineup (user_id, slot, card_id) VALUES (v_uid, p_slot, p_card), (v_uid, v_from, v_current);
  ELSE
    DELETE FROM public.franchise_lineup WHERE user_id = v_uid AND (slot = p_slot OR card_id = p_card);
    INSERT INTO public.franchise_lineup (user_id, slot, card_id) VALUES (v_uid, p_slot, p_card);
  END IF;

  PERFORM public.franchise_v5_touch(v_uid);
  RETURN public.franchise_v5_snapshot(v_uid) || jsonb_build_object('paid_now', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_v5_set_lineup(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.franchise_v5_set_lineup(text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Selling also closes the paycheck clock (older apps call sell_franchise directly)
-- ---------------------------------------------------------------------------

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
  v_pay bigint;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);
  SELECT * INTO o FROM public.franchise_ownership WHERE user_id = v_uid AND team_id = p_team FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('snapshot', public.get_franchises(), 'sale', NULL);
  END IF;

  v_pay := public.franchise_v5_close_pay(v_uid);

  SELECT * INTO c FROM public.franchise_cycles
  WHERE user_id = v_uid AND status IN ('drafting', 'earning')
  FOR UPDATE;
  IF FOUND THEN
    IF c.status = 'drafting' THEN
      UPDATE public.franchise_cycles SET status = 'cancelled', ended_at = now(), end_reason = 'sold' WHERE id = c.id;
    ELSE
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
          (v_settle ->> 'income')::bigint + (v_settle ->> 'bonus')::bigint + v_pay, 'sold', o.purchased_at, now())
  ON CONFLICT (ownership_id) DO NOTHING;
  DELETE FROM public.franchise_ownership WHERE id = o.id;

  RETURN jsonb_build_object(
    'snapshot', public.get_franchises(),
    'sale', jsonb_build_object(
      'team_id', o.team_id,
      'proceeds', v_proceeds,
      'income', (v_settle ->> 'income')::bigint + v_pay,
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

-- The 48-hour draft is retired: older apps get a clear refusal instead of a second income.
CREATE OR REPLACE FUNCTION public.start_franchise_draft(p_team text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'update_required' USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.start_franchise_draft(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_franchise_draft(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Earnings summary: paychecks waiting to be banked
-- ---------------------------------------------------------------------------

-- Finished, unpaid paychecks (same math as franchise_v5_settle, without writing).
CREATE OR REPLACE FUNCTION public.franchise_v5_pending_pay(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  p public.franchise_pay%ROWTYPE;
  v_secs numeric;
  v_n integer;
  v_amount bigint;
BEGIN
  SELECT * INTO p FROM public.franchise_pay WHERE user_id = p_uid;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.franchise_ownership WHERE id = p.ownership_id) THEN
    RETURN NULL;
  END IF;
  SELECT pay_period_hours * 3600 INTO v_secs FROM public.franchise_settings WHERE id;
  v_n := least(floor(extract(epoch FROM now() - p.period_start) / v_secs)::integer, 400);
  IF v_n < 1 THEN
    RETURN NULL;
  END IF;
  v_amount := public.franchise_v5_period_pay(p.fan_seconds + p.fans * extract(epoch FROM p.period_start + make_interval(secs => v_secs) - p.last_at))
    + (v_n - 1)::bigint * public.franchise_v5_period_pay(p.fans * v_secs);
  IF v_amount <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('kind', 'franchise_paycheck', 'ref', p.ownership_id::text || ':' || p.periods_paid,
    'team_id', p.team_id, 'hours', v_n * (v_secs / 3600)::integer, 'amount', v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.franchise_v5_pending_pay(uuid) FROM PUBLIC, anon, authenticated;

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
    SELECT 0 AS ord, public.franchise_v5_pending_pay(p_uid) AS item
    WHERE public.franchise_v5_pending_pay(p_uid) IS NOT NULL
    UNION ALL
    SELECT 1, jsonb_build_object(
      'kind', 'franchise_income', 'ref', c.id, 'team_id', c.team_id,
      'hours', public.franchise_hours_earned(c) - c.hours_paid,
      'amount', (public.franchise_hours_earned(c) - c.hours_paid)::bigint * c.hourly_rate
    )
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
  v_ref text;
BEGIN
  PERFORM public.franchise_lock_user(v_uid);

  SELECT ownership_id::text || ':' || periods_paid INTO v_ref FROM public.franchise_pay WHERE user_id = v_uid;
  v_settle := public.franchise_v5_settle(v_uid);
  IF (v_settle ->> 'paid')::bigint > 0 THEN
    v_items := v_items || jsonb_build_object('kind', 'franchise_paycheck', 'ref', v_ref,
      'team_id', v_settle ->> 'team_id', 'hours', (v_settle ->> 'periods')::integer *
        (SELECT pay_period_hours FROM public.franchise_settings WHERE id),
      'amount', (v_settle ->> 'paid')::bigint);
  END IF;

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
-- Legacy rosters → v5 (runs once per account; safe to re-run)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  u record;
  c public.franchise_cycles%ROWTYPE;
  v_remaining bigint;
  pk jsonb;
  pool public.franchise_player_pool%ROWTYPE;
  v_card uuid;
  v_seated integer;
BEGIN
  FOR u IN
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM public.franchise_ownership
      UNION SELECT user_id FROM public.franchise_cycles
    ) x
    WHERE NOT EXISTS (SELECT 1 FROM public.franchise_profile pr WHERE pr.user_id = x.user_id AND pr.legacy_imported_at IS NOT NULL)
  LOOP
    -- Open 48-hour rosters: pay what was earned, then the hours they were still owed.
    FOR c IN SELECT * FROM public.franchise_cycles WHERE user_id = u.user_id AND status = 'earning' LOOP
      PERFORM public.franchise_settle(c.id);
      SELECT * INTO c FROM public.franchise_cycles WHERE id = c.id;
      IF c.status = 'earning' THEN
        v_remaining := greatest(coalesce(c.hours_total, 0) - c.hours_paid, 0)::bigint * coalesce(c.hourly_rate, 0)
          + CASE WHEN c.bonus_paid THEN 0 ELSE coalesce(c.completion_bonus, 0) END;
        IF v_remaining > 0 THEN
          PERFORM public.bank_post(c.user_id, v_remaining, 'franchise_income', c.id::text || ':v5',
            jsonb_build_object('team_id', c.team_id, 'cycle_id', c.id, 'v5_upgrade', true));
        END IF;
        UPDATE public.franchise_cycles
        SET status = 'collected', collected_at = now(), hours_paid = coalesce(hours_total, hours_paid),
            bonus_paid = true, end_reason = 'v5_upgrade'
        WHERE id = c.id;
      END IF;
    END LOOP;
    UPDATE public.franchise_cycles SET status = 'cancelled', ended_at = now(), end_reason = 'v5_upgrade'
    WHERE user_id = u.user_id AND status = 'drafting';

    -- The most recent roster becomes the starting five.
    SELECT * INTO c FROM public.franchise_cycles
    WHERE user_id = u.user_id AND jsonb_array_length(picks) > 0
    ORDER BY coalesce(locked_at, created_at) DESC
    LIMIT 1;
    v_seated := 0;
    IF FOUND THEN
      FOR pk IN SELECT value FROM jsonb_array_elements(c.picks) LOOP
        SELECT * INTO pool FROM public.franchise_player_pool WHERE player_id = pk ->> 'player_id';
        CONTINUE WHEN NOT FOUND;
        INSERT INTO public.franchise_cards (user_id, player_id, tier, fans, source)
        VALUES (u.user_id, pool.player_id, coalesce(pool.card_tier, 'pro'),
                coalesce(pool.card_fans, 250000), 'legacy')
        RETURNING id INTO v_card;
        IF (pk ->> 'slot') = ANY (pool.eligible)
           AND NOT EXISTS (SELECT 1 FROM public.franchise_lineup WHERE user_id = u.user_id AND slot = pk ->> 'slot') THEN
          INSERT INTO public.franchise_lineup (user_id, slot, card_id) VALUES (u.user_id, pk ->> 'slot', v_card);
          v_seated := v_seated + 1;
        END IF;
      END LOOP;
    END IF;

    INSERT INTO public.franchise_profile (user_id, legacy_imported_at, starter_claimed_at, intro_seen_at)
    VALUES (u.user_id, now(), CASE WHEN v_seated = 5 THEN now() END, now())
    ON CONFLICT (user_id) DO UPDATE
      SET legacy_imported_at = now(),
          starter_claimed_at = coalesce(public.franchise_profile.starter_claimed_at, EXCLUDED.starter_claimed_at),
          intro_seen_at = coalesce(public.franchise_profile.intro_seen_at, EXCLUDED.intro_seen_at);

    PERFORM public.franchise_v5_open_pay(u.user_id);
  END LOOP;
END;
$$;
