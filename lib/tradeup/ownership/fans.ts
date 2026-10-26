/**
 * Player fans — one number per player (the same person in every era and team).
 *
 * Fans grow steeply with the player's best in-game value across all eras, so stars dwarf role
 * players, and a few global icons are set by hand above everyone. The server stores these exact
 * numbers in franchise_player_pool.fans (written by scripts/generate-franchise-seed.ts).
 */

import { getDollarValue } from '@/lib/tradeup/billionDollar';
import {
  DECADE_ERAS,
  decadePlayerToTradePlayer,
  getDecadeRoster,
  teamsForEra,
} from '@/lib/tradeup/decadeRosters';

export const FAN_CURVE = {
  /** A player whose best value is $200,000,000 draws this many fans… */
  anchorValue: 200_000_000,
  anchorFans: 250_000_000,
  /** …and every $1,000,000 of value above or below multiplies fans by e^±growth. */
  growthPerMillion: 0.051,
} as const;

/** The most famous players in the game, far above the curve. Keyed by player slug. */
export const LEGEND_FANS: Record<string, number> = {
  michael_jordan: 900_000_000,
  lebron_james: 850_000_000,
  wilt_chamberlain: 600_000_000,
};

/** Era/team-free player key: hist_1990s_CHI_michael_jordan → michael_jordan. */
export function playerSlug(playerId: string): string {
  return playerId.replace(/^hist_\d{4}s_[A-Za-z]+_/, '');
}

function roundSig(n: number, digits: number): number {
  if (n <= 0) return 0;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(n)) - (digits - 1));
  return Math.round(n / step) * step;
}

/** Fans for a player whose best value is `peakValue` (legends aside). */
export function fansForPeakValue(peakValue: number): number {
  const millions = (peakValue - FAN_CURVE.anchorValue) / 1_000_000;
  return roundSig(FAN_CURVE.anchorFans * Math.exp(FAN_CURVE.growthPerMillion * millions), 3);
}

let table: Map<string, number> | null = null;

/** slug → fans for every player in the game. Built once on first use. */
export function fanTable(): Map<string, number> {
  if (table) return table;
  const peak = new Map<string, number>();
  for (const era of DECADE_ERAS) {
    for (const team of teamsForEra(era)) {
      for (const row of getDecadeRoster(team.id, era)) {
        const player = decadePlayerToTradePlayer(row, team.id, era);
        const slug = playerSlug(player.id);
        const value = Math.round(getDollarValue(player));
        if (value > (peak.get(slug) ?? 0)) peak.set(slug, value);
      }
    }
  }
  table = new Map([...peak].map(([slug, value]) => [slug, LEGEND_FANS[slug] ?? fansForPeakValue(value)]));
  return table;
}

export function playerFans(playerId: string): number {
  return fanTable().get(playerSlug(playerId)) ?? 0;
}

/** A drafted player's fans: the server's number when it sent one, else the same table locally. */
export function pickFans(pick: { playerId: string; fans?: number | null }): number {
  return pick.fans ?? playerFans(pick.playerId);
}

export function rosterFans(picks: { playerId: string; fans?: number | null }[]): number {
  return picks.reduce((sum, pick) => sum + pickFans(pick), 0);
}
