import { getPlayerById } from '../rosters';
import type { PlayerTier } from '../tiers';
import { LINEUP_SIZE } from './types';
import type { FranchiseData } from './types';

function tradeValueToTier(avg: number): PlayerTier {
  if (avg >= 97) return 'GOAT';
  if (avg >= 92) return 'S';
  if (avg >= 78) return 'A';
  if (avg >= 62) return 'B';
  if (avg >= 45) return 'C';
  if (avg >= 28) return 'D';
  return 'F';
}

export function calculateFranchiseTier(data: FranchiseData): PlayerTier | null {
  const lineupIds = [...data.startingFive, ...data.bench].filter(
    (id): id is string => id !== null,
  );

  if (lineupIds.length === 0) return null;

  let sum = 0;
  let count = 0;
  for (const id of lineupIds) {
    const player = getPlayerById(id);
    if (player) {
      sum += player.tradeValue;
      count += 1;
    }
  }

  if (count === 0) return null;
  return tradeValueToTier(sum / count);
}

export function getLineupPlayerIds(data: FranchiseData): string[] {
  return [...data.startingFive, ...data.bench].filter((id): id is string => id !== null);
}

export function getCollectionIds(data: FranchiseData): string[] {
  const inLineup = new Set(getLineupPlayerIds(data));
  return data.unlockedIds.filter((id) => !inLineup.has(id));
}

export function countFilledSlots(slots: (string | null)[]): number {
  return slots.filter(Boolean).length;
}

export function totalLineupSlots(): number {
  return LINEUP_SIZE * 2;
}

/** Season simulation requires a full 10-player lineup (5 starters + 5 bench). */
export function isRosterCompleteForSimulation(data: FranchiseData): boolean {
  return (
    countFilledSlots(data.startingFive) >= LINEUP_SIZE &&
    countFilledSlots(data.bench) >= LINEUP_SIZE
  );
}

export function getRosterSimulationProgress(data: FranchiseData): {
  starters: number;
  bench: number;
} {
  return {
    starters: countFilledSlots(data.startingFive),
    bench: countFilledSlots(data.bench),
  };
}
