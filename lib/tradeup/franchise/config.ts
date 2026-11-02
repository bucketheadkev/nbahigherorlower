/**
 * Franchise mode (v5) — the single source of truth for card tiers, fans, chests and paychecks.
 *
 * The server mirrors these values (supabase/migrations/20261101_1_franchise_v5_chests.sql, whose
 * generated block comes from scripts/generate-franchise-v5.ts). Change values here, regenerate,
 * and apply the migration. In-game Bank Cash only — nothing here is ever sold for real money.
 */

export type CardTier = 'pro' | 'all_star' | 'superstar' | 'legend' | 'goat';

export const CARD_TIER_ORDER: CardTier[] = ['pro', 'all_star', 'superstar', 'legend', 'goat'];

/** Fan range per tier. A player's fans = min + (max − min) × his ranking score (0–1). */
export const CARD_TIERS: Record<CardTier, { minFans: number; maxFans: number; label: { en: string; es: string } }> = {
  pro: { minFans: 250_000, maxFans: 2_500_000, label: { en: 'Pro', es: 'Pro' } },
  all_star: { minFans: 3_000_000, maxFans: 12_000_000, label: { en: 'All-Star', es: 'All-Star' } },
  superstar: { minFans: 15_000_000, maxFans: 45_000_000, label: { en: 'Superstar', es: 'Superestrella' } },
  legend: { minFans: 50_000_000, maxFans: 95_000_000, label: { en: 'Legend', es: 'Leyenda' } },
  goat: { minFans: 100_000_000, maxFans: 180_000_000, label: { en: 'GOAT', es: 'GOAT' } },
};

/** "High-end Legend" in the GOAT chest: a Legend whose ranking score is at least this. */
export const HIGH_END_LEGEND_SCORE = 0.5;

export type ChestId = 'starter' | 'pro' | 'all_star' | 'superstar' | 'legend' | 'goat';

export interface ChestOdds {
  tier: CardTier;
  /** Weight in basis points (all rows of a chest add up to 10,000). */
  bps: number;
  /** Only players at or above this ranking score inside the tier. */
  minScore?: number;
}

export interface ChestDef {
  id: ChestId;
  price: number;
  /** Players revealed per opening: the Starter Chest fills all five seats; every other chest gives one. */
  picks: number;
  odds: ChestOdds[];
  /** The chest's main tier ("guaranteed X or better" in the shop). */
  guarantee: CardTier;
}

export const CHESTS: Record<ChestId, ChestDef> = {
  starter: {
    id: 'starter',
    price: 0,
    picks: 5,
    guarantee: 'pro',
    odds: [
      { tier: 'pro', bps: 7000 },
      { tier: 'all_star', bps: 2500 },
      { tier: 'superstar', bps: 400 },
      { tier: 'legend', bps: 100 },
    ],
  },
  pro: {
    id: 'pro',
    price: 5_000_000,
    picks: 1,
    guarantee: 'pro',
    odds: [
      { tier: 'pro', bps: 8000 },
      { tier: 'all_star', bps: 1800 },
      { tier: 'superstar', bps: 200 },
    ],
  },
  all_star: {
    id: 'all_star',
    price: 12_000_000,
    picks: 1,
    guarantee: 'all_star',
    odds: [
      { tier: 'all_star', bps: 7200 },
      { tier: 'superstar', bps: 2500 },
      { tier: 'legend', bps: 300 },
    ],
  },
  superstar: {
    id: 'superstar',
    price: 30_000_000,
    picks: 1,
    guarantee: 'superstar',
    odds: [
      { tier: 'superstar', bps: 7800 },
      { tier: 'legend', bps: 2000 },
      { tier: 'goat', bps: 200 },
    ],
  },
  legend: {
    id: 'legend',
    price: 70_000_000,
    picks: 1,
    guarantee: 'legend',
    odds: [
      { tier: 'legend', bps: 9000 },
      { tier: 'goat', bps: 1000 },
    ],
  },
  goat: {
    id: 'goat',
    price: 150_000_000,
    picks: 1,
    guarantee: 'legend',
    odds: [
      { tier: 'legend', bps: 6000, minScore: HIGH_END_LEGEND_SCORE },
      { tier: 'goat', bps: 4000 },
    ],
  },
};

/** Shop order. */
export const SHOP_CHESTS: ChestId[] = ['pro', 'all_star', 'superstar', 'legend', 'goat'];

/**
 * Paychecks: every 12 hours the franchise pays its average active fans × 0.01 (pay_ppm / 1,000,000).
 * Time-weighted inside each period, so a lineup change only counts for the time it was active.
 * 100,000,000 fans → $1,000,000 per paycheck.
 */
export const PAYCHECK = {
  periodHours: 12,
  /** Dollars per fan per period, in millionths (10,000 = $0.01). */
  payPpm: 10_000,
} as const;

/** Whole dollars for one full period at a constant fan count. Mirrors public.franchise_v5_period_pay. */
export function paycheckFor(fans: number): number {
  return Math.floor((Math.max(0, fans) * PAYCHECK.payPpm) / 1_000_000);
}

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type Slot = (typeof POSITIONS)[number];

/** Explainer rows for "How earnings work" — computed from the formula, never paid from. */
export const EARNINGS_EXAMPLES = [10_000_000, 100_000_000, 250_000_000, 500_000_000];
