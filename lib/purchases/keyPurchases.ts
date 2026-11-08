/**
 * Instant-unlock keys: consumable App Store purchases that finish an earned chest's timer.
 * Keys never create chests or players, never change odds, and can't be bought with Bank money.
 *
 * Feature-gated: the shop exists only when ALL of these hold, so production users never see a
 * button that can't work:
 *   1. NEXT_PUBLIC_KEY_PRODUCTS lists App Store Connect product ids, e.g.
 *        [{"productId":"com.example.keys.1","keys":1}]
 *      (each must also be an active row in public.dynasty_key_products on the server);
 *   2. the app runs inside the iOS shell (lib/platform/isNativeApp);
 *   3. a StoreKit bridge plugin named `OnebKeyStore` is registered with Capacitor;
 *   4. the player is signed in (keys live on the account).
 *
 * Purchase flow (Apple's recommended server-validated consumable flow):
 *   purchase with appAccountToken = account id
 *   → send the transaction id to the `key-purchase` Edge Function, which fetches the signed
 *     transaction from the App Store Server API, checks bundle/product/account/revocation, and
 *     grants keys once per transaction id
 *   → only then finish the transaction. An unfinished transaction (app closed, network lost) is
 *     re-sent on the next launch by syncPendingKeyPurchases, and the server ignores repeats.
 * Refunds arrive as App Store Server Notifications (same Edge Function) and take the keys back.
 */

import { isNativeApp } from '@/lib/platform/isNativeApp';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export interface KeyProductConfig {
  productId: string;
  keys: number;
}

export interface KeyProduct extends KeyProductConfig {
  /** Localized price string from the App Store, never hard-coded. */
  displayPrice: string;
}

/** Native bridge contract (StoreKit 2). Not bundled yet; see the setup notes in the summary. */
interface KeyStorePlugin {
  getProducts(options: { productIds: string[] }): Promise<{ products: { productId: string; displayPrice: string }[] }>;
  purchase(options: { productId: string; appAccountToken: string }): Promise<{
    status: 'purchased' | 'cancelled' | 'pending';
    transactionId?: string;
  }>;
  unfinishedTransactions(): Promise<{ transactions: { transactionId: string; productId: string }[] }>;
  finish(options: { transactionId: string }): Promise<void>;
}

export function keyProductConfig(): KeyProductConfig[] {
  try {
    const raw = process.env.NEXT_PUBLIC_KEY_PRODUCTS?.trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is KeyProductConfig => typeof p?.productId === 'string' && Number.isInteger(p?.keys) && p.keys > 0)
      .map((p) => ({ productId: p.productId, keys: p.keys }));
  } catch {
    return [];
  }
}

function plugin(): KeyStorePlugin | null {
  if (!isNativeApp() || typeof window === 'undefined') return null;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  const p = plugins?.OnebKeyStore as KeyStorePlugin | undefined;
  return p && typeof p.purchase === 'function' ? p : null;
}

/** True only when a real purchase can complete on this device. */
export function keyShopConfigured(): boolean {
  return keyProductConfig().length > 0 && plugin() != null;
}

export async function loadKeyProducts(): Promise<KeyProduct[]> {
  const store = plugin();
  const config = keyProductConfig();
  if (!store || config.length === 0) return [];
  try {
    const { products } = await store.getProducts({ productIds: config.map((p) => p.productId) });
    const price = new Map(products.map((p) => [p.productId, p.displayPrice]));
    // Only products the App Store actually returned (approved and available) are shown.
    return config.filter((p) => price.has(p.productId)).map((p) => ({ ...p, displayPrice: price.get(p.productId)! }));
  } catch (err) {
    console.error('[keys] product load failed', err);
    return [];
  }
}

export type KeyPurchaseResult =
  | { ok: true; keys: number; reason?: undefined }
  | { ok: false; reason: 'cancelled' | 'pending' | 'unavailable' | 'verify_failed' | 'error'; keys?: undefined };

async function verify(transactionId: string): Promise<{ ok: boolean; keys?: number }> {
  const { data, error } = await getSupabaseBrowserClient().functions.invoke('key-purchase', {
    body: { transactionId },
  });
  if (error) return { ok: false };
  const r = (data ?? {}) as { ok?: boolean; keys?: number };
  return { ok: r.ok === true, keys: typeof r.keys === 'number' ? r.keys : undefined };
}

export async function buyKeys(productId: string, accountId: string): Promise<KeyPurchaseResult> {
  const store = plugin();
  if (!store) return { ok: false, reason: 'unavailable' };
  try {
    const res = await store.purchase({ productId, appAccountToken: accountId });
    if (res.status === 'cancelled') return { ok: false, reason: 'cancelled' };
    if (res.status === 'pending' || !res.transactionId) return { ok: false, reason: 'pending' };
    const checked = await verify(res.transactionId);
    // Leave the transaction unfinished on failure: StoreKit redelivers it and the next sync retries.
    if (!checked.ok) return { ok: false, reason: 'verify_failed' };
    await store.finish({ transactionId: res.transactionId });
    return { ok: true, keys: checked.keys ?? 0 };
  } catch (err) {
    console.error('[keys] purchase failed', err);
    return { ok: false, reason: 'error' };
  }
}

/** Re-sends purchases that were paid but never confirmed (app closed, network lost). */
export async function syncPendingKeyPurchases(): Promise<number> {
  const store = plugin();
  if (!store || keyProductConfig().length === 0) return 0;
  let granted = 0;
  try {
    const { transactions } = await store.unfinishedTransactions();
    for (const t of transactions) {
      const checked = await verify(t.transactionId);
      if (checked.ok) {
        await store.finish({ transactionId: t.transactionId });
        granted += 1;
      }
    }
  } catch (err) {
    console.error('[keys] pending sync failed', err);
  }
  return granted;
}
