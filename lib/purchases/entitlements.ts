/**
 * Local shop entitlements (remove ads, premium, Pro subscription window).
 *
 * Coin balances live in XP storage (`grantXpCoins`). Entitlement flags here are
 * device-local mirrors applied only after server-verified purchases — never from
 * a client-side “fake grant” or catalog lookup alone.
 */

import { grantXpCoins } from '@/lib/tradeup/xp/storage';

export const SHOP_ENTITLEMENTS_KEY = 'oneb_shop_entitlements_v1';

export interface ShopEntitlements {
  removeAds: boolean;
  premium: boolean;
  /** ISO-8601 string or epoch ms; Pro is active while this is in the future. */
  proActiveUntil: string | number | null;
}

export interface VerifiedPurchaseResult {
  productId?: string;
  /** Coins the server authorized for this transaction (may be 0). */
  coins?: number;
  removeAds?: boolean;
  premium?: boolean;
  /** ISO or ms; clears Pro when null/omitted with no update. */
  proActiveUntil?: string | number | null;
}

export type RestorePurchasesResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'error' };

const EMPTY: ShopEntitlements = {
  removeAds: false,
  premium: false,
  proActiveUntil: null,
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function read(): ShopEntitlements {
  if (!canUseStorage()) return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(SHOP_ENTITLEMENTS_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<ShopEntitlements>;
    return {
      removeAds: parsed.removeAds === true,
      premium: parsed.premium === true,
      proActiveUntil:
        typeof parsed.proActiveUntil === 'string' || typeof parsed.proActiveUntil === 'number'
          ? parsed.proActiveUntil
          : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(next: ShopEntitlements): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(SHOP_ENTITLEMENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / privacy */
  }
}

export function getShopEntitlements(): ShopEntitlements {
  return read();
}

export function hasRemoveAds(): boolean {
  return read().removeAds === true;
}

export function hasPremium(): boolean {
  return read().premium === true;
}

function proUntilMs(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function hasProActive(nowMs: number = Date.now()): boolean {
  const until = proUntilMs(read().proActiveUntil);
  return until != null && until > nowMs;
}

/**
 * Whether forced interstitial / rewarded prompts should be suppressed.
 *
 * Ads are not wired yet (no ad SDK in the app). Until an SDK is present this
 * always returns true. When an SDK exists, suppress only if the player has
 * remove-ads, premium, or an active Pro subscription.
 */
export function shouldSuppressForcedAds(): boolean {
  // No ad SDK shipped — treat as “nothing to show.”
  if (!hasAdSdk()) return true;
  return hasRemoveAds() || hasPremium() || hasProActive();
}

/** Best-effort: true only if a known ad bridge is registered. */
function hasAdSdk(): boolean {
  if (typeof window === 'undefined') return false;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
    ?.Plugins;
  if (!plugins) return false;
  return Boolean(plugins.OnebAds || plugins.AdMob || plugins.Ads);
}

/**
 * Apply a server-verified purchase. Call only after `iap-purchase` (or equivalent)
 * returns ok — never from StoreKit success alone or catalog amounts.
 */
export function applyVerifiedPurchase(result: VerifiedPurchaseResult): ShopEntitlements {
  const current = read();
  const next: ShopEntitlements = { ...current };

  if (result.removeAds === true) next.removeAds = true;
  if (result.premium === true) next.premium = true;
  if (result.proActiveUntil !== undefined) {
    next.proActiveUntil = result.proActiveUntil;
  }

  write(next);

  const coins = typeof result.coins === 'number' ? result.coins : 0;
  if (coins > 0) {
    grantXpCoins(coins);
  }

  return next;
}

interface IapRestorePlugin {
  restorePurchases?(): Promise<unknown>;
  restore?(): Promise<unknown>;
}

/**
 * Stub restore: invokes the native IAP plugin when present.
 * Does not invent entitlements — the plugin / subsequent sync must verify.
 */
export async function restorePurchases(): Promise<RestorePurchasesResult> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unavailable' };
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
    ?.Plugins;
  const store = (plugins?.OnebIapStore ?? plugins?.OnebKeyStore) as IapRestorePlugin | undefined;
  const restoreFn =
    store && typeof store.restorePurchases === 'function'
      ? store.restorePurchases.bind(store)
      : store && typeof store.restore === 'function'
        ? store.restore.bind(store)
        : null;
  if (!restoreFn) return { ok: false, reason: 'unavailable' };
  try {
    await restoreFn();
    return { ok: true };
  } catch (err) {
    console.error('[iap] restore failed', err);
    return { ok: false, reason: 'error' };
  }
}
