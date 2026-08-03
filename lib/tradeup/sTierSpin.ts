import { ALL_PLAYERS } from './rosters';
import { isSTier } from './tiers';
import type { TradePlayer } from './types';

export const S_TIER_SPIN_COST = 10_000;

/** Fixed wheel order — all current S-tier roster records, sorted by name. */
export function getSTierSpinWheelPlayers(): TradePlayer[] {
  return ALL_PLAYERS.filter(isSTier).sort((a, b) => a.name.localeCompare(b.name));
}

export function getAvailableSTierSpinPlayers(ownedIds: string[]): TradePlayer[] {
  const owned = new Set(ownedIds);
  return getSTierSpinWheelPlayers().filter((player) => !owned.has(player.id));
}

export function pickSTierSpinWinner(ownedIds: string[]): TradePlayer | null {
  const pool = getAvailableSTierSpinPlayers(ownedIds);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export function getWheelIndexForPlayer(player: TradePlayer): number {
  return getSTierSpinWheelPlayers().findIndex((p) => p.id === player.id);
}

export function computeWheelLandingRotation(winnerIndex: number, segmentCount: number): number {
  const segmentAngle = 360 / segmentCount;
  const fullSpins = 5;
  return fullSpins * 360 + (360 - winnerIndex * segmentAngle - segmentAngle / 2);
}

export type STierSpinFailureReason = 'insufficient_credits' | 'all_owned' | 'already_spinning';

export interface STierSpinSuccess {
  ok: true;
  player: TradePlayer;
  balance: number;
  winnerIndex: number;
}

export interface STierSpinFailure {
  ok: false;
  reason: STierSpinFailureReason;
}

export type STierSpinPurchaseResult = STierSpinSuccess | STierSpinFailure;

export function canAffordSTierSpin(credits: number): boolean {
  return credits >= S_TIER_SPIN_COST;
}

export function canSpinSTier(ownedIds: string[], credits: number): boolean {
  return canAffordSTierSpin(credits) && getAvailableSTierSpinPlayers(ownedIds).length > 0;
}

export function performSTierSpinPurchase(
  ownedIds: string[],
  getCredits: () => number,
  spendCredits: (amount: number) => { success: boolean; balance: number },
): STierSpinPurchaseResult {
  if (getCredits() < S_TIER_SPIN_COST) {
    return { ok: false, reason: 'insufficient_credits' };
  }

  const winner = pickSTierSpinWinner(ownedIds);
  if (!winner) {
    return { ok: false, reason: 'all_owned' };
  }

  const spend = spendCredits(S_TIER_SPIN_COST);
  if (!spend.success) {
    return { ok: false, reason: 'insufficient_credits' };
  }

  const winnerIndex = getWheelIndexForPlayer(winner);
  if (winnerIndex < 0) {
    return { ok: false, reason: 'all_owned' };
  }

  return {
    ok: true,
    player: winner,
    balance: spend.balance,
    winnerIndex,
  };
}

export function getPlayerLastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}
