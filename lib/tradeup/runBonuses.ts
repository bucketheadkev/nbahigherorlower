/**
 * Run Bonuses — one free optional objective per Classic Run. No entry fee, nothing to lose;
 * complete it and the reward goes straight to the Bank. In-game Cash only.
 *
 * The server (supabase/migrations/20261026_2_rollover_run_bonus_rank_rewards.sql) assigns,
 * checks and pays signed-in runs from the verified lineup; this file mirrors those rules for the
 * UI, guests and scripts/simulate-run-bonuses.ts. Keep both in step.
 */

import type { Position } from './types';

export type RunBonusTier = 1 | 2 | 3 | 4;

export type RunBonusId =
  | 'elite_pull'
  | 'triple_threat'
  | 'club_920'
  | 'perfect_fit'
  | 'generation_gap'
  | 'double_trouble'
  | 'no_second_chances'
  | 'no_weak_links'
  | 'five_franchises'
  | 'across_the_eras'
  | 'superstar_duo'
  | 'triple_elite'
  | 'four_horsemen'
  | 'almost_a_billion'
  | 'flawless_draft'
  | 'perfect_five'
  | 'billion_dollar_run'
  | 'untouchable'
  | 'billion_without_mercy'
  | 'goat_combination';

/** A finished run as the bonus rules see it. Values are final seat prices (position penalty applied). */
export interface RunBonusFacts {
  total: number;
  values: number[];
  /** Every player seated at his primary position. */
  allPrimary: boolean;
  /** Distinct NBA teams and decades among the five. */
  teams: number;
  eras: number;
  /** Era-free player keys (michael_jordan). */
  slugs: string[];
  rerollsUsed: boolean;
}

type Copy = { en: string; es: string };

export interface RunBonusDef {
  id: RunBonusId;
  tier: RunBonusTier;
  name: Copy;
  rule: Copy;
  reward: number;
  met: (f: RunBonusFacts) => boolean;
}

const M = 1_000_000;
const atLeast = (f: RunBonusFacts, min: number) => f.values.filter((v) => v >= min).length;

