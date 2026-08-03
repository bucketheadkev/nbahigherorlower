/**
 * Global GM leaderboard — retention loop after the $1B chase.
 * Top 5 are featured rivals; a larger seeded field drives world rank.
 */

export interface LeaderboardEntry {
  id: string;
  name: string;
  value: number;
  isYou?: boolean;
}

/**
 * Five generated rivals who “played” the game.
 * Scores sit randomly between $1.1B and $1.4B (messy millions, not round).
 */
export const FEATURED_LEADERS: LeaderboardEntry[] = [
  { id: 'world-1', name: 'Kai Rivers', value: 1_384_720_000 },
  { id: 'world-2', name: 'Nova Blake', value: 1_317_450_000 },
  { id: 'world-3', name: 'Jordan Vale', value: 1_256_890_000 },
  { id: 'world-4', name: 'Remy Cole', value: 1_183_260_000 },
  { id: 'world-5', name: 'Ash Quinn', value: 1_127_640_000 },
];

export const WORLD_POOL_SIZE = 2_000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let fieldCache: number[] | null = null;

/** Descending roster values for the full world field (stable across sessions). */
function getWorldField(): number[] {
  if (fieldCache) return fieldCache;
  const rand = mulberry32(0x7a1bc0de);
  const values = FEATURED_LEADERS.map((e) => e.value);
  const floor = Math.min(...FEATURED_LEADERS.map((e) => e.value)) - 1_000_000;
  for (let i = 0; i < WORLD_POOL_SIZE - FEATURED_LEADERS.length; i += 1) {
    const skewed = Math.pow(rand(), 0.52);
    const raw = 140_000_000 + skewed * (floor - 140_000_000);
    // Messy thousands so ghosts don't look like round millstones.
    const jitter = Math.floor(rand() * 940_000);
    values.push(Math.floor(raw / 1_000_000) * 1_000_000 + jitter);
  }
  values.sort((a, b) => b - a);
  fieldCache = values;
  return values;
}

/** 1-based world rank for a team value (1 = best). */
export function getWorldRank(teamValue: number): number {
  const value = Math.max(0, Math.round(teamValue));
  if (value <= 0) return WORLD_POOL_SIZE;
  const field = getWorldField();
  let rank = 1;
  for (const v of field) {
    if (value >= v) return rank;
    rank += 1;
  }
  return WORLD_POOL_SIZE;
}

export function formatWorldRank(rank: number): string {
  return `#${rank.toLocaleString('en-US')}`;
}

/**
 * Board rows for the Leaderboard tab: featured top 5, with You spliced in
 * when the player's personal best belongs on the board.
 */
export function buildLeaderboardRows(personalBest: number): LeaderboardEntry[] {
  const youValue = Math.max(0, Math.round(personalBest));
  const rows: LeaderboardEntry[] = FEATURED_LEADERS.map((e) => ({ ...e }));

  if (youValue <= 0) {
    return rows.map((e, i) => ({ ...e, id: e.id || `row-${i}` }));
  }

  const insertAt = rows.findIndex((e) => youValue >= e.value);
  const youRow: LeaderboardEntry = {
    id: 'you',
    name: 'You',
    value: youValue,
    isYou: true,
  };

  if (insertAt === -1) {
    return rows;
  }

  rows.splice(insertAt, 0, youRow);
  return rows.slice(0, 6);
}

export function sumTopPlayerValues(
  values: number[],
  count: number,
): number {
  return [...values]
    .map((v) => Math.max(0, Math.round(v)))
    .sort((a, b) => b - a)
    .slice(0, Math.max(0, count))
    .reduce((sum, v) => sum + v, 0);
}
