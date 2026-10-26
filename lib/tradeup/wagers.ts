/**
 * Bet on Yourself — pre-run wagers on a Classic Run. In-game Cash only.
 *
 * Rules are pure and shared by the game, the odds simulator
 * (scripts/simulate-wagers.ts) and the server (20261018_6_wager_slips.sql mirrors them).
 * Every team-total target is at most $1,025,000,000 (WAGER_MAX_TEAM_TARGET).
 *
 * Money is whole dollars (integers); payouts use integer math on multiplier hundredths.
 */

export const WAGER_MAX_TEAM_TARGET = 1_025_000_000;
/**
 * $1,025,000,000 is reachable but ~1 in 10,000 runs in simulation (best seen $1,026,000,000),
 * so High Roller uses the highest target that is realistically attainable (~0.7% of runs).
 */
export const HIGH_ROLLER_TARGET = 1_010_000_000;
export const MAX_WAGERS_PER_RUN = 3;
export const STAKE_STEPS = [100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000] as const;
export const MAX_STAKE = STAKE_STEPS[STAKE_STEPS.length - 1]!;

export type WagerId =
  | 'billion_or_bust'
  | 'star_hunter'
  | 'dynamic_duo'
  | 'no_rerolls'
  | 'superteam'
  | 'triple_threat'
  | 'high_roller';

/** What a finished run looks like to the wager rules. */
export interface WagerRunFacts {
  /** Final seat-priced team value. */
  total: number;
  /** Seated value of each drafted player, in the order they were drafted. */
  draftValues: number[];
  /** Any team or era reroll used this run. */
  rerollsUsed: boolean;
}

export interface WagerDef {
  id: WagerId;
  name: string;
  /** Short winning condition. */
  rule: string;
  /** Target shown as the headline number. */
  target: string;
  /** Multiplier in hundredths (2.5× = 250). Total return = stake × multiplier. */
  multiplierX100: number;
  /** Largest stake step allowed (mirrors wager_catalog.max_stake). */
  maxStake: number;
  icon: 'billion' | 'star' | 'duo' | 'lock' | 'team' | 'triple' | 'crown';
  wins: (facts: WagerRunFacts) => boolean;
}

const M = 1_000_000;
const count = (values: number[], min: number) => values.filter((v) => v >= min).length;

/**
 * Multipliers come from scripts/simulate-wagers.ts (real spins, era rosters, eligibility and seat
 * prices; best of six draft strategies per wager), priced at about a 10% house edge:
 * multiplier ≈ 0.9 / P(win). The two long shots are capped below their fair price.
 *
 *   Billion or Bust  ~2.2%  → 20×  (fair ≈ 40×, capped) · stakes up to $10,000,000
 *   Star Hunter      ~78%   → 1.15×
 *   Dynamic Duo      ~88%   → 1.05×
 *   No Rerolls       ~54%   → 1.3×  (cut from 1.6×)
 *   Superteam        5 × $190,000,000 → 1.45× (bar raised from $170,000,000, multiplier kept)
 *   Triple Threat    ~90%   → 1.05× (rounded up from 1.0×; ~95% return)
 *   High Roller      ~0.7%  → 40×  (fair ≈ 120×, capped) · stakes up to $1,000,000
 */