export const RUN_BONUSES: readonly RunBonusDef[] = [
  // Tier 1 — Challenging
  {
    id: 'elite_pull',
    tier: 1,
    name: { en: 'Elite Pull', es: 'Fichaje de élite' },
    rule: { en: 'Draft one player worth $200,000,000+', es: 'Elige un jugador de $200,000,000+' },
    reward: 2 * M,
    met: (f) => atLeast(f, 200 * M) >= 1,
  },
  {
    id: 'triple_threat',
    tier: 1,
    name: { en: 'Triple Threat', es: 'Triple amenaza' },
    rule: { en: 'Draft three players worth $185,000,000+ each', es: 'Elige tres jugadores de $185,000,000+ cada uno' },
    reward: 3 * M,
    met: (f) => atLeast(f, 185 * M) >= 3,
  },
  {
    id: 'club_920',
    tier: 1,
    name: { en: 'The $920M Club', es: 'El club de $920M' },
    rule: { en: 'Finish with $920,000,000+', es: 'Termina con $920,000,000+' },
    reward: 3 * M,
    met: (f) => f.total >= 920 * M,
  },
  {
    id: 'perfect_fit',
    tier: 1,
    name: { en: 'Perfect Fit', es: 'Encaje perfecto' },
    rule: { en: 'All five at their primary position, reach $900,000,000+', es: 'Los cinco en su posición principal y $900,000,000+' },
    reward: 4 * M,
    met: (f) => f.allPrimary && f.total >= 900 * M,
  },
  {
    id: 'generation_gap',
    tier: 1,
    name: { en: 'Generation Gap', es: 'Salto generacional' },
    rule: { en: 'Players from three different eras, reach $920,000,000+', es: 'Jugadores de tres épocas distintas y $920,000,000+' },
    reward: 4 * M,
    met: (f) => f.eras >= 3 && f.total >= 920 * M,
  },
  // Tier 2 — Very Difficult
  {
    id: 'double_trouble',
    tier: 2,
    name: { en: 'Double Trouble', es: 'Doble problema' },
    rule: { en: 'Two players worth $195,000,000+ each', es: 'Dos jugadores de $195,000,000+ cada uno' },
    reward: 6 * M,
    met: (f) => atLeast(f, 195 * M) >= 2,
  },
  {
    id: 'no_second_chances',
    tier: 2,
    name: { en: 'No Second Chances', es: 'Sin segundas oportunidades' },
    rule: { en: 'Reach $930,000,000+ without rerolls', es: 'Llega a $930,000,000+ sin cambios' },
    reward: 7 * M,
    met: (f) => !f.rerollsUsed && f.total >= 930 * M,
  },
  {
    id: 'no_weak_links',
    tier: 2,
    name: { en: 'No Weak Links', es: 'Sin eslabones débiles' },
    rule: { en: 'All five worth $185,000,000+ each', es: 'Los cinco de $185,000,000+ cada uno' },
    reward: 8 * M,
    met: (f) => f.values.length === 5 && atLeast(f, 185 * M) === 5,
  },
  {
    id: 'five_franchises',
    tier: 2,
    name: { en: 'Five Franchises', es: 'Cinco franquicias' },
    rule: { en: 'Five different NBA teams, reach $950,000,000+', es: 'Cinco equipos distintos y $950,000,000+' },
    reward: 10 * M,
    met: (f) => f.teams >= 5 && f.total >= 950 * M,
  },
  {
    id: 'across_the_eras',
    tier: 2,
    name: { en: 'Across the Eras', es: 'A través de las épocas' },
    rule: { en: 'Four different eras, reach $950,000,000+', es: 'Cuatro épocas distintas y $950,000,000+' },
    reward: 10 * M,
    met: (f) => f.eras >= 4 && f.total >= 950 * M,
  },
  // Tier 3 — Extremely Difficult
  {
    id: 'superstar_duo',
    tier: 3,
    name: { en: 'Superstar Duo', es: 'Dúo de superestrellas' },
    rule: { en: 'Two players worth $200,000,000+ each', es: 'Dos jugadores de $200,000,000+ cada uno' },
    reward: 12 * M,
    met: (f) => atLeast(f, 200 * M) >= 2,
  },
  {
    id: 'triple_elite',
    tier: 3,
    name: { en: 'Triple Elite', es: 'Triple élite' },
    rule: { en: 'Three players worth $195,000,000+ each', es: 'Tres jugadores de $195,000,000+ cada uno' },
    reward: 14 * M,
    met: (f) => atLeast(f, 195 * M) >= 3,
  },
  {
    id: 'four_horsemen',
    tier: 3,
    name: { en: 'Four Horsemen', es: 'Cuatro jinetes' },
    rule: { en: 'Four players worth $190,000,000+ each', es: 'Cuatro jugadores de $190,000,000+ cada uno' },
    reward: 15 * M,
    met: (f) => atLeast(f, 190 * M) >= 4,
  },
  {
    id: 'almost_a_billion',
    tier: 3,
    name: { en: 'Almost a Billion', es: 'Casi mil millones' },
    rule: { en: 'Finish with $985,000,000+', es: 'Termina con $985,000,000+' },
    reward: 12 * M,
    met: (f) => f.total >= 985 * M,
  },
  {
    id: 'flawless_draft',
    tier: 3,
    name: { en: 'Flawless Draft', es: 'Draft impecable' },
    rule: { en: 'Reach $960,000,000+ without rerolls', es: 'Llega a $960,000,000+ sin cambios' },
    reward: 18 * M,
    met: (f) => !f.rerollsUsed && f.total >= 960 * M,
  },
  // Tier 4 — Legendary
  {
    id: 'perfect_five',
    tier: 4,
    name: { en: 'The Perfect Five', es: 'Los cinco perfectos' },
    rule: { en: 'All five worth $195,000,000+ each', es: 'Los cinco de $195,000,000+ cada uno' },
    reward: 25 * M,
    met: (f) => f.values.length === 5 && atLeast(f, 195 * M) === 5,
  },
  {
    id: 'billion_dollar_run',
    tier: 4,
    name: { en: 'Billion Dollar Run', es: 'Partida de mil millones' },
    rule: { en: 'Reach $1,000,000,000+', es: 'Llega a $1,000,000,000+' },
    reward: 25 * M,
    met: (f) => f.total >= 1_000 * M,
  },
  {
    id: 'untouchable',
    tier: 4,
    name: { en: 'Untouchable', es: 'Intocable' },
    rule: {
      en: '$975,000,000+, all primary positions, no rerolls',
      es: '$975,000,000+, todos en su posición principal, sin cambios',
    },
    reward: 30 * M,
    met: (f) => !f.rerollsUsed && f.allPrimary && f.total >= 975 * M,
  },
  {
    id: 'billion_without_mercy',
    tier: 4,
    name: { en: 'Billion Without Mercy', es: 'Mil millones sin piedad' },
    rule: { en: 'Reach $1,000,000,000+ without rerolls', es: 'Llega a $1,000,000,000+ sin cambios' },
    reward: 35 * M,
    met: (f) => !f.rerollsUsed && f.total >= 1_000 * M,
  },
  {
    id: 'goat_combination',
    tier: 4,
    name: { en: 'GOAT Combination', es: 'Combinación GOAT' },
    rule: { en: 'Draft Michael Jordan and LeBron James together', es: 'Elige a Michael Jordan y LeBron James juntos' },
    reward: 40 * M,
    met: (f) => f.slugs.includes('michael_jordan') && f.slugs.includes('lebron_james'),
  },
];

