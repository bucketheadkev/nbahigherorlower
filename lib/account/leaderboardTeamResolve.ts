/**
 * Resolve hist_* player ids for public leaderboard View Team display.
 * Names/teams/eras come from the same decade roster data the game uses.
 */

import {
  getDollarValueForSlot,
  type DecadeEra,
} from '@/lib/tradeup/billionDollar';
import {
  DECADE_ERAS,
  decadePlayerToTradePlayer,
  type DecadeRosterPlayer,
} from '@/lib/tradeup/decadeRosters';
import decadeRostersJson from '@/lib/tradeup/data/decadeRosters.json';
import { TEAMS } from '@/lib/tradeup/teams';
import { LINEUP_POSITIONS } from '@/lib/tradeup/startingLineup';
import type { Position } from '@/lib/tradeup/types';

export interface LeaderboardSeatInput {
  player_id: string;
  slot: string;
}

export interface LeaderboardTeamPlayer {
  playerId: string;
  name: string;
  position: Position;
  teamId: string;
  teamName: string;
  era: string;
  dollarValue: number;
}

type CacheEntry = {
  name: string;
  teamId: string;
  era: DecadeEra;
  tradePlayer: ReturnType<typeof decadePlayerToTradePlayer>;
};

const decadeData = decadeRostersJson as Record<
  string,
  Record<string, DecadeRosterPlayer[]>
>;

let cache: Map<string, CacheEntry> | null = null;

function teamNameForId(teamId: string): string {
  return TEAMS.find((t) => t.id === teamId)?.fullName ?? teamId;
}

function buildCache(): Map<string, CacheEntry> {
  const map = new Map<string, CacheEntry>();
  for (const era of DECADE_ERAS) {
    const teams = decadeData[era];
    if (!teams) continue;
    for (const [teamId, players] of Object.entries(teams)) {
      for (const row of players) {
        const tradePlayer = decadePlayerToTradePlayer(row, teamId, era as DecadeEra);
        if (map.has(tradePlayer.id)) continue;
        map.set(tradePlayer.id, {
          name: tradePlayer.name,
          teamId,
          era: era as DecadeEra,
          tradePlayer,
        });
      }
    }
  }
  return map;
}

function getCache(): Map<string, CacheEntry> {
  if (!cache) cache = buildCache();
  return cache;
}

function normalizeSlot(raw: string): Position | null {
  const slot = raw.trim().toUpperCase();
  return (LINEUP_POSITIONS as readonly string[]).includes(slot)
    ? (slot as Position)
    : null;
}

/** Build display players for a verified lineup (slot order PG→C). */
export function resolveLeaderboardLineup(
  lineup: LeaderboardSeatInput[] | null | undefined,
): LeaderboardTeamPlayer[] {
  if (!Array.isArray(lineup) || lineup.length === 0) return [];
  const bySlot = new Map<Position, LeaderboardTeamPlayer>();
  const index = getCache();

  for (const seat of lineup) {
    const slot = normalizeSlot(typeof seat.slot === 'string' ? seat.slot : '');
    const playerId = typeof seat.player_id === 'string' ? seat.player_id : '';
    if (!slot || !playerId) continue;
    const entry = index.get(playerId);
    const dollarValue = entry
      ? getDollarValueForSlot(entry.tradePlayer, slot)
      : 0;
    bySlot.set(slot, {
      playerId,
      name:
        entry?.name ??
        playerId.replace(/^hist_[^_]+_[^_]+_/, '').replace(/_/g, ' '),
      position: slot,
      teamId: entry?.teamId ?? '',
      teamName: entry ? teamNameForId(entry.teamId) : '—',
      era: entry?.era ?? '—',
      dollarValue,
    });
  }

  return LINEUP_POSITIONS.map((pos) => bySlot.get(pos)).filter(
    (p): p is LeaderboardTeamPlayer => Boolean(p),
  );
}
