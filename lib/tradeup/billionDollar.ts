/**
 * Billion-dollar Trade Up economy — team value, eras, and trade outcomes.
 */

import { ALL_PLAYERS } from './rosters';
import { TEAMS } from './teams';
import { getPlayerTier, type PlayerTier } from './tiers';
import { LINEUP_POSITIONS } from './startingLineup';
import { getMatchedNeeds, NEED_LABELS, type TeamNeedId } from './strengths';
import { getPrimaryTeamNeeds } from './teamNeeds';
import {
  DECADE_ERAS,
  decadePlayerToTradePlayer,
  getDecadeRoster,
  resolveValidTeamEra,
  teamsForEra,
  type DecadeEra,
} from './decadeRosters';
import type { TradePlayer, TeamInfo, Position } from './types';

export type { DecadeEra } from './decadeRosters';

export const BILLION_GOAL = 1_000_000_000;
export const MAX_DENIALS = 3;

export type PackKind =
  | 'starter'
  | 'contender'
  | 'allstar'
  | 'premium'
  | 'deluxe'
  | 'dynasty';

export interface PackDefinition {
  kind: PackKind;
  title: string;
  subtitle: string;
  estimatedValue: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

/** Catalog of openable packs shown on the post-Play select screen. */
export const PACK_CATALOG: Record<PackKind, PackDefinition> = {
  starter: {
    kind: 'starter',
    title: 'Starter Pack',
    subtitle: 'Build the foundation',
    estimatedValue: 20_000_000,
    rarity: 'common',
  },
  contender: {
    kind: 'contender',
    title: 'Contender Pack',
    subtitle: 'Ready for the climb',
    estimatedValue: 40_000_000,
    rarity: 'uncommon',
  },
  allstar: {
    kind: 'allstar',
    title: 'All-Star Pack',
    subtitle: 'Weekend energy',
    estimatedValue: 60_000_000,
    rarity: 'uncommon',
  },
  premium: {
    kind: 'premium',
    title: 'Premium Pack',
    subtitle: 'Front-office heat',
    estimatedValue: 80_000_000,
    rarity: 'rare',
  },
  deluxe: {
    kind: 'deluxe',
    title: 'Deluxe Pack',
    subtitle: 'Franchise firepower',
    estimatedValue: 200_000_000,
    rarity: 'epic',
  },
  dynasty: {
    kind: 'dynasty',
    title: 'Dynasty Pack',
    subtitle: 'Once-in-a-lifetime pull',
    estimatedValue: 500_000_000,
    rarity: 'legendary',
  },
};

/** @deprecated Prefer PACK_CATALOG — kept for quick value lookups. */
export const PACK_VALUES = {
  starter: PACK_CATALOG.starter.estimatedValue,
  contender: PACK_CATALOG.contender.estimatedValue,
  allstar: PACK_CATALOG.allstar.estimatedValue,
  premium: PACK_CATALOG.premium.estimatedValue,
  deluxe: PACK_CATALOG.deluxe.estimatedValue,
  dynasty: PACK_CATALOG.dynasty.estimatedValue,
} as const;

const DYNASTY_APPEAR_CHANCE = 0.02;

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

/**
 * Four unique packs for the select screen.
 * Always includes Starter; Dynasty appears in ~2% of deals.
 */
export function generatePackChoices(): PackDefinition[] {
  const picks: PackKind[] = ['starter'];
  const pool: PackKind[] = shuffle([
    'contender',
    'allstar',
    'premium',
    'deluxe',
  ] as PackKind[]);

  if (Math.random() < DYNASTY_APPEAR_CHANCE) {
    picks.push('dynasty');
  }

  for (const kind of pool) {
    if (picks.length >= 4) break;
    picks.push(kind);
  }

  while (picks.length < 4) {
    const fallback = pool.find((k) => !picks.includes(k));
    if (!fallback) break;
    picks.push(fallback);
  }

  return shuffle(picks).map((kind) => PACK_CATALOG[kind]);
}

/** Soft ceiling so huge DBs stay usable; typical team×era boards are ~20–80. */
export const MAX_ERA_BOARD_SIZE = 100;

/** Hard ceiling — high GOAT max ($225M). */
export const MAX_PLAYER_DOLLARS = 225_000_000;

/** Off-primary lineup slot — ~6% haircut (within the 5–7% design band). */
export const OFF_PRIMARY_SLOT_VALUE_FACTOR = 0.94;

export type DollarBand = {
  minTv: number;
  maxTv: number;
  minDollars: number;
  maxDollars: number;
};

/**
 * Per-tier dollar envelopes. S / GOAT prices resolve through tighter sub-bands
 * in {@link resolveDollarBand} so low/mid/high stars don't all land at one price.
 */
export const TIER_DOLLAR_BANDS: Record<PlayerTier, DollarBand> = {
  F: { minTv: 0, maxTv: 27, minDollars: 3_000_000, maxDollars: 12_000_000 },
  D: { minTv: 28, maxTv: 44, minDollars: 13_000_000, maxDollars: 28_000_000 },
  C: { minTv: 45, maxTv: 61, minDollars: 29_000_000, maxDollars: 72_000_000 },
  B: { minTv: 62, maxTv: 77, minDollars: 65_000_000, maxDollars: 110_000_000 },
  /** Caps below low S so the A→S jump still hits. */
  A: { minTv: 78, maxTv: 91, minDollars: 112_000_000, maxDollars: 165_000_000 },
  S: { minTv: 92, maxTv: 96, minDollars: 180_000_000, maxDollars: 200_000_000 },
  GOAT: { minTv: 97, maxTv: 99, minDollars: 200_000_000, maxDollars: 225_000_000 },
};

/**
 * Low / mid / high S — close but not identical prices within each pocket.
 * TV 92–93 · 94 · 95–96
 */
export const S_SUB_BANDS: DollarBand[] = [
  { minTv: 92, maxTv: 93, minDollars: 180_000_000, maxDollars: 186_000_000 },
  { minTv: 94, maxTv: 94, minDollars: 187_000_000, maxDollars: 192_000_000 },
  { minTv: 95, maxTv: 96, minDollars: 193_000_000, maxDollars: 200_000_000 },
];

/**
 * Low / mid / high GOAT.
 * TV 97 · 98 · 99
 */
export const GOAT_SUB_BANDS: DollarBand[] = [
  { minTv: 97, maxTv: 97, minDollars: 200_000_000, maxDollars: 208_000_000 },
  { minTv: 98, maxTv: 98, minDollars: 209_000_000, maxDollars: 216_000_000 },
  { minTv: 99, maxTv: 99, minDollars: 217_000_000, maxDollars: 225_000_000 },
];

/** Midpoint fallback for display / legacy callers. */
export const TIER_DOLLAR_VALUE: Record<PlayerTier, number> = {
  F: 7_500_000,
  D: 20_000_000,
  C: 50_000_000,
  B: 87_000_000,
  A: 138_000_000,
  S: 190_000_000,
  GOAT: 225_000_000,
};

export const ERAS: DecadeEra[] = [...DECADE_ERAS];

/** Legacy scale — only used if historical stats are unavailable. */
const ERA_STAT_SCALE: Record<
  DecadeEra,
  { ppg: number; rpg: number; apg: number }
> = {
  '1960s': { ppg: 0.78, rpg: 1.18, apg: 0.85 },
  '1970s': { ppg: 0.82, rpg: 1.12, apg: 0.88 },
  '1980s': { ppg: 0.94, rpg: 1.05, apg: 0.96 },
  '1990s': { ppg: 0.9, rpg: 1.02, apg: 0.98 },
  '2000s': { ppg: 0.95, rpg: 0.98, apg: 1.0 },
  '2010s': { ppg: 1.02, rpg: 0.96, apg: 1.05 },
  '2020s': { ppg: 1.08, rpg: 0.94, apg: 1.1 },
};

export interface ValuedPlayer extends TradePlayer {
  dollarValue: number;
}

export interface EraOfferPlayer extends ValuedPlayer {
  eraStats: { ppg: number; rpg: number; apg: number };
  /** Decade roster this offer was drawn from (all-era boards). */
  sourceEra?: DecadeEra;
}

/** Round to the nearest million for clean market prices (e.g. $255M, not odd cents). */
function toCleanMillions(value: number): number {
  return Math.max(1_000_000, Math.round(value / 1_000_000) * 1_000_000);
}

function pickSubBand(tv: number, bands: DollarBand[]): DollarBand | null {
  for (const band of bands) {
    if (tv >= band.minTv && tv <= band.maxTv) return band;
  }
  return null;
}

/**
 * Hand-tuned Classic dollar pockets for specific decade cards.
 * Key: `${era}|${teamId}|${exact player name}` (same shape as TV overrides).
 * Looked up from hist_* player ids so buildEraRoster pricing stays exact.
 */
const DECADE_DOLLAR_BAND_OVERRIDES: Record<
  string,
  { minDollars: number; maxDollars: number }
> = {
  '1960s|BOS|Bill Russell': { minDollars: 190_000_000, maxDollars: 199_000_000 },

  // 1960s / 1970s — Wilt + Jerry West Lakers
  '1960s|GSW|Wilt Chamberlain': { minDollars: 210_000_000, maxDollars: 210_000_000 },
  '1960s|PHI|Wilt Chamberlain': { minDollars: 205_000_000, maxDollars: 205_000_000 },
  '1960s|LAL|Wilt Chamberlain': { minDollars: 203_000_000, maxDollars: 203_000_000 },
  '1970s|LAL|Wilt Chamberlain': { minDollars: 203_000_000, maxDollars: 203_000_000 },
  '1960s|LAL|Jerry West': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '1970s|LAL|Jerry West': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '1960s|SAC|Oscar Robertson': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '1970s|MIL|Oscar Robertson': { minDollars: 205_000_000, maxDollars: 205_000_000 },
  '1970s|SAC|Oscar Robertson': { minDollars: 205_000_000, maxDollars: 205_000_000 },
  '1970s|MIL|Kareem Abdul-Jabbar': { minDollars: 201_000_000, maxDollars: 201_000_000 },

  // 2020s — hand-tuned Classic market prices (fixed bands)
  '2020s|BKN|Kevin Durant': { minDollars: 202_000_000, maxDollars: 202_000_000 },
  '2020s|HOU|Kevin Durant': { minDollars: 202_000_000, maxDollars: 202_000_000 },
  '2020s|PHX|Kevin Durant': { minDollars: 202_000_000, maxDollars: 202_000_000 },
  '2020s|MIN|Anthony Edwards': { minDollars: 199_000_000, maxDollars: 199_000_000 },
  '2020s|NYK|Jalen Brunson': { minDollars: 199_000_000, maxDollars: 199_000_000 },
  '2020s|DAL|Jalen Brunson': { minDollars: 199_000_000, maxDollars: 199_000_000 },
  '2020s|DET|Jalen Brunson': { minDollars: 199_000_000, maxDollars: 199_000_000 },
  // Kyrie: $198M on both Dallas and Brooklyn (clarifies dual-franchise pricing)
  '2020s|BKN|Kyrie Irving': { minDollars: 198_000_000, maxDollars: 198_000_000 },
  '2020s|DAL|Kyrie Irving': { minDollars: 198_000_000, maxDollars: 198_000_000 },
  '2020s|DAL|Anthony Davis': { minDollars: 200_000_000, maxDollars: 200_000_000 },
  '2020s|LAL|Anthony Davis': { minDollars: 200_000_000, maxDollars: 200_000_000 },
  '2020s|DET|Cade Cunningham': { minDollars: 199_000_000, maxDollars: 199_000_000 },
  '2020s|CHA|LaMelo Ball': { minDollars: 189_000_000, maxDollars: 189_000_000 },
  '2020s|BOS|Jaylen Brown': { minDollars: 196_000_000, maxDollars: 196_000_000 },
  '2020s|PHI|Jaylen Brown': { minDollars: 196_000_000, maxDollars: 196_000_000 },
  '2020s|TOR|Scottie Barnes': { minDollars: 183_000_000, maxDollars: 183_000_000 },
  '2020s|IND|Pascal Siakam': { minDollars: 181_000_000, maxDollars: 181_000_000 },
  '2020s|TOR|Pascal Siakam': { minDollars: 181_000_000, maxDollars: 181_000_000 },
  '2020s|PHI|Tyrese Maxey': { minDollars: 194_000_000, maxDollars: 194_000_000 },
  '2020s|LAC|Kawhi Leonard': { minDollars: 199_000_000, maxDollars: 199_000_000 },
  '2020s|SAS|Kawhi Leonard': { minDollars: 199_000_000, maxDollars: 199_000_000 },
  '2020s|DEN|Nikola Jokić': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '2020s|PHI|LeBron James': { minDollars: 194_000_000, maxDollars: 194_000_000 },
  '2020s|LAL|LeBron James': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '2020s|GSW|Stephen Curry': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '2020s|MIL|Giannis Antetokounmpo': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '2020s|SAS|Victor Wembanyama': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '2020s|PHI|Joel Embiid': { minDollars: 201_000_000, maxDollars: 201_000_000 },
  '2020s|LAL|Luka Dončić': { minDollars: 202_000_000, maxDollars: 202_000_000 },
  '2020s|DAL|Luka Dončić': { minDollars: 203_000_000, maxDollars: 203_000_000 },
  '2020s|OKC|Shai Gilgeous-Alexander': { minDollars: 202_000_000, maxDollars: 202_000_000 },

  // 2010s — hand-tuned Classic market prices (fixed bands)
  '2010s|CLE|LeBron James': { minDollars: 205_000_000, maxDollars: 205_000_000 },
  '2010s|MIA|LeBron James': { minDollars: 205_000_000, maxDollars: 205_000_000 },
  '2010s|LAL|LeBron James': { minDollars: 205_000_000, maxDollars: 205_000_000 },
  '2010s|GSW|Kevin Durant': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '2010s|OKC|Kevin Durant': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '2010s|GSW|Stephen Curry': { minDollars: 202_000_000, maxDollars: 202_000_000 },
  '2010s|HOU|James Harden': { minDollars: 209_000_000, maxDollars: 209_000_000 },
  '2010s|TOR|Kawhi Leonard': { minDollars: 202_000_000, maxDollars: 202_000_000 },
  '2010s|SAS|Kawhi Leonard': { minDollars: 202_000_000, maxDollars: 202_000_000 },
  '2010s|OKC|Russell Westbrook': { minDollars: 199_000_000, maxDollars: 199_000_000 },
  '2010s|NOP|Anthony Davis': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '2010s|LAL|Anthony Davis': { minDollars: 200_000_000, maxDollars: 200_000_000 },
  '2010s|POR|Damian Lillard': { minDollars: 199_000_000, maxDollars: 199_000_000 },
  '2010s|MIA|Dwyane Wade': { minDollars: 199_000_000, maxDollars: 199_000_000 },
  '2010s|MIA|Chris Bosh': { minDollars: 193_000_000, maxDollars: 193_000_000 },
  '2010s|LAL|Kobe Bryant': { minDollars: 202_000_000, maxDollars: 202_000_000 },
  '2010s|BOS|Kyrie Irving': { minDollars: 199_000_000, maxDollars: 199_000_000 },
  '2010s|PHX|Devin Booker': { minDollars: 199_000_000, maxDollars: 199_000_000 },
  '2010s|CLE|Kyrie Irving': { minDollars: 206_000_000, maxDollars: 206_000_000 },
  '2010s|NOP|Chris Paul': { minDollars: 197_000_000, maxDollars: 197_000_000 },
  '2010s|MIL|Giannis Antetokounmpo': { minDollars: 203_000_000, maxDollars: 203_000_000 },
  '2010s|HOU|Chris Paul': { minDollars: 189_000_000, maxDollars: 189_000_000 },
  '2010s|LAC|Chris Paul': { minDollars: 189_000_000, maxDollars: 189_000_000 },
  '2010s|DAL|Dirk Nowitzki': { minDollars: 198_000_000, maxDollars: 198_000_000 },
  '2010s|PHX|Steve Nash': { minDollars: 190_000_000, maxDollars: 190_000_000 },

  // 2000s — hand-tuned Classic market prices (fixed bands)
  '2000s|MIA|Dwyane Wade': { minDollars: 205_000_000, maxDollars: 205_000_000 },
  '2000s|HOU|Tracy McGrady': { minDollars: 198_000_000, maxDollars: 198_000_000 },
  '2000s|ORL|Tracy McGrady': { minDollars: 198_000_000, maxDollars: 198_000_000 },
  '2000s|DAL|Dirk Nowitzki': { minDollars: 200_000_000, maxDollars: 200_000_000 },
  '2000s|OKC|Kevin Durant': { minDollars: 196_000_000, maxDollars: 196_000_000 },
  '2000s|SAS|Tim Duncan': { minDollars: 206_000_000, maxDollars: 206_000_000 },
  '2000s|WAS|Michael Jordan': { minDollars: 190_000_000, maxDollars: 190_000_000 },
  '2000s|TOR|Chris Bosh': { minDollars: 185_000_000, maxDollars: 185_000_000 },
  '2000s|ORL|J.J. Redick': { minDollars: 110_000_000, maxDollars: 110_000_000 },
  '2000s|CLE|LeBron James': { minDollars: 205_000_000, maxDollars: 205_000_000 },
  '2000s|LAL|Kobe Bryant': { minDollars: 203_000_000, maxDollars: 203_000_000 },
  '2000s|LAL|Shaquille O\'Neal': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '2000s|MIA|Shaquille O\'Neal': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '2000s|CLE|Shaquille O\'Neal': { minDollars: 208_000_000, maxDollars: 208_000_000 },
  '2000s|PHX|Shaquille O\'Neal': { minDollars: 200_000_000, maxDollars: 200_000_000 },

  // 1990s — hand-tuned Classic market prices (fixed bands)
  '1990s|CHI|Michael Jordan': { minDollars: 205_000_000, maxDollars: 205_000_000 },
  '1990s|LAL|Shaquille O\'Neal': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '1990s|ORL|Shaquille O\'Neal': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '1990s|HOU|Hakeem Olajuwon': { minDollars: 203_000_000, maxDollars: 203_000_000 },
  '1990s|SAS|Tim Duncan': { minDollars: 192_000_000, maxDollars: 192_000_000 },
  '1990s|SAS|David Robinson': { minDollars: 204_000_000, maxDollars: 204_000_000 },

  // 1980s — hand-tuned Classic market prices (fixed bands)
  '1980s|CHI|Michael Jordan': { minDollars: 205_000_000, maxDollars: 205_000_000 },
  '1980s|BOS|Larry Bird': { minDollars: 204_000_000, maxDollars: 204_000_000 },
  '1980s|LAL|Magic Johnson': { minDollars: 204_000_000, maxDollars: 204_000_000 },
};

/** Every LeBron card — Lakers late-career band; all other stints stay elite ($201M+). */
function lebronDollarBand(
  player: TradePlayer,
): { minDollars: number; maxDollars: number } | null {
  if (player.name.trim() !== 'LeBron James') return null;
  if (player.teamId === 'LAL') {
    return { minDollars: 200_000_000, maxDollars: 205_000_000 };
  }
  return { minDollars: 201_000_000, maxDollars: 225_000_000 };
}

function customDollarBand(
  player: TradePlayer,
): { minDollars: number; maxDollars: number } | null {
  const overrideKey = decadeDollarOverrideKey(player);
  if (overrideKey != null) {
    const decade = DECADE_DOLLAR_BAND_OVERRIDES[overrideKey];
    if (decade) return decade;
  }
  return lebronDollarBand(player);
}

/**
 * Stable identity for a player/team/era card.
 * Uses the historical id (era + team) plus the authored name — not the name alone.
 */
export function playerVersionKey(player: TradePlayer): string | null {
  const match = /^hist_(\d{4}s)_([A-Z]{2,3})_/.exec(player.id);
  if (!match) return null;
  return `${match[1]}|${match[2]}|${player.name.trim()}`;
}

/** Parse `hist_{era}_{teamId}_{slug}` → override key using the live player name. */
function decadeDollarOverrideKey(player: TradePlayer): string | null {
  return playerVersionKey(player);
}

/**
 * Deterministic 0.988–1.012 factor from the player id.
 * Same version always lands on the same million; different eras do not share a key.
 */
export function stablePriceJitter(playerId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < playerId.length; i += 1) {
    hash ^= playerId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unit = (hash >>> 0) / 0xffffffff;
  return 0.988 + unit * 0.024;
}

/** Resolve the pricing pocket for a player (S/GOAT use low/mid/high sub-bands). */
export function resolveDollarBand(player: TradePlayer): DollarBand {
  const custom = customDollarBand(player);
  if (custom) {
    const tv = player.tradeValue;
    return {
      minTv: tv,
      maxTv: tv,
      minDollars: custom.minDollars,
      maxDollars: custom.maxDollars,
    };
  }

  const tier = getPlayerTier(player);
  const tv = player.tradeValue;
  if (tier === 'S') {
    return pickSubBand(tv, S_SUB_BANDS) ?? TIER_DOLLAR_BANDS.S;
  }
  if (tier === 'GOAT') {
    return pickSubBand(tv, GOAT_SUB_BANDS) ?? TIER_DOLLAR_BANDS.GOAT;
  }
  return TIER_DOLLAR_BANDS[tier];
}

function bandProgress(player: TradePlayer, band: DollarBand): number {
  const span = Math.max(1, band.maxTv - band.minTv);
  const t = Math.min(1, Math.max(0, (player.tradeValue - band.minTv) / span));
  // Single-TV pockets (mid S, each GOAT step) still need interior variation from stats.
  if (band.minTv === band.maxTv) return 0.5;
  return t * t * (3 - 2 * t);
}

/**
 * Single production index from box averages.
 * Scoring leads price; boards + dimes pull all-around stars up the curve.
 */
export function boxProductionIndex(stats: {
  ppg: number;
  rpg: number;
  apg: number;
  bpg?: number;
}): number {
  const ppg = Math.max(0, stats.ppg || 0);
  const rpg = Math.max(0, stats.rpg || 0);
  const apg = Math.max(0, stats.apg || 0);
  const bpg = Math.max(0, stats.bpg || 0);
  return ppg * 1.15 + rpg * 0.5 + apg * 0.7 + bpg * 0.95;
}

/**
 * Map production → dollars (soft guide). Tier / sub-bands are the source of truth
 * in {@link rollDollarValue}; this keeps relative production ordering sensible.
 */
export function dollarsFromBoxStats(stats: {
  ppg: number;
  rpg: number;
  apg: number;
  bpg?: number;
}): number {
  const idx = boxProductionIndex(stats);
  /** [production index, dollars] — aligned to F→GOAT economy. */
  const anchors: Array<[number, number]> = [
    [8, 6_500_000], // F
    [12, 16_500_000], // D
    [16, 45_000_000], // C
    [20, 79_000_000], // B
    [24, 117_500_000], // A
    [28, 153_000_000], // low S
    [31, 165_000_000], // mid S
    [34, 178_000_000], // high S
    [37, 195_000_000], // low GOAT
    [42, 207_000_000], // mid GOAT
    [48, 220_000_000], // high GOAT
    [54, MAX_PLAYER_DOLLARS],
  ];

  if (idx <= anchors[0]![0]) {
    const t = idx / anchors[0]![0];
    return Math.max(3_000_000, anchors[0]![1] * t);
  }

  for (let i = 1; i < anchors.length; i += 1) {
    const [x1, y1] = anchors[i - 1]!;
    const [x0, y0] = anchors[i]!;
    if (idx <= x0) {
      const t = (idx - x1) / Math.max(0.001, x0 - x1);
      const eased = t * t * (3 - 2 * t);
      return y1 + (y0 - y1) * eased;
    }
  }
  return MAX_PLAYER_DOLLARS;
}

/**
 * Authoritative primary price for a player/team/era version.
 * Classic and every 1v1 mode must call this — no mode multiplier and no re-roll.
 * Fixed min=max overrides stay exact. Open bands use a stable id hash, not Math.random.
 */
export function resolveAuthoritativePlayerValue(player: TradePlayer): number {
  const band = resolveDollarBand(player);
  if (band.minDollars === band.maxDollars) {
    return toCleanMillions(Math.min(MAX_PLAYER_DOLLARS, band.minDollars));
  }

  const eased = bandProgress(player, band);
  const fromStats = dollarsFromBoxStats(player.stats);
  const span = Math.max(1, band.maxDollars - band.minDollars);
  const statsT = Math.min(1, Math.max(0, (fromStats - band.minDollars) / span));
  const tvWeight = band.minTv === band.maxTv ? 0.35 : 0.7;
  const t = Math.min(1, Math.max(0, eased * tvWeight + statsT * (1 - tvWeight)));
  const raw = band.minDollars + span * t;
  const clamped = Math.min(
    band.maxDollars,
    Math.max(band.minDollars, raw * stablePriceJitter(player.id)),
  );
  return toCleanMillions(Math.min(MAX_PLAYER_DOLLARS, clamped));
}

/** @deprecated Name kept for callers — this no longer rolls randomly. */
export function rollDollarValue(player: TradePlayer): number {
  return resolveAuthoritativePlayerValue(player);
}

export function getDollarValue(player: TradePlayer): number {
  const valued = player as ValuedPlayer;
  if (typeof valued.dollarValue === 'number' && Number.isFinite(valued.dollarValue)) {
    return toCleanMillions(valued.dollarValue);
  }
  return resolveAuthoritativePlayerValue(player);
}

/**
 * Seated price. Primary slot keeps the shared card price.
 * Off-primary uses the same 6% haircut in Classic and 1v1, from that card price — not a new roll.
 */
export function getDollarValueForSlot(player: TradePlayer, slot: Position): number {
  const base = resolveAuthoritativePlayerValue(player);
  if (player.primaryPosition === slot) {
    return base;
  }
  return toCleanMillions(
    Math.min(MAX_PLAYER_DOLLARS, base * OFF_PRIMARY_SLOT_VALUE_FACTOR),
  );
}

export function sumTeamValue(players: TradePlayer[]): number {
  return players.reduce((sum, player) => sum + Math.round(getDollarValue(player)), 0);
}

export function formatDollars(value: number): string {
  if (value >= 1_000_000_000) {
    const billions = value / 1_000_000_000;
    return `$${billions % 1 === 0 ? billions.toFixed(0) : billions.toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    const millions = Math.round(value) / 1_000_000;
    return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  return `$${Math.round(value).toLocaleString()}`;
}

export function formatDollarsExact(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

export function withValue(player: TradePlayer): ValuedPlayer {
  return { ...player, dollarValue: resolveAuthoritativePlayerValue(player) };
}

function pickNearTarget(
  pool: TradePlayer[],
  target: number,
  used: Set<string>,
): TradePlayer | null {
  const available = pool.filter((p) => !used.has(p.id));
  if (available.length === 0) return null;
  const ranked = [...available].sort(
    (a, b) =>
      Math.abs(getDollarValue(a) - target) - Math.abs(getDollarValue(b) - target),
  );
  const shortlist = ranked.slice(0, Math.min(8, ranked.length));
  return shortlist[Math.floor(Math.random() * shortlist.length)] ?? null;
}

const MIN_STAR_DOLLAR_VALUE = 40_000_000;

function isStarPlayer(player: TradePlayer): boolean {
  const tier = getPlayerTier(player);
  return (tier === 'A' || tier === 'S') && getDollarValue(player) >= MIN_STAR_DOLLAR_VALUE;
}

/** Guarantee the pack includes at least one A/S card (≥ $40M). */
function ensureStarterStar(
  players: ValuedPlayer[],
  used: Set<string>,
): ValuedPlayer[] {
  if (players.some(isStarPlayer)) return players;
  if (players.length === 0) return players;

  const next = [...players];
  const replaceIndex = next.reduce(
    (best, player, index) =>
      getDollarValue(player) < getDollarValue(next[best]!) ? index : best,
    0,
  );
  const slot = LINEUP_POSITIONS[replaceIndex]!;

  const preferPos = ALL_PLAYERS.filter(
    (p) =>
      isStarPlayer(p) &&
      !used.has(p.id) &&
      (p.primaryPosition === slot || p.position === slot),
  );
  const anyStar = ALL_PLAYERS.filter((p) => isStarPlayer(p) && !used.has(p.id));
  const pool = preferPos.length > 0 ? preferPos : anyStar;
  if (pool.length === 0) return next;

  const star = pool[Math.floor(Math.random() * pool.length)]!;
  used.delete(next[replaceIndex]!.id);
  used.add(star.id);
  next[replaceIndex] = withValue(star);
  return next;
}

/**
 * Build a 5-man pack aimed at the selected pack’s estimated team value,
 * always including at least one A- or S-tier headliner.
 */
export function generateStarterPack(packKind: PackKind = 'starter'): {
  players: ValuedPlayer[];
  packKind: PackKind;
  estimatedValue: number;
  definition: PackDefinition;
} {
  const definition = PACK_CATALOG[packKind];
  const estimatedValue = definition.estimatedValue;
  const perSlot = estimatedValue / 5;
  const used = new Set<string>();
  let players: ValuedPlayer[] = [];

  for (const slot of LINEUP_POSITIONS) {
    const pool = ALL_PLAYERS.filter(
      (p) => p.primaryPosition === slot || p.position === slot,
    );
    const fallback = ALL_PLAYERS;
    const pick =
      pickNearTarget(pool.length ? pool : fallback, perSlot, used) ??
      shuffle(fallback.filter((p) => !used.has(p.id)))[0];
    if (!pick) continue;
    used.add(pick.id);
    players.push(withValue(pick));
  }

  // Soft rebalance toward pack estimate by swapping one slot if wildly off.
  let total = sumTeamValue(players);
  if (players.length === 5 && Math.abs(total - estimatedValue) > estimatedValue * 0.45) {
    const worstIndex = players.reduce(
      (best, player, index) => {
        const delta = Math.abs(getDollarValue(player) - perSlot);
        return delta > best.delta ? { index, delta } : best;
      },
      { index: 0, delta: -1 },
    ).index;
    const slot = LINEUP_POSITIONS[worstIndex]!;
    const replacement = pickNearTarget(
      ALL_PLAYERS.filter((p) => p.primaryPosition === slot && !used.has(p.id)),
      perSlot + (estimatedValue - total) / 2,
      used,
    );
    if (replacement) {
      used.delete(players[worstIndex]!.id);
      used.add(replacement.id);
      players[worstIndex] = withValue(replacement);
      total = sumTeamValue(players);
    }
  }

  players = ensureStarterStar(players, used);

  // High-tier packs: push a second star when the draw is still light.
  if (
    (packKind === 'deluxe' || packKind === 'dynasty') &&
    players.filter(isStarPlayer).length < 2
  ) {
    const lowIndex = players.reduce(
      (best, player, index) =>
        getDollarValue(player) < getDollarValue(players[best]!) ? index : best,
      0,
    );
    const slot = LINEUP_POSITIONS[lowIndex]!;
    const starPool = ALL_PLAYERS.filter(
      (p) =>
        isStarPlayer(p) &&
        !used.has(p.id) &&
        (p.primaryPosition === slot || packKind === 'dynasty'),
    );
    if (starPool.length > 0) {
      const star = starPool[Math.floor(Math.random() * starPool.length)]!;
      used.delete(players[lowIndex]!.id);
      used.add(star.id);
      players[lowIndex] = withValue(star);
    }
  }

  return {
    players,
    packKind,
    estimatedValue: definition.estimatedValue,
    definition,
  };
}

export function spinRandomTeam(): TeamInfo {
  return TEAMS[Math.floor(Math.random() * TEAMS.length)]!;
}

export function spinRandomEra(): DecadeEra {
  return ERAS[Math.floor(Math.random() * ERAS.length)]!;
}

/** Valid franchise + decade pair with a real historical roster. */
export interface SpinPair {
  team: TeamInfo;
  era: DecadeEra;
}

export function eraShortLabel(era: DecadeEra): string {
  return era.replace('19', '').replace('20', '').replace('s', '') + 's';
}

/** Cached once — never rebuild the full team×era scan during spins. */
let cachedValidSpinPairs: SpinPair[] | null = null;

export function listValidSpinPairs(): SpinPair[] {
  if (cachedValidSpinPairs) return cachedValidSpinPairs;
  const pairs: SpinPair[] = [];
  for (const era of ERAS) {
    for (const team of teamsForEra(era)) {
      pairs.push({ team, era });
    }
  }
  cachedValidSpinPairs = pairs;
  return pairs;
}

/** Warm the spin-pair index during idle boot (before first Play). */
export function warmSpinPairIndex(): void {
  void listValidSpinPairs();
}

/**
 * Sample unique combos for pinball slots (default 9).
 * Each launch reshuffles so the board stays replayable.
 */
export function samplePinballSlots(count = 9): SpinPair[] {
  const all = listValidSpinPairs();
  const next = [...all];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  const n = Math.max(5, Math.min(count, next.length));
  return next.slice(0, n);
}

/**
 * Finalize a team+era pair after the wheels stop.
 * Silently swaps franchise and/or decade when the combo has no roster
 * (e.g. 1960s Toronto). Prefer keeping `prefer` when possible.
 */
export function finalizeSpinPair(
  team: TeamInfo,
  era: DecadeEra,
  prefer: 'team' | 'era' | 'either' = 'either',
): { team: TeamInfo; era: DecadeEra } {
  try {
    return resolveValidTeamEra(team, era, prefer);
  } catch (err) {
    console.warn('[billionDollar] finalizeSpinPair failed', err);
    return resolveValidTeamEra(team, era, 'either');
  }
}

export function eraAdjustStats(
  player: TradePlayer,
  era: DecadeEra,
): { ppg: number; rpg: number; apg: number } {
  const scale = ERA_STAT_SCALE[era] ?? ERA_STAT_SCALE['2020s'];
  const salt = player.id.split('').reduce((n, ch) => n + ch.charCodeAt(0), 0) % 17;
  const jitter = 0.94 + (salt / 16) * 0.12;
  return {
    ppg: Math.round(player.stats.ppg * scale.ppg * jitter * 10) / 10,
    rpg: Math.round(player.stats.rpg * scale.rpg * jitter * 10) / 10,
    apg: Math.round(player.stats.apg * scale.apg * jitter * 10) / 10,
  };
}

/**
 * Build the draft board for a spun team + era from the historical DB.
 * Returns the full roster (up to MAX_ERA_BOARD_SIZE), sorted by value — no 12-player sample.
 */
export function buildEraRoster(team: TeamInfo, era: DecadeEra): EraOfferPlayer[] {
  try {
    const resolved = resolveValidTeamEra(team, era);
    const historical = getDecadeRoster(resolved.team.id, resolved.era);

    if (historical.length === 0) {
      console.warn(
        `[billionDollar] Empty historical roster for ${resolved.team.id} · ${resolved.era}`,
      );
      return [];
    }

    // Full board — only truncate if somehow over the soft ceiling.
    const picked =
      historical.length <= MAX_ERA_BOARD_SIZE
        ? historical
        : shuffle(historical).slice(0, MAX_ERA_BOARD_SIZE);

    return picked
      .map((row) => {
        const player = decadePlayerToTradePlayer(row, resolved.team.id, resolved.era);
        return {
          ...withValue(player),
          // Use authored decade averages directly (no modern-stat scaling).
          eraStats: {
            ppg: row.ppg,
            rpg: row.rpg,
            apg: row.apg,
          },
          sourceEra: resolved.era,
        };
      })
      .sort((a, b) => b.dollarValue - a.dollarValue);
  } catch (err) {
    console.warn('[billionDollar] buildEraRoster failed', err);
    return [];
  }
}

/**
 * Full franchise board across every decade — for 1V1 picks (not era-limited).
 */
export function buildTeamAllErasRoster(team: TeamInfo): EraOfferPlayer[] {
  const byId = new Map<string, EraOfferPlayer>();
  for (const era of ERAS) {
    for (const player of buildEraRoster(team, era)) {
      if (!byId.has(player.id)) byId.set(player.id, player);
    }
  }
  return [...byId.values()].sort((a, b) => b.dollarValue - a.dollarValue);
}

export interface BillionTradeResult {
  accepted: boolean;
  message: string;
  matchedNeeds?: TeamNeedId[];
}

/**
 * Accept roughly fair money deals, or need-fit deals even when the user
 * is underwater on dollars (they fill a hole the GM is desperate for).
 */
export function evaluateBillionTrade(
  giving: TradePlayer,
  receiving: TradePlayer,
  team?: TeamInfo | null,
): BillionTradeResult {
  const out = getDollarValue(giving);
  const incoming = getDollarValue(receiving);
  const ratio = incoming / Math.max(1, out);

  const needs = team ? getPrimaryTeamNeeds(team.id, 2) : [];
  const matchedNeeds = needs.length > 0 ? getMatchedNeeds(giving, needs) : [];
  const needFit = matchedNeeds.length > 0;
  const needLabel = matchedNeeds[0] ? NEED_LABELS[matchedNeeds[0]] : null;

  // Need fit unlocks underwater swaps — the GM pays a premium for the hole filled.
  if (needFit) {
    if (ratio <= 2.35) {
      return {
        accepted: true,
        matchedNeeds,
        message: needLabel
          ? `Trade accepted — they needed ${needLabel}, so ${receiving.name} is yours.`
          : `Trade accepted — ${receiving.name} is yours.`,
      };
    }
    if (ratio <= 3.0 && Math.random() < 0.45) {
      return {
        accepted: true,
        matchedNeeds,
        message: `Stretch, but ${needLabel ?? 'the fit'} gets ${receiving.name} across the table.`,
      };
    }
  }

  if (ratio <= 1.18) {
    return {
      accepted: true,
      matchedNeeds,
      message: `Trade accepted — ${receiving.name} is yours.`,
    };
  }
  if (ratio <= 1.4 && Math.random() < 0.35) {
    return {
      accepted: true,
      matchedNeeds,
      message: `Tough ask, but the deal goes through for ${receiving.name}.`,
    };
  }

  if (needFit) {
    return {
      accepted: false,
      matchedNeeds,
      message: `Denied — they like the ${needLabel ?? 'fit'}, but won't move ${receiving.name} that far underwater.`,
    };
  }

  return {
    accepted: false,
    matchedNeeds,
    message: `Trade denied — they won't move ${receiving.name} for ${giving.name}.`,
  };
}

export function withFreshValues(players: TradePlayer[]): ValuedPlayer[] {
  return players.map((player) => ({ ...player, dollarValue: rollDollarValue(player) }));
}
