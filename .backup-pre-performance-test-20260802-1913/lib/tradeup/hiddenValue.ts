import type { TradePlayer } from './types';
import { isATier } from './tiers';

/** Roster IDs with hidden market value when pursuing A-tier targets. */
export const HIDDEN_VALUE_PLAYER_IDS = new Set([
  'harden',
  'harper',
  'wallace',
  'castle',
  'white',
  'anunoby',
]);

/** Margin boost applied only when trading up to A-tier — never exposed in UI. */
export const HIDDEN_VALUE_MARGIN_BONUS = 18;

export function isHiddenValueId(playerId: string): boolean {
  return HIDDEN_VALUE_PLAYER_IDS.has(playerId);
}

export function hasHiddenValue(player: TradePlayer): boolean {
  return player.hiddenValue === true;
}

export function getHiddenValueMarginBonus(
  offered: TradePlayer,
  requested: TradePlayer,
): number {
  if (!hasHiddenValue(offered) || !isATier(requested)) {
    return 0;
  }
  return HIDDEN_VALUE_MARGIN_BONUS;
}
