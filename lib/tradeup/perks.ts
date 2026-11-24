/**
 * Classic-run perks. Coin-priced activations, capped separately from Team/Era rerolls.
 */

import {
  COINS_PERK_COST,
  MAX_PERK_ACTIVATIONS_PER_RUN,
  getXpCoins,
  spendXpCoins,
} from '@/lib/tradeup/xp';
import { consumePerkCharge, getPerkStock } from '@/lib/tradeup/perkInventory';

export type PerkId = 'double_draft' | 'xray' | 'player_swap';

export interface PerkDef {
  id: PerkId;
  title: string;
  blurb: string;
  /** Ultra-short Classic bar line (1–3 words). */
  tapLine: string;
  cost: number;
  /** Short Shop / inventory label */
  shopTitle: string;
}

export const PERK_DEFS: readonly PerkDef[] = [
  {
    id: 'double_draft',
    title: 'Double Draft',
    shopTitle: 'Double Drafts',
    blurb: 'Pick two players from one rolled team/era.',
    tapLine: 'Pick two',
    cost: COINS_PERK_COST,
  },
  {
    id: 'xray',
    title: 'X-Ray Vision',
    shopTitle: 'X-Ray Vision',
    blurb: 'See every player’s $ value for the rest of this run.',
    tapLine: 'See values',
    cost: COINS_PERK_COST,
  },
  {
    id: 'player_swap',
    title: 'Player Swap',
    shopTitle: 'Player Swaps',
    blurb: 'Replace a drafted player with one from this roll.',
    tapLine: 'Swap player',
    cost: COINS_PERK_COST,
  },
] as const;

export const MAX_PERK_USES = MAX_PERK_ACTIVATIONS_PER_RUN;

/** True if inventory has a charge or the player can pay the coin cost. */
export function canAffordPerk(idOrCost: PerkId | number = COINS_PERK_COST): boolean {
  if (typeof idOrCost === 'string') {
    if (getPerkStock(idOrCost) > 0) return true;
    return getXpCoins() >= COINS_PERK_COST;
  }
  return getXpCoins() >= idOrCost;
}

/**
 * Prefer a Shop inventory charge; otherwise spend coins.
 * Pass the perk id so inventory can be consumed correctly.
 * When `clientRunId` is set, permanent accounts also hit perk_consume /
 * classic_boost_consume so the shared 3-boost cap is enforced server-side.
 */
export function purchasePerkActivation(
  idOrCost: PerkId | number = COINS_PERK_COST,
  clientRunId?: string | null,
): boolean {
  if (typeof idOrCost === 'string') {
    const run = typeof clientRunId === 'string' ? clientRunId.trim() : '';
    if (consumePerkCharge(idOrCost)) {
      if (run) {
        void import('@/lib/tradeup/classicRunSession')
          .then((m) => m.consumeServerPerk(idOrCost, run))
          .catch(() => {});
      }
      return true;
    }
    const req =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `p${Date.now().toString(36)}`;
    if (run) {
      const kind =
        idOrCost === 'double_draft'
          ? 'perk_double_draft'
          : idOrCost === 'xray'
            ? 'perk_xray'
            : 'perk_player_swap';
      // Server owns debit + boost; local coins update after sync.
      void import('@/lib/tradeup/classicRunSession')
        .then(async (m) => {
          const res = await m.consumeClassicBoost(run, kind);
          if (res.boostsUsed == null) {
            spendXpCoins(COINS_PERK_COST, `perk_activate:${idOrCost}:${req}`);
          }
        })
        .catch(() => {
          spendXpCoins(COINS_PERK_COST, `perk_activate:${idOrCost}:${req}`);
        });
      return true;
    }
    return spendXpCoins(COINS_PERK_COST, `perk_activate:${idOrCost}:${req}`);
  }
  return spendXpCoins(idOrCost, `perk_activate:generic:${Date.now()}`);
}
