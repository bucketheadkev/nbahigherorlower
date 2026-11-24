/**
 * Shop-purchased perk charges.
 * Permanent accounts: prefer server-atomic coin_buy_perk_* (debit + inventory).
 * Guests / missing RPC: localStorage + local coin spend.
 */

import { COINS_PERK_COST, getXpCoins, spendXpCoins, setXpCoins } from '@/lib/tradeup/xp';
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

/** Ultimate bundle: 10 of each perk at 3,000 (~19% off 3,700). */
export const PERK_BUNDLE_PRICE = 3000;

export type PerkInventory = Record<PerkId, number>;

/** Safe SSR / pre-hydration default — never read storage into initial React state. */
export const EMPTY_PERK_INVENTORY: PerkInventory = {
  double_draft: 0,
  xray: 0,
  player_swap: 0,
};

const EMPTY = EMPTY_PERK_INVENTORY;

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

function requestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function applyServerInventory(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const o = raw as Record<string, unknown>;
  write({
    double_draft: Math.max(0, Math.floor(Number(o.double_draft) || 0)),
    xray: Math.max(0, Math.floor(Number(o.xray) || 0)),
    player_swap: Math.max(0, Math.floor(Number(o.player_swap) || 0)),
  });
}

function buyLocalPack(id: PerkId, req: string): boolean {
  const price = PERK_PACK_PRICE[id] ?? COINS_PERK_COST * PERK_PACK_QTY;
  if (!spendXpCoins(price, `perk_pack:${id}:${req}`)) return false;
  addPerkCharges(id, PERK_PACK_QTY);
  return true;
}

function buyLocalBundle(req: string): boolean {
  if (!spendXpCoins(PERK_BUNDLE_PRICE, `perk_bundle:${req}`)) return false;
  const cur = read();
  write({
    double_draft: cur.double_draft + PERK_BUNDLE_QTY,
    xray: cur.xray + PERK_BUNDLE_QTY,
    player_swap: cur.player_swap + PERK_BUNDLE_QTY,
  });
  return true;
}

/**
 * Spend coins for a pack. Uses server RPC when available (atomic debit+stock);
 * otherwise local guest path.
 */
export function buyPerkPack(id: PerkId): boolean {
  const price = PERK_PACK_PRICE[id] ?? COINS_PERK_COST * PERK_PACK_QTY;
  if (getXpCoins() < price) return false;
  const req = requestId();

  // Fire-and-forget server path; optimistic local only if RPC missing.
  void (async () => {
    try {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase/client');
      const { isPermanentAuthUser } = await import('@/lib/account/userKind');
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;
      if (!user || !isPermanentAuthUser(user)) {
        buyLocalPack(id, req);
        return;
      }
      const { data, error } = await supabase.rpc('coin_buy_perk_pack', {
        p_perk: id,
        p_request_id: req,
      });
      if (error) {
        if (error.code === 'PGRST202' || error.code === '42883') {
          buyLocalPack(id, req);
          return;
        }
        console.warn('[perks] buy pack', error.message);
        return;
      }
      applyServerInventory(data);
      const { data: bal } = await supabase.rpc('get_my_coin_balance');
      if (typeof bal === 'number') setXpCoins(bal);
      else void import('@/lib/tradeup/xp/cloudCoins').then((m) => m.syncCloudCoinsIntoLocal());
    } catch {
      buyLocalPack(id, req);
    }
  })();

  // Optimistic UI only — ref is not allowlisted for spend_my_coins, so no double debit.
  // Server coin_buy_perk_pack owns the real ledger spend; syncCloudCoins aligns balance.
  if (!spendXpCoins(price, `local_ui:perk_pack:${id}:${req}`)) return false;
  addPerkCharges(id, PERK_PACK_QTY);
  return true;
}

/** Spend coins for 10 of every perk. */
export function buyUltimatePerkBundle(): boolean {
  if (getXpCoins() < PERK_BUNDLE_PRICE) return false;
  const req = requestId();

  void (async () => {
    try {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase/client');
      const { isPermanentAuthUser } = await import('@/lib/account/userKind');
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;
      if (!user || !isPermanentAuthUser(user)) {
        buyLocalBundle(req);
        return;
      }
      const { data, error } = await supabase.rpc('coin_buy_perk_bundle', {
        p_request_id: req,
      });
      if (error) {
        if (error.code === 'PGRST202' || error.code === '42883') {
          buyLocalBundle(req);
          return;
        }
        console.warn('[perks] buy bundle', error.message);
        return;
      }
      applyServerInventory(data);
      const { data: bal } = await supabase.rpc('get_my_coin_balance');
      if (typeof bal === 'number') setXpCoins(bal);
      else void import('@/lib/tradeup/xp/cloudCoins').then((m) => m.syncCloudCoinsIntoLocal());
    } catch {
      buyLocalBundle(req);
    }
  })();

  if (!spendXpCoins(PERK_BUNDLE_PRICE, `local_ui:perk_bundle:${req}`)) return false;
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