/** Chance a run is assigned a bonus from each tier (per cent); bonuses within a tier are equally likely. */
export const TIER_ODDS: Record<RunBonusTier, number> = { 1: 45, 2: 30, 3: 20, 4: 5 };

export const TIER_NAME: Record<RunBonusTier, Copy> = {
  1: { en: 'Challenging', es: 'Desafiante' },
  2: { en: 'Very Difficult', es: 'Muy difícil' },
  3: { en: 'Extremely Difficult', es: 'Extremadamente difícil' },
  4: { en: 'Legendary', es: 'Legendario' },
};

export const RUN_BONUS_BY_ID = Object.fromEntries(RUN_BONUSES.map((b) => [b.id, b])) as Record<RunBonusId, RunBonusDef>;

export function isRunBonusId(value: unknown): value is RunBonusId {
  return typeof value === 'string' && value in RUN_BONUS_BY_ID;
}

/** Tier by TIER_ODDS, then uniform within the tier. `roll` in [0, 1). */
export function pickRunBonus(roll = Math.random(), roll2 = Math.random()): RunBonusDef {
  let left = roll * 100;
  let tier: RunBonusTier = 4;
  for (const t of [1, 2, 3, 4] as const) {
    if (left < TIER_ODDS[t]) {
      tier = t;
      break;
    }
    left -= TIER_ODDS[t];
  }
  const inTier = RUN_BONUSES.filter((b) => b.tier === tier);
  return inTier[Math.min(inTier.length - 1, Math.floor(roll2 * inTier.length))]!;
}

export function playerSlugOf(playerId: string): string {
  return playerId.replace(/^hist_\d{4}s_[A-Za-z]+_/, '');
}

/** Team and decade come from the Classic player id: hist_1990s_CHI_michael_jordan. */
export function playerTeamEra(playerId: string): { team: string; era: string } | null {
  const m = /^hist_(\d{4}s)_([A-Za-z]+)_/.exec(playerId);
  return m ? { era: m[1]!, team: m[2]! } : null;
}

const COUNT_GOALS: Partial<Record<RunBonusId, { min: number; need: number }>> = {
  elite_pull: { min: 200 * M, need: 1 },
  triple_threat: { min: 185 * M, need: 3 },
  double_trouble: { min: 195 * M, need: 2 },
  no_weak_links: { min: 185 * M, need: 5 },
  superstar_duo: { min: 200 * M, need: 2 },
  triple_elite: { min: 195 * M, need: 3 },
  four_horsemen: { min: 190 * M, need: 4 },
  perfect_five: { min: 195 * M, need: 5 },
};

/**
 * Live progress while drafting, for bonuses that can be counted pick by pick
 * (players over a value, or the Jordan + LeBron pair). Null for whole-run goals.
 */
export function runBonusProgress(id: RunBonusId, seated: { playerId: string; value: number }[]): { have: number; need: number } | null {
  if (id === 'goat_combination') {
    const slugs = new Set(seated.map((s) => playerSlugOf(s.playerId)));
    return { have: Number(slugs.has('michael_jordan')) + Number(slugs.has('lebron_james')), need: 2 };
  }
  const goal = COUNT_GOALS[id];
  if (!goal) return null;
  return { have: Math.min(goal.need, seated.filter((s) => s.value >= goal.min).length), need: goal.need };
}

/** Facts from the five seated players (seat-priced values) and the run's reroll use. */
export function runBonusFacts(
  seats: { playerId: string; slot: Position; primary: Position; value: number }[],
  rerollsUsed: boolean,
): RunBonusFacts {
  const teamEras = seats.map((s) => playerTeamEra(s.playerId));
  return {
    total: seats.reduce((sum, s) => sum + s.value, 0),
    values: seats.map((s) => s.value),
    allPrimary: seats.length === 5 && seats.every((s) => s.slot === s.primary),
    teams: new Set(teamEras.map((t) => t?.team ?? '')).size,
    eras: new Set(teamEras.map((t) => t?.era ?? '')).size,
    slugs: seats.map((s) => playerSlugOf(s.playerId)),
    rerollsUsed,
  };
}
