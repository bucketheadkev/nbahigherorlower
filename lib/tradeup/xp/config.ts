/**
 * Central XP / leveling / coin rewards for Classic runs.
 * Tune values here — award logic reads only from this module.
 */

import { BILLION_GOAL } from '../billionDollar';

/** Flat XP for finishing a Classic board (not abandoned mid-run). */
export const XP_COMPLETED_RUN = 50;

/** Extra XP scaled by roster value / $1B, clamped to this max. */
export const XP_PERFORMANCE_BONUS_MAX = 100;

/** Extra XP when the roster clears $1B. */
export const XP_BILLION_BONUS = 100;

/**
 * @deprecated Coins are flat awards now (see COINS_*). Kept so older callers/tests compile.
 * Prefer COINS_COMPLETED_RUN / COINS_BILLION_BONUS / COINS_LEVEL_UP.
 */
export const XP_PER_COIN = 10;

/** Coins for finishing any Classic run. */
export const COINS_COMPLETED_RUN = 20;

/** Extra coins when the roster clears $1B. */
export const COINS_BILLION_BONUS = 30;

/** Coins granted once per level gained from a Classic award. */
export const COINS_LEVEL_UP = 50;

/** One-time new-player welcome gift. */
export const COINS_WELCOME = 200;

/** Coin price for each perk activation and each paid Team/Era reroll. */
export const COINS_PERK_COST = 100;
export const COINS_REROLL_COST = 100;

/**
 * Shared Classic boost budget: every Team/Era reroll and every perk activation
 * draws from the same pool of three (first Team + first Era still free within it).
 */
export const MAX_BOOSTS_PER_RUN = 3;

/** @deprecated Prefer MAX_BOOSTS_PER_RUN — perks share the same pool as rerolls. */
export const MAX_PERK_ACTIVATIONS_PER_RUN = MAX_BOOSTS_PER_RUN;

/** @deprecated Prefer MAX_BOOSTS_PER_RUN — rerolls share the same pool as perks. */
export const MAX_REROLLS_PER_RUN = MAX_BOOSTS_PER_RUN;

/** Players start at level 1. */
export const XP_STARTING_LEVEL = 1;

/**
 * XP required to advance from `level` → `level + 1`.
 * Curves gently upward so early levels feel quick and later ones grind.
 */
export function xpToAdvance(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return Math.round(100 * Math.pow(1.18, safe - 1));
}

/** Performance bonus XP for a finished Classic roster value. */
export function performanceBonusXp(teamValue: number): number {
  if (!Number.isFinite(teamValue) || teamValue <= 0) return 0;
  const ratio = Math.min(1, teamValue / BILLION_GOAL);
  return Math.round(ratio * XP_PERFORMANCE_BONUS_MAX);
}

export interface ClassicXpBreakdown {
  completed: number;
  performance: number;
  billion: number;
  total: number;
  coins: number;
}

/** Pure XP + base coin math for one completed Classic run (level-up coins applied in award). */
export function calculateClassicRunRewards(teamValue: number): ClassicXpBreakdown {
  const completed = XP_COMPLETED_RUN;
  const performance = performanceBonusXp(teamValue);
  const billion = teamValue >= BILLION_GOAL ? XP_BILLION_BONUS : 0;
  const total = completed + performance + billion;
  const coins =
    COINS_COMPLETED_RUN + (teamValue >= BILLION_GOAL ? COINS_BILLION_BONUS : 0);
  return { completed, performance, billion, total, coins };
}

export interface LevelProgress {
  level: number;
  /** XP already banked toward the next level. */
  xpIntoLevel: number;
  /** XP needed to leave the current level. */
  xpForNext: number;
  /** Lifetime XP. */
  totalXp: number;
  /** 0–1 fill for the current level segment. */
  fill: number;
}

/** Derive level progress from lifetime XP. */
export function progressFromTotalXp(totalXp: number): LevelProgress {
  const safeTotal = Math.max(0, Math.floor(totalXp));
  let level = XP_STARTING_LEVEL;
  let remaining = safeTotal;
  // Hard cap to avoid pathological loops on corrupt data.
  for (let i = 0; i < 10_000; i += 1) {
    const need = xpToAdvance(level);
    if (remaining < need) {
      return {
        level,
        xpIntoLevel: remaining,
        xpForNext: need,
        totalXp: safeTotal,
        fill: need > 0 ? remaining / need : 0,
      };
    }
    remaining -= need;
    level += 1;
  }
  const need = xpToAdvance(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForNext: need,
    totalXp: safeTotal,
    fill: need > 0 ? Math.min(1, remaining / need) : 1,
  };
}
