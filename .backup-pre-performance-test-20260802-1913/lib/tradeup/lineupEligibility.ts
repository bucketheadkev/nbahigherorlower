import { ALL_PLAYERS } from './rosters';
import type { Position, TradePlayer } from './types';

export const CANONICAL_POSITIONS: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

/**
 * Shared primary-position pool helper.
 * Starting cards and Trade Up must both use this so position rules cannot diverge.
 */
export function getPlayersByPrimaryPosition(
  position: Position,
  pool: readonly TradePlayer[] = ALL_PLAYERS,
): TradePlayer[] {
  return pool.filter((player) => player.primaryPosition === position);
}

/**
 * Build the eligible player pool for a lineup slot.
 * A player can only appear in the slot matching their primaryPosition.
 */
export function getEligibleForSlot(
  slot: Position,
  pool: TradePlayer[],
  usedIds: Set<string>,
): TradePlayer[] {
  return getPlayersByPrimaryPosition(slot, pool).filter((player) => !usedIds.has(player.id));
}
