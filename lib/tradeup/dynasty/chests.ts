/**
 * Dynasty chests — display data and the default balance values.
 *
 * The server (supabase/migrations/20261108_1_dynasty_chests.sql) is the only authority: it awards
 * progress, rolls chest tiers and rewards, and runs every timer. The rules here mirror its
 * defaults for display and for the dev preview; scripts/check-dynasty-catalog.ts keeps the
 * rarity map and weights in step with the SQL.
 *
 * Every number below is a starting value PENDING BALANCE APPROVAL, not a published drop rate.
 */

import type { ChestId } from '@/lib/tradeup/franchise/config';

export type ChestTier = 'pro' | 'all_star' | 'superstar' | 'legend' | 'goat';

export const CHEST_TIER_ORDER: ChestTier[] = ['pro', 'all_star', 'superstar', 'legend', 'goat'];

/** Chest art themes are shared with the earlier chest artwork (same ids). */
export const chestArtId = (tier: ChestTier): ChestId => tier;

export const CHEST_TIER_NAME: Record<ChestTier, { en: string; es: string }> = {
  pro: { en: 'Pro', es: 'Pro' },
  all_star: { en: 'All-Star', es: 'All-Star' },
  superstar: { en: 'Superstar', es: 'Superestrella' },
  legend: { en: 'Legend', es: 'Leyenda' },
  goat: { en: 'GOAT', es: 'GOAT' },
};

/** Green, blue, gold, purple, red. */
export const CHEST_TIER_COLOR: Record<ChestTier, string> = {
  pro: '#3cf274',
  all_star: '#4d9bff',
  superstar: '#ffc531',
  legend: '#b06bff',
  goat: '#ff4855',
};

export interface ChestRules {
  pointsPerRun: number;
  pointsBillionBonus: number;
  pointsPerChest: number;
  unlockSeconds: number;
  maxUnlocking: number;
  dupProtectionAfter: number;
}

export const DEFAULT_CHEST_RULES: ChestRules = {
  pointsPerRun: 1,
  pointsBillionBonus: 1,
  pointsPerChest: 4,
  unlockSeconds: 3 * 60 * 60,
  maxUnlocking: 1,
  dupProtectionAfter: 4,
};

/** Relative weights for the rarity of an earned chest. */
export const CHEST_EARN_WEIGHTS: Record<ChestTier, number> = { pro: 55, all_star: 25, superstar: 12, legend: 6, goat: 2 };

/** Collectible rarity (independent of Classic dollar values). */
export const PLAYER_RARITY: Record<string, ChestTier> = {
  hist_2010s_DAL_jason_kidd: 'superstar',
  hist_2010s_DAL_j_j_barea: 'pro',
  hist_2010s_DAL_shawn_marion: 'all_star',
  hist_2010s_DAL_dirk_nowitzki: 'legend',
  hist_2010s_DAL_tyson_chandler: 'all_star',
  hist_2000s_DET_chauncey_billups: 'superstar',
  hist_2000s_DET_richard_hamilton: 'all_star',
  hist_2000s_DET_tayshaun_prince: 'all_star',
  hist_2000s_DET_rasheed_wallace: 'all_star',
  hist_2000s_DET_ben_wallace: 'superstar',
  hist_2010s_MIA_mario_chalmers: 'pro',
  hist_2010s_MIA_dwyane_wade: 'legend',
  hist_2010s_MIA_mike_miller: 'pro',
  hist_2010s_MIA_lebron_james: 'goat',
  hist_2010s_MIA_chris_bosh: 'superstar',
  hist_2010s_CLE_kyrie_irving: 'legend',
  hist_2010s_CLE_j_r_smith: 'pro',
  hist_2010s_CLE_lebron_james: 'goat',
  hist_2010s_CLE_kevin_love: 'superstar',
  hist_2010s_CLE_tristan_thompson: 'all_star',
  hist_2010s_GSW_stephen_curry: 'goat',
  hist_2010s_GSW_klay_thompson: 'superstar',
  hist_2010s_GSW_kevin_durant: 'legend',
  hist_2010s_GSW_draymond_green: 'superstar',
  hist_2010s_GSW_zaza_pachulia: 'pro',
  hist_1990s_CHI_ron_harper: 'all_star',
  hist_1990s_CHI_michael_jordan: 'goat',
  hist_1990s_CHI_scottie_pippen: 'legend',
  hist_1990s_CHI_dennis_rodman: 'superstar',
  hist_1990s_CHI_luc_longley: 'pro',
};

/** chest tier → player rarity → relative weight. */
export const CHEST_REWARD_WEIGHTS: Record<ChestTier, Record<ChestTier, number>> = {
  pro: { pro: 60, all_star: 30, superstar: 9, legend: 1, goat: 0 },
  all_star: { pro: 35, all_star: 40, superstar: 20, legend: 4, goat: 1 },
  superstar: { pro: 15, all_star: 30, superstar: 35, legend: 15, goat: 5 },
  legend: { pro: 5, all_star: 15, superstar: 30, legend: 35, goat: 15 },
  goat: { pro: 0, all_star: 5, superstar: 20, legend: 40, goat: 35 },
};

export const NEW_PLAYER_BIAS = 1.5;
export const FOCUS_MULTIPLIER = 3;

/** "2:41:07" / "41:07" from milliseconds. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

/** "3 hours" style label for the free unlock length. */
export function formatDuration(seconds: number, locale: string): string {
  const hours = seconds / 3600;
  if (Number.isInteger(hours)) return locale === 'es' ? `${hours} ${hours === 1 ? 'hora' : 'horas'}` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}
