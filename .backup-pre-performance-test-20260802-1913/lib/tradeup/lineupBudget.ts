import { getPlayerTier, type PlayerTier } from './tiers';
import type { TradePlayer } from './types';

export const ROUND_BUDGET = 1000;
export const REROLL_COST = 50;
export const OFFERS_PER_CARD = 3;
/** Round Credits awarded once when the original free player is kept. */
export const KEEP_BONUS = 100;
/** Max Round Credits if every free player is kept (1000 + 5×100). */
export const ROUND_CREDITS_CAP = ROUND_BUDGET + KEEP_BONUS * 5;

export const TIER_PRICE: Record<PlayerTier, number> = {
  F: 20,
  D: 50,
  C: 150,
  B: 300,
  A: 450,
  S: 500,
  GOAT: 650,
};

export function getPlayerPrice(player: TradePlayer): number {
  return TIER_PRICE[getPlayerTier(player)];
}

/** Market purchase — no reserve required; free reveals cover every future slot. */
export function canAffordPurchase(credits: number, price: number): boolean {
  return credits >= price;
}

export function canAffordReroll(credits: number): boolean {
  return credits >= REROLL_COST;
}

export function formatRoundCredits(value: number): string {
  return value.toLocaleString('en-US');
}
