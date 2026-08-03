import type { TradePlayer } from './types';

export type PlayerTier = 'GOAT' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Map authored tradeValue (0–99) to display / economy tiers.
 * GOAT is reserved for extreme peaks (≈97–99) — prime legends only.
 */
export function getPlayerTier(player: TradePlayer): PlayerTier {
  const v = player.tradeValue;
  if (v >= 97) return 'GOAT';
  if (v >= 92) return 'S';
  if (v >= 78) return 'A';
  if (v >= 62) return 'B';
  if (v >= 45) return 'C';
  if (v >= 28) return 'D';
  return 'F';
}

export function isSTier(player: TradePlayer): boolean {
  return getPlayerTier(player) === 'S';
}

export function isATier(player: TradePlayer): boolean {
  return getPlayerTier(player) === 'A';
}

export function isGoatTier(player: TradePlayer): boolean {
  return getPlayerTier(player) === 'GOAT';
}
