import { ALL_PLAYERS } from './rosters';
import { getEligibleForSlot } from './lineupEligibility';
import type { Position, TradePlayer } from './types';

export const LINEUP_POSITIONS: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

export const POSITION_LABELS: Record<Position, string> = {
  PG: 'Point Guard',
  SG: 'Shooting Guard',
  SF: 'Small Forward',
  PF: 'Power Forward',
  C: 'Center',
};

export interface LineupSlot {
  slot: Position;
  player: TradePlayer;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

function placeholderPlayer(slot: Position): TradePlayer {
  return {
    id: `placeholder_${slot}`,
    name: 'Unknown Player',
    teamId: 'NBA',
    primaryPosition: slot,
    position: slot,
    age: 0,
    stats: { ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0 },
    tradeValue: 0,
    isStarter: false,
  };
}

/**
 * Build a five-player starting lineup with unique players.
 * Each slot draws only from that slot’s primaryPosition pool.
 */
export function generateStartingLineup(): LineupSlot[] {
  const pool = ALL_PLAYERS.length > 0 ? ALL_PLAYERS : [];
  const usedIds = new Set<string>();
  const lineup: LineupSlot[] = [];

  for (const slot of LINEUP_POSITIONS) {
    const candidates = shuffle(getEligibleForSlot(slot, pool, usedIds));
    const player = pickRandom(candidates) ?? placeholderPlayer(slot);

    if (!player.id.startsWith('placeholder_')) {
      usedIds.add(player.id);
    }

    lineup.push({ slot, player });
  }

  return lineup;
}
