import type { TradePlayer } from './types';
import { isSTier } from './tiers';

/** Roster IDs with hidden elite market demand when pursuing S-tier targets. */
export const HIDDEN_ELITE_OFFER_PLAYER_IDS = new Set([
  'embiid',
  'haliburton',
  'maxey',
  'durant',
  'cade',
  'towns',
  'leonard',
  'sengun',
  'brown',
]);

/** Margin boost applied only when trading up to S-tier — never exposed in UI. */
export const HIDDEN_ELITE_OFFER_MARGIN_BONUS = 20;

export function isHiddenEliteOfferId(playerId: string): boolean {
  return HIDDEN_ELITE_OFFER_PLAYER_IDS.has(playerId);
}

export function hasHiddenEliteOffer(player: TradePlayer): boolean {
  return player.hiddenEliteOffer === true;
}

export function getHiddenEliteOfferMarginBonus(
  offered: TradePlayer,
  requested: TradePlayer,
): number {
  if (!hasHiddenEliteOffer(offered) || !isSTier(requested)) {
    return 0;
  }
  return HIDDEN_ELITE_OFFER_MARGIN_BONUS;
}
