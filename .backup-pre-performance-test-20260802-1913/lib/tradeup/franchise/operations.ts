import { LINEUP_SIZE, type FranchiseData, type FranchiseDropTarget, type UnlockResult } from './types';

function clone(data: FranchiseData): FranchiseData {
  return {
    unlockedIds: [...data.unlockedIds],
    startingFive: [...data.startingFive],
    bench: [...data.bench],
  };
}

function findPlayerSlot(
  data: FranchiseData,
  playerId: string,
): { zone: 'starting' | 'bench'; index: number } | null {
  const startIdx = data.startingFive.indexOf(playerId);
  if (startIdx >= 0) return { zone: 'starting', index: startIdx };
  const benchIdx = data.bench.indexOf(playerId);
  if (benchIdx >= 0) return { zone: 'bench', index: benchIdx };
  return null;
}

function clearPlayerFromLineup(data: FranchiseData, playerId: string): void {
  const startIdx = data.startingFive.indexOf(playerId);
  if (startIdx >= 0) data.startingFive[startIdx] = null;
  const benchIdx = data.bench.indexOf(playerId);
  if (benchIdx >= 0) data.bench[benchIdx] = null;
}

function firstEmptySlot(slots: (string | null)[]): number {
  const idx = slots.indexOf(null);
  return idx >= 0 ? idx : -1;
}

export function unlockPlayer(data: FranchiseData, playerId: string): {
  data: FranchiseData;
  result: UnlockResult;
} {
  const next = clone(data);
  if (next.unlockedIds.includes(playerId)) {
    return { data: next, result: { status: 'duplicate', playerId } };
  }
  next.unlockedIds.push(playerId);
  return { data: next, result: { status: 'new', playerId } };
}

export function removePlayerFromFranchise(data: FranchiseData, playerId: string): FranchiseData {
  const next = clone(data);
  next.unlockedIds = next.unlockedIds.filter((id) => id !== playerId);
  clearPlayerFromLineup(next, playerId);
  return next;
}

export function moveToStartingFive(data: FranchiseData, playerId: string): FranchiseData {
  const next = clone(data);
  if (!next.unlockedIds.includes(playerId)) return next;
  clearPlayerFromLineup(next, playerId);
  const slot = firstEmptySlot(next.startingFive);
  if (slot >= 0) next.startingFive[slot] = playerId;
  return next;
}

export function moveToBench(data: FranchiseData, playerId: string): FranchiseData {
  const next = clone(data);
  if (!next.unlockedIds.includes(playerId)) return next;
  clearPlayerFromLineup(next, playerId);
  const slot = firstEmptySlot(next.bench);
  if (slot >= 0) next.bench[slot] = playerId;
  return next;
}

export function removeFromLineup(data: FranchiseData, playerId: string): FranchiseData {
  const next = clone(data);
  clearPlayerFromLineup(next, playerId);
  return next;
}

export function assignToLineup(
  data: FranchiseData,
  playerId: string,
  zone: 'starting' | 'bench',
  replacePlayerId?: string,
): FranchiseData {
  const next = clone(data);
  if (!next.unlockedIds.includes(playerId)) return next;

  const slots = zone === 'starting' ? next.startingFive : next.bench;

  if (replacePlayerId) {
    const replaceIdx = slots.indexOf(replacePlayerId);
    if (replaceIdx < 0) return data;
    clearPlayerFromLineup(next, playerId);
    const target = zone === 'starting' ? next.startingFive : next.bench;
    target[replaceIdx] = playerId;
    return next;
  }

  const empty = firstEmptySlot(slots);
  if (empty < 0) return data;

  clearPlayerFromLineup(next, playerId);
  const target = zone === 'starting' ? next.startingFive : next.bench;
  target[empty] = playerId;
  return next;
}

export function swapLineupPlayers(
  data: FranchiseData,
  playerA: string,
  playerB: string,
): FranchiseData {
  const next = clone(data);
  const slotA = findPlayerSlot(next, playerA);
  const slotB = findPlayerSlot(next, playerB);
  if (!slotA || !slotB || playerA === playerB) return data;

  const listA = slotA.zone === 'starting' ? next.startingFive : next.bench;
  const listB = slotB.zone === 'starting' ? next.startingFive : next.bench;
  listA[slotA.index] = playerB;
  listB[slotB.index] = playerA;
  return next;
}

export function countFilledInZone(data: FranchiseData, zone: 'starting' | 'bench'): number {
  const slots = zone === 'starting' ? data.startingFive : data.bench;
  return slots.filter(Boolean).length;
}

export function getZonePlayerIds(data: FranchiseData, zone: 'starting' | 'bench'): string[] {
  const slots = zone === 'starting' ? data.startingFive : data.bench;
  return slots.filter((id): id is string => id !== null);
}

export function getOtherLineupPlayerIds(data: FranchiseData, playerId: string): string[] {
  return getLineupPlayerIds(data).filter((id) => id !== playerId);
}

function getLineupPlayerIds(data: FranchiseData): string[] {
  return [...data.startingFive, ...data.bench].filter((id): id is string => id !== null);
}

export function dropPlayer(
  data: FranchiseData,
  playerId: string,
  target: FranchiseDropTarget,
): FranchiseData {
  const next = clone(data);
  if (!next.unlockedIds.includes(playerId)) return next;

  const from = findPlayerSlot(next, playerId);
  clearPlayerFromLineup(next, playerId);

  if (target.zone === 'collection') {
    return next;
  }

  const slots = target.zone === 'starting' ? next.startingFive : next.bench;
  const index = target.slotIndex ?? firstEmptySlot(slots);
  if (index < 0 || index >= LINEUP_SIZE) {
    if (from) {
      const restore = from.zone === 'starting' ? next.startingFive : next.bench;
      restore[from.index] = playerId;
    }
    return next;
  }

  const displaced = slots[index];
  slots[index] = playerId;

  if (displaced && displaced !== playerId) {
    if (from) {
      const restore = from.zone === 'starting' ? next.startingFive : next.bench;
      restore[from.index] = displaced;
    }
  }

  return next;
}