export const WAGERS: readonly WagerDef[] = [
  {
    id: 'billion_or_bust',
    name: 'Billion or Bust',
    rule: 'Finish with a team worth $1,000,000,000 or more.',
    target: '$1,000,000,000',
    multiplierX100: 2000,
    maxStake: 10_000_000,
    icon: 'billion',
    wins: (f) => f.total >= 1_000 * M,
  },
  {
    id: 'star_hunter',
    name: 'Star Hunter',
    rule: 'Draft at least one player worth $200,000,000 or more.',
    target: '1 × $200,000,000',
    multiplierX100: 115,
    maxStake: 5_000_000,
    icon: 'star',
    wins: (f) => count(f.draftValues, 200 * M) >= 1,
  },
  {
    id: 'dynamic_duo',
    name: 'Dynamic Duo',
    rule: 'Draft two players worth $190,000,000 or more each.',
    target: '2 × $190,000,000',
    multiplierX100: 105,
    maxStake: 5_000_000,
    icon: 'duo',
    wins: (f) => count(f.draftValues, 190 * M) >= 2,
  },
  {
    id: 'no_rerolls',
    name: 'No Rerolls',
    rule: 'Reach $900,000,000 without using a team or era reroll.',
    target: '$900,000,000 · no rerolls',
    multiplierX100: 130,
    maxStake: 5_000_000,
    icon: 'lock',
    wins: (f) => !f.rerollsUsed && f.total >= 900 * M,
  },
  {
    id: 'superteam',
    name: 'Superteam',
    rule: 'All five players are worth $190,000,000 or more.',
    target: '5 × $190,000,000',
    multiplierX100: 145,
    maxStake: 5_000_000,
    icon: 'team',
    wins: (f) => f.draftValues.length >= 5 && count(f.draftValues, 190 * M) >= 5,
  },
  {
    id: 'triple_threat',
    name: 'Triple Threat',
    rule: 'Draft three players worth $185,000,000 or more each.',
    target: '3 × $185,000,000',
    multiplierX100: 105,
    maxStake: 5_000_000,
    icon: 'triple',
    wins: (f) => count(f.draftValues, 185 * M) >= 3,
  },
  {
    id: 'high_roller',
    name: 'High Roller',
    rule: 'Finish with a team worth $1,010,000,000 or more.',
    target: '$1,010,000,000',
    multiplierX100: 4000,
    maxStake: 1_000_000,
    icon: 'crown',
    wins: (f) => f.total >= HIGH_ROLLER_TARGET,
  },
];

export const WAGER_BY_ID = Object.fromEntries(WAGERS.map((w) => [w.id, w])) as Record<WagerId, WagerDef>;

export function isWagerId(value: unknown): value is WagerId {
  return typeof value === 'string' && value in WAGER_BY_ID;
}

/** Largest allowed stake for a wager. */
export function maxStakeFor(id: WagerId): number {
  return WAGER_BY_ID[id].maxStake;
}

/** Total return (stake included) in whole dollars. */
export function wagerReturn(stake: number, multiplierX100: number): number {
  return Math.floor((stake * multiplierX100) / 100);
}

export function formatMultiplierX100(x100: number): string {
  const digits = x100 % 100 === 0 ? 0 : x100 % 10 === 0 ? 1 : 2;
  return `${(x100 / 100).toFixed(digits)}×`;
}

export interface WagerPick {
  id: WagerId;
  stake: number;
}

export interface WagerResult extends WagerPick {
  won: boolean;
  multiplierX100: number;
  /** Credited total return (0 when lost). */
  returned: number;
}

export function settleWagers(picks: WagerPick[], facts: WagerRunFacts): WagerResult[] {
  return picks.map((pick) => {
    const def = WAGER_BY_ID[pick.id];
    const won = def.wins(facts);
    return {
      ...pick,
      won,
      multiplierX100: def.multiplierX100,
      returned: won ? wagerReturn(pick.stake, def.multiplierX100) : 0,
    };
  });
}

/** Valid slip: 1–3 distinct wagers, allowed stakes, total within the Bank. */
export function validateSlip(picks: WagerPick[], bank: number): string | null {
  if (picks.length === 0 || picks.length > MAX_WAGERS_PER_RUN) return 'count';
  if (new Set(picks.map((p) => p.id)).size !== picks.length) return 'duplicate';
  if (
    picks.some(
      (p) =>
        !isWagerId(p.id) ||
        !STAKE_STEPS.includes(p.stake as (typeof STAKE_STEPS)[number]) ||
        p.stake > maxStakeFor(p.id),
    )
  ) {
    return 'stake';
  }
  if (picks.reduce((sum, p) => sum + p.stake, 0) > bank) return 'insufficient';
  return null;
}
