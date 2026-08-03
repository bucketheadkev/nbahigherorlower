import type { TradePlayer } from './types';
import type { PlayerTier } from './tiers';
import { getPlayerTier } from './tiers';
import type { StartingTier } from './types';

/** Credits earned when selling a player, by tier reached. */
export const SELL_VALUE: Record<PlayerTier, number> = {
  F: 25,
  D: 55,
  C: 120,
  B: 260,
  A: 520,
  S: 950,
  GOAT: 1400,
};

export function getSellValue(player: TradePlayer): number {
  return SELL_VALUE[getPlayerTier(player)];
}

export interface StoreTierOffer {
  id: string;
  tier: StartingTier;
  name: string;
  description: string;
  cost: number;
  /** Included by default — not purchasable. */
  included?: boolean;
}

/** All starting-tier offers shown in the Store (F included; D/C/B purchasable). */
export const STARTING_TIER_OFFERS: StoreTierOffer[] = [
  {
    id: 'start_f',
    tier: 'F',
    name: 'F-Tier Player',
    description: 'Start each run with an F-tier player.',
    cost: 0,
    included: true,
  },
  {
    id: 'start_d',
    tier: 'D',
    name: 'D-Tier Player',
    description: 'Start each run with a D-tier player.',
    cost: 250,
  },
  {
    id: 'start_c',
    tier: 'C',
    name: 'C-Tier Player',
    description: 'Start each run with a C-tier player.',
    cost: 450,
  },
  {
    id: 'start_b',
    tier: 'B',
    name: 'B-Tier Player',
    description: 'Start each run with a B-tier player.',
    cost: 10_000,
  },
];

/** @deprecated Use STARTING_TIER_OFFERS — purchasable items only. */
export const STORE_ITEMS = STARTING_TIER_OFFERS.filter((item) => !item.included && item.cost > 0);

export function getStoreOffer(tier: StartingTier): StoreTierOffer | undefined {
  return STARTING_TIER_OFFERS.find((item) => item.tier === tier);
}

export function tierRank(tier: StartingTier): number {
  if (tier === 'B') return 3;
  if (tier === 'C') return 2;
  if (tier === 'D') return 1;
  return 0;
}

export function formatCredits(amount: number): string {
  return amount.toLocaleString();
}
