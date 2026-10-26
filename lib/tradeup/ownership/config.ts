/**
 * Franchise Ownership economy — the single source of truth.
 *
 * The server mirrors these values in public.franchise_catalog / public.franchise_settings;
 * scripts/generate-franchise-seed.ts writes them into the catalog block of
 * supabase/migrations/20261025_2_franchise_v3_fans.sql. Change values here, regenerate, and paste.
 * In-game Cash only — nothing here is ever sold for real money.
 */

/** NBA championships per current franchise, verified Oct 2026 (after the 2026 Finals, Knicks). */
export const CHAMPIONSHIPS: Record<string, number> = {
  BOS: 18,
  LAL: 17,
  GSW: 7,
  CHI: 6,
  SAS: 5,
  DET: 3,
  MIA: 3,
  NYK: 3,
  PHI: 3,
  HOU: 2,
  MIL: 2,
  OKC: 2,
  ATL: 1,
  CLE: 1,
  DAL: 1,
  DEN: 1,
  POR: 1,
  SAC: 1,
  TOR: 1,
  WAS: 1,
  BKN: 0,
  CHA: 0,
  IND: 0,
  LAC: 0,
  MEM: 0,
  MIN: 0,
  NOP: 0,
  ORL: 0,
  PHX: 0,
  UTA: 0,
};

export type FranchiseTier = 'iconic' | 'legendary' | 'popular' | 'established' | 'small';

/** Price tiers, most prestigious first. */
export const TIERS: Record<FranchiseTier, { price: number; name: { en: string; es: string } }> = {
  iconic: { price: 200_000_000, name: { en: 'Iconic', es: 'Icónica' } },
  legendary: { price: 125_000_000, name: { en: 'Legendary', es: 'Legendaria' } },
  popular: { price: 75_000_000, name: { en: 'Popular', es: 'Popular' } },
  established: { price: 40_000_000, name: { en: 'Established', es: 'Establecida' } },
  small: { price: 20_000_000, name: { en: 'Small Market', es: 'Mercado chico' } },
};

export const TIER_ORDER: FranchiseTier[] = ['iconic', 'legendary', 'popular', 'established', 'small'];

/** Prestige: titles, dynasties, market and global following. */
export const FRANCHISE_TIER: Record<string, FranchiseTier> = {
  BOS: 'iconic',
  LAL: 'iconic',
  CHI: 'iconic',
  GSW: 'iconic',
  SAS: 'legendary',
  MIA: 'legendary',
  NYK: 'legendary',
  PHI: 'legendary',
  DET: 'legendary',
  HOU: 'popular',
  MIL: 'popular',
  OKC: 'popular',
  DAL: 'popular',
  CLE: 'popular',
  DEN: 'popular',
  PHX: 'popular',
  TOR: 'popular',
  ATL: 'established',
  POR: 'established',
  SAC: 'established',
  WAS: 'established',
  BKN: 'established',
  IND: 'established',
  UTA: 'established',
  ORL: 'established',
  LAC: 'established',
  CHA: 'small',
  MEM: 'small',
  MIN: 'small',
  NOP: 'small',
};

/** Selling returns this share of the price paid. Below 100% so buy/sell loops always lose Cash. */
export const RESALE = {
  refundBps: 7500,
} as const;

/**
 * Earnings. A roster's Fan Power is its five players' total fans ÷ 1,000,000,000, capped at 2.000.
 * Every hour of the 48 pays: price paid × 0.075% × Fan Power.
 *   Iconic $200,000,000 · Fan Power 1.500 → $225,000 / hour → $10,800,000 over 48 hours
 *   Small Market $20,000,000 · same roster → $22,500 / hour
 * Integer math throughout (Fan Power in thousandths, the rate in millionths) so the app and the
 * server (public.franchise_hourly) produce the same dollars.
 */
export const EARNINGS = {
  fansPerPower: 1_000_000_000,
  maxPowerMilli: 2000,
  /** Hourly pay per 1.000 Fan Power, in millionths of the price paid (750 = 0.075%). */
  hourlyPpm: 750,
} as const;

export const CYCLE_HOURS = 48;

export function franchiseTier(teamId: string): FranchiseTier {
  return FRANCHISE_TIER[teamId] ?? 'small';
}

export function franchisePrice(teamId: string): number {
  return TIERS[franchiseTier(teamId)].price;
}

export function resaleValue(pricePaid: number): number {
  return Math.floor((pricePaid * RESALE.refundBps) / 10_000);
}

/** Fan Power in thousandths (1623 = 1.623), capped. Mirrors public.franchise_fan_power_milli. */
export function fanPowerMilli(fans: number): number {
  return Math.min(EARNINGS.maxPowerMilli, Math.floor(Math.max(0, fans) / (EARNINGS.fansPerPower / 1000)));
}

/** Whole dollars per hour. Mirrors public.franchise_hourly. */
export function hourlyPay(pricePaid: number, fans: number): number {
  return Math.floor((pricePaid * EARNINGS.hourlyPpm * fanPowerMilli(fans)) / 1_000_000_000);
}

/** Pay per hour for each 1.000 of Fan Power. */
export function hourlyPerPower(pricePaid: number): number {
  return Math.floor((pricePaid * EARNINGS.hourlyPpm) / 1_000_000);
}

/** Best possible hourly pay for a price (Fan Power at its cap). */
export function maxHourly(pricePaid: number): number {
  return hourlyPay(pricePaid, Number.MAX_SAFE_INTEGER);
}

export function formatFanPower(milli: number): string {
  return (milli / 1000).toFixed(3);
}

/** Catalog order: most prestigious tier first, then titles, then name. */
export function compareFranchises(
  a: { teamId: string; championships: number; name: string },
  b: { teamId: string; championships: number; name: string },
): number {
  return (
    TIER_ORDER.indexOf(franchiseTier(a.teamId)) - TIER_ORDER.indexOf(franchiseTier(b.teamId)) ||
    b.championships - a.championships ||
    a.name.localeCompare(b.name)
  );
}
