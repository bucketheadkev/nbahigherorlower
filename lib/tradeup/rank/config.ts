/**
 * My Rank — the single source of truth for rank names, colors and Bank thresholds.
 *
 * Rank is set by the most Cash a player has ever had in their Bank (their peak balance), so
 * spending — buying a franchise, entering a Cash Cup — never lowers it. GOAT starts at
 * $1,000,000,000, the same line as the Wall of Fame.
 *
 * Reaching a rank pays its reward once, ever (server: public.rank_up_rewards). Each reward is
 * smaller than the gap to the next rank, so a reward never lifts a player into another rank.
 */

export type RankId = 'rookie' | 'pro' | 'allstar' | 'superstar' | 'legend' | 'goat';

export interface RankDef {
  id: RankId;
  level: number;
  name: { en: string; es: string };
  /** Peak Bank balance needed to reach this rank. */
  minBank: number;
  color: string;
  /** Darker shade of the rank color, for gradients and depth. */
  deep: string;
  /** One-time Bank Cash for reaching this rank. */
  reward: number;
}

export const RANKS: readonly RankDef[] = [
  { id: 'rookie', level: 1, name: { en: 'Rookie', es: 'Novato' }, minBank: 0, color: '#a7b0bb', deep: '#3d444d', reward: 0 },
  { id: 'pro', level: 2, name: { en: 'Pro', es: 'Pro' }, minBank: 1_000_000, color: '#c08552', deep: '#4a2a14', reward: 5_000_000 },
  { id: 'allstar', level: 3, name: { en: 'All-Star', es: 'All-Star' }, minBank: 10_000_000, color: '#2fe08f', deep: '#0a4d2f', reward: 10_000_000 },
  { id: 'superstar', level: 4, name: { en: 'Superstar', es: 'Superestrella' }, minBank: 50_000_000, color: '#3d8bff', deep: '#0f2f6e', reward: 20_000_000 },
  { id: 'legend', level: 5, name: { en: 'Legend', es: 'Leyenda' }, minBank: 250_000_000, color: '#a95cff', deep: '#3a1270', reward: 30_000_000 },
  { id: 'goat', level: 6, name: { en: 'GOAT', es: 'GOAT' }, minBank: 1_000_000_000, color: '#ff3344', deep: '#5e0710', reward: 40_000_000 },
] as const;

export function rankForBank(peak: number): RankDef {
  let current = RANKS[0]!;
  for (const def of RANKS) if (peak >= def.minBank) current = def;
  return current;
}

export function nextRank(def: RankDef): RankDef | null {
  return RANKS.find((r) => r.level === def.level + 1) ?? null;
}

export function rankName(def: RankDef, locale: string): string {
  return locale === 'es' ? def.name.es : def.name.en;
}
