/** Centralized trophy / rank configuration — adjust thresholds here only. */

export const TROPHY_WIN_REWARD = 50;
export const TROPHY_LOSS_PENALTY = 35;
/** Extra trophies for a perfect 5–0 sweep (on top of the win reward). */
export const TROPHY_SWEEP_BONUS = 50;

export type RankId =
  | 'iron'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'ace';

export interface RankDefinition {
  id: RankId;
  name: string;
  /** Inclusive lower bound of trophies for this rank. */
  minTrophies: number;
  /** Inclusive upper bound, or null for the top rank (no ceiling). */
  maxTrophies: number | null;
  /** Short label for compact UI / aria. */
  emblem: string;
}

/**
 * Balancing targets across many matches — not forced per-game outcomes.
 * Opponent generation aims near these rates for typical lineups.
 */
export const RANK_TARGET_WIN_RATE: Record<RankId, number> = {
  iron: 0.7,
  bronze: 0.65,
  silver: 0.6,
  gold: 0.55,
  platinum: 0.5,
  diamond: 0.45,
  ace: 0.4,
};

/**
 * Rank-scaled opponent generation knobs.
 * powerOffset: positive = weaker opponents (higher user win rate).
 */
export interface RankDifficultyConfig {
  /** Typical lineupScore gap favoring the user (positive → easier). */
  powerOffset: number;
  /** Random swing added to the target power each match. */
  powerVariance: number;
  /** Chance a slot biases toward elite (A/S) talent. */
  eliteBiasChance: number;
  /** Chance to force one obviously weak position. */
  weakSpotChance: number;
  /** Extra per-slot strength noise (higher = more unbalanced lineups). */
  slotNoise: number;
  /** Soft floor/ceiling for opponent slot strength targets. */
  strengthFloor: number;
  strengthCeiling: number;
}

export const RANK_DIFFICULTY: Record<RankId, RankDifficultyConfig> = {
  iron: {
    powerOffset: 4.5,
    powerVariance: 3.5,
    eliteBiasChance: 0.04,
    weakSpotChance: 0.48,
    slotNoise: 5.5,
    strengthFloor: 42,
    strengthCeiling: 84,
  },
  bronze: {
    powerOffset: 3.6,
    powerVariance: 3.4,
    eliteBiasChance: 0.08,
    weakSpotChance: 0.38,
    slotNoise: 4.8,
    strengthFloor: 45,
    strengthCeiling: 86,
  },
  silver: {
    powerOffset: 2.6,
    powerVariance: 3.3,
    eliteBiasChance: 0.12,
    weakSpotChance: 0.28,
    slotNoise: 4.0,
    strengthFloor: 48,
    strengthCeiling: 89,
  },
  gold: {
    powerOffset: 1.4,
    powerVariance: 3.1,
    eliteBiasChance: 0.17,
    weakSpotChance: 0.18,
    slotNoise: 3.2,
    strengthFloor: 52,
    strengthCeiling: 91,
  },
  platinum: {
    powerOffset: 0.3,
    powerVariance: 2.9,
    eliteBiasChance: 0.22,
    weakSpotChance: 0.12,
    slotNoise: 2.5,
    strengthFloor: 55,
    strengthCeiling: 93,
  },
  diamond: {
    powerOffset: -1.0,
    powerVariance: 2.8,
    eliteBiasChance: 0.26,
    weakSpotChance: 0.07,
    slotNoise: 2.1,
    strengthFloor: 57,
    strengthCeiling: 95,
  },
  ace: {
    powerOffset: -1.8,
    powerVariance: 2.7,
    eliteBiasChance: 0.3,
    weakSpotChance: 0.04,
    slotNoise: 1.7,
    strengthFloor: 59,
    strengthCeiling: 96,
  },
};

/**
 * Ordered lowest → highest. Rank is derived only from current trophy balance.
 * Promote / demote automatically when balance crosses a threshold.
 */
