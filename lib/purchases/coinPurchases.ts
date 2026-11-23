/**
 * Shop coin / entitlement IAPs: consumables + non-consumables + subscriptions.
 *
 * Feature-gated: shopConfigured is true only when:
 *   1. NEXT_PUBLIC_COIN_PRODUCTS or ONEB_IAP_PRODUCTS lists product ids, e.g.
 *        [{"productId":"com.1brun.coins.200"}]
 *      (ids should match App Store Connect + lib/purchases/catalog.ts);
 *   2. a StoreKit bridge plugin named `OnebIapStore` (preferred) or `OnebKeyStore`
 *      is registered with Capacitor.
 *
 * Purchase flow (server-validated):
 *   purchase with appAccountToken = account id
 *   → send transaction id to the `iap-purchase` Edge Function
 *   → only on verified ok: applyVerifiedPurchase (coins + entitlements)
 *   → then finish the transaction
 *
 * NEVER grant coins or entitlements without verified ok. If the edge function is
 * missing or returns an error, return verify_failed and leave the transaction
 * unfinished for syncPendingPurchases.
 */

import { isNativeApp } from '@/lib/platform/isNativeApp';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { shopProductById, type ShopCatalogProduct } from '@/lib/purchases/catalog';
import { applyVerifiedPurchase, type VerifiedPurchaseResult } from '@/lib/purchases/entitlements';

export interface CoinProductConfig {
  productId: string;
}

export interface CoinProduct extends CoinProductConfig {
  /** Localized price from the App Store when available; else catalog fallback. */
  displayPrice: string;
  catalog?: ShopCatalogProduct;
}

interface IapStorePlugin {
  getProducts(options: { productIds: string[] }): Promise<{ products: { productId: string; displayPrice: string }[] }>;
  purchase(options: { productId: string; appAccountToken: string }): Promise<{
    status: 'purchased' | 'cancelled' | 'pending';
    transactionId?: string;
  }>;
  unfinishedTransactions(): Promise<{ transactions: { transactionId: string; productId: string }[] }>;
  finish(options: { transactionId: string }): Promise<void>;
}

function parseProductEnv(raw: string | undefined): CoinProductConfig[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p): CoinProductConfig | null => {
        if (typeof p === 'string' && p.trim()) return { productId: p.trim() };
        if (p && typeof p === 'object' && typeof (p as { productId?: unknown }).productId === 'string') {
          return { productId: (p as { productId: string }).productId };
        }
        return null;
      })
      .filter((p): p is CoinProductConfig => p != null && p.productId.length > 0);
  } catch {
    return [];
  }
}

/** Product ids enabled via env (App Store Connect live set). */
export function coinProductConfig(): CoinProductConfig[] {
  const fromPublic = parseProductEnv(process.env.NEXT_PUBLIC_COIN_PRODUCTS);
  if (fromPublic.length > 0) return fromPublic;
  return parseProductEnv(process.env.ONEB_IAP_PRODUCTS);
}

function plugin(): IapStorePlugin | null {
  if (!isNativeApp() || typeof window === 'undefined') return null;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  const iap = plugins?.OnebIapStore as IapStorePlugin | undefined;
  if (iap && typeof iap.purchase === 'function') return iap;
  const keys = plugins?.OnebKeyStore as IapStorePlugin | undefined;
  return keys && typeof keys.purchase === 'function' ? keys : null;
}

/** True only when a real purchase can complete on this device. */
export function shopConfigured(): boolean {
  return coinProductConfig().length > 0 && plugin() != null;
}

export async function loadCoinProducts(): Promise<CoinProduct[]> {
  const store = plugin();
  const config = coinProductConfig();
  if (!store || config.length === 0) return [];
  try {
    const { products } = await store.getProducts({ productIds: config.map((p) => p.productId) });
    const price = new Map(products.map((p) => [p.productId, p.displayPrice]));
    return config
      .filter((p) => price.has(p.productId))
      .map((p) => {
        const catalog = shopProductById(p.productId);
        return {
          productId: p.productId,
          displayPrice: price.get(p.productId)!,
          catalog,
        };
      });
  } catch (err) {
    console.error('[iap] product load failed', err);
    return [];
  }
}

export type CoinPurchaseResult =
  | { ok: true; coins: number; reason?: undefined }
  | { ok: false; reason: 'cancelled' | 'pending' | 'unavailable' | 'verify_failed' | 'error'; coins?: undefined };

interface VerifyResponse extends VerifiedPurchaseResult {
  ok?: boolean;
}

async function verify(transactionId: string): Promise<{ ok: boolean; grant?: VerifiedPurchaseResult }> {
  try {
    const { data, error } = await getSupabaseBrowserClient().functions.invoke('iap-purchase', {
      body: { transactionId },
    });
    // Missing function / network / non-2xx → do not grant.
    if (error) return { ok: false };
    const r = (data ?? {}) as VerifyResponse;
    if (r.ok !== true) return { ok: false };
    return {
      ok: true,
      grant: {
        productId: typeof r.productId === 'string' ? r.productId : undefined,
        coins: typeof r.coins === 'number' ? r.coins : 0,
        removeAds: r.removeAds === true ? true : undefined,
        premium: r.premium === true ? true : undefined,
        proActiveUntil: r.proActiveUntil !== undefined ? r.proActiveUntil : undefined,
      },
    };
  } catch (err) {
    console.error('[iap] verify failed', err);
    return { ok: false };
  }
}

export async function buyProduct(productId: string, accountId: string): Promise<CoinPurchaseResult> {
  const store = plugin();
  if (!store) return { ok: false, reason: 'unavailable' };
  try {
    const res = await store.purchase({ productId, appAccountToken: accountId });
    if (res.status === 'cancelled') return { ok: false, reason: 'cancelled' };
    if (res.status === 'pending' || !res.transactionId) return { ok: false, reason: 'pending' };

    const checked = await verify(res.transactionId);
    // Leave unfinished on failure so StoreKit redelivers and sync can retry.
    if (!checked.ok || !checked.grant) return { ok: false, reason: 'verify_failed' };

    applyVerifiedPurchase(checked.grant);
    await store.finish({ transactionId: res.transactionId });
    return { ok: true, coins: checked.grant.coins ?? 0 };
  } catch (err) {
    console.error('[iap] purchase failed', err);
    return { ok: false, reason: 'error' };
  }
}

/** Re-sends purchases that were paid but never confirmed (app closed, network lost). */
export async function syncPendingPurchases(): Promise<number> {
  const store = plugin();
  if (!store || coinProductConfig().length === 0) return 0;
  let granted = 0;
  try {
    const { transactions } = await store.unfinishedTransactions();
    for (const t of transactions) {
      const checked = await verify(t.transactionId);
      if (checked.ok && checked.grant) {
        applyVerifiedPurchase(checked.grant);
        await store.finish({ transactionId: t.transactionId });
        granted += 1;
      }
    }
  } catch (err) {
    console.error('[iap] pending sync failed', err);
  }
  return granted;
}
