/**
 * Shop-purchased perk charges (local). Classic prefers these before spending coins.
 */

import { COINS_PERK_COST, getXpCoins, spendXpCoins } from '@/lib/tradeup/xp';
import type { PerkId } from '@/lib/tradeup/perks';

const KEY = 'oneb:perk-inventory:v1';

export const PERK_PACK_QTY = 5;
export const PERK_BUNDLE_QTY = 10;

/** Coin prices for Shop perk packs (display + spend). */
export const PERK_PACK_PRICE: Record<PerkId, number> = {
  double_draft: 500,
  xray: 600,
  player_swap: 750,
};

/** Ultimate bundle: 10 of each perk. */
export const PERK_BUNDLE_PRICE = 4500;

export type PerkInventory = Record<PerkId, number>;

const EMPTY: PerkInventory = {
  double_draft: 0,
  xray: 0,
  player_swap: 0,
};

function read(): PerkInventory {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<PerkInventory>;
    return {
      double_draft: Math.max(0, Math.floor(Number(parsed.double_draft) || 0)),
      xray: Math.max(0, Math.floor(Number(parsed.xray) || 0)),
      player_swap: Math.max(0, Math.floor(Number(parsed.player_swap) || 0)),
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(next: PerkInventory): PerkInventory {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('oneb:perk-inventory'));
    } catch {
      /* ignore quota */
    }
  }
  return next;
}

export function getPerkInventory(): PerkInventory {
  return read();
}

export function getPerkStock(id: PerkId): number {
  return read()[id] ?? 0;
}

export function addPerkCharges(id: PerkId, qty: number): PerkInventory {
  const n = Math.max(0, Math.floor(qty));
  const cur = read();
  return write({ ...cur, [id]: (cur[id] ?? 0) + n });
}

/** Spend coins for a pack of charges. */
export function buyPerkPack(id: PerkId): boolean {
  const price = PERK_PACK_PRICE[id] ?? COINS_PERK_COST * PERK_PACK_QTY;
  if (getXpCoins() < price) return false;
  if (!spendXpCoins(price, 'perk_pack')) return false;
  addPerkCharges(id, PERK_PACK_QTY);
  return true;
}

/** Spend coins for 10 of every perk. */
export function buyUltimatePerkBundle(): boolean {
  if (getXpCoins() < PERK_BUNDLE_PRICE) return false;
  if (!spendXpCoins(PERK_BUNDLE_PRICE, 'perk_bundle')) return false;
  const cur = read();
  write({
    double_draft: cur.double_draft + PERK_BUNDLE_QTY,
    xray: cur.xray + PERK_BUNDLE_QTY,
    player_swap: cur.player_swap + PERK_BUNDLE_QTY,
  });
  return true;
}

/** Consume one stored charge. Returns false if none left. */
export function consumePerkCharge(id: PerkId): boolean {
  const cur = read();
  if ((cur[id] ?? 0) <= 0) return false;
  write({ ...cur, [id]: cur[id] - 1 });
  return true;
}