export const RANK_LADDER: readonly RankDefinition[] = [
  { id: 'iron', name: 'Iron', minTrophies: 0, maxTrophies: 249, emblem: 'IR' },
  { id: 'bronze', name: 'Bronze', minTrophies: 250, maxTrophies: 599, emblem: 'BR' },
  { id: 'silver', name: 'Silver', minTrophies: 600, maxTrophies: 1099, emblem: 'SV' },
  { id: 'gold', name: 'Gold', minTrophies: 1100, maxTrophies: 1799, emblem: 'GD' },
  { id: 'platinum', name: 'Platinum', minTrophies: 1800, maxTrophies: 2799, emblem: 'PL' },
  { id: 'diamond', name: 'Diamond', minTrophies: 2800, maxTrophies: 4199, emblem: 'DM' },
  { id: 'ace', name: 'Ace', minTrophies: 4200, maxTrophies: null, emblem: 'A' },
] as const;

/** Legacy rank IDs from the previous GM ladder — map into the metal ladder. */
const LEGACY_RANK_MAP: Record<string, RankId> = {
  rookie_gm: 'iron',
  scout: 'bronze',
  general_manager: 'silver',
  executive: 'gold',
  championship_architect: 'platinum',
  dynasty_builder: 'ace',
};

export interface RankProgress {
  rank: RankDefinition;
  trophies: number;
  /** Next rank, or null at Ace. */
  nextRank: RankDefinition | null;
  /** Progress 0–1 within the current rank band toward the next threshold. */
  progress: number;
  /** Trophies needed to reach the next rank (0 at max). */
  trophiesToNext: number;
  isMaxRank: boolean;
}

export function isRankId(value: unknown): value is RankId {
  return (
    value === 'iron' ||
    value === 'bronze' ||
    value === 'silver' ||
    value === 'gold' ||
    value === 'platinum' ||
    value === 'diamond' ||
    value === 'ace'
  );
}

/** Accept current or legacy stored rank ids. */
export function coerceRankId(value: unknown): RankId | null {
  if (isRankId(value)) return value;
  if (typeof value === 'string' && value in LEGACY_RANK_MAP) {
    return LEGACY_RANK_MAP[value]!;
  }
  return null;
}

export function getRankForTrophies(trophies: number): RankDefinition {
  const safe = Math.max(0, Math.floor(trophies));
  for (let i = RANK_LADDER.length - 1; i >= 0; i -= 1) {
    const rank = RANK_LADDER[i]!;
    if (safe >= rank.minTrophies) return rank;
  }
  return RANK_LADDER[0]!;
}

export function getRankIndex(rankId: RankId): number {
  return RANK_LADDER.findIndex((rank) => rank.id === rankId);
}

export function getRankProgress(trophies: number): RankProgress {
  const safe = Math.max(0, Math.floor(trophies));
  const rank = getRankForTrophies(safe);
  const index = getRankIndex(rank.id);
  const nextRank = index >= 0 && index < RANK_LADDER.length - 1 ? RANK_LADDER[index + 1]! : null;
  const isMaxRank = nextRank === null;

  if (isMaxRank || !nextRank) {
    return {
      rank,
      trophies: safe,
      nextRank: null,
      progress: 1,
      trophiesToNext: 0,
      isMaxRank: true,
    };
  }

  const span = Math.max(1, nextRank.minTrophies - rank.minTrophies);
  const intoBand = safe - rank.minTrophies;
  const progress = Math.min(1, Math.max(0, intoBand / span));
  const trophiesToNext = Math.max(0, nextRank.minTrophies - safe);

  return {
    rank,
    trophies: safe,
    nextRank,
    progress,
    trophiesToNext,
    isMaxRank: false,
  };
}

export function clampTrophies(value: number): number {
  return Math.max(0, Math.floor(value));
}

export function getRankDifficulty(rankId: RankId): RankDifficultyConfig {
  return RANK_DIFFICULTY[rankId] ?? RANK_DIFFICULTY.iron;
}
