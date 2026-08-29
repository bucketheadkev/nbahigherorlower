/**
 * Centralized 1V1 entitlements.
 *
 * Production path: replace DevEntitlementStore with verified Apple StoreKit receipts.
 * Do NOT treat localStorage as secure proof of purchase in production.
 */

'use client';

import {
  H2H_PRODUCT_IDS,
  type H2HGameMode,
  type H2HPaidGameMode,
  type H2HProductId,
  productIdForMode,
} from './gameModes';

export interface H2HEntitlements {
  allModes: boolean;
  bounty: boolean;
  tradeUp: boolean;
  knockout: boolean;
  future: boolean;
}

const EMPTY: H2HEntitlements = {
  allModes: false,
  bounty: false,
  tradeUp: false,
  knockout: false,
  future: false,
};

const STORAGE_KEY = 'ballion_h2h_entitlements_dev_v1';

/**
 * DEV-ONLY mock store. Isolated so StoreKit can replace it later.
 * Never expose a permanent "unlock everything" control in production UI.
 */
class DevEntitlementStore {
  private cache: H2HEntitlements | null = null;

  read(): H2HEntitlements {
    if (this.cache) return this.cache;
    if (typeof window === 'undefined') return { ...EMPTY };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.cache = { ...EMPTY };
        return this.cache;
      }
      const parsed = JSON.parse(raw) as Partial<H2HEntitlements>;
      this.cache = {
        allModes: Boolean(parsed.allModes),
        bounty: Boolean(parsed.bounty),
        tradeUp: Boolean(parsed.tradeUp),
        knockout: Boolean(parsed.knockout),
        future: Boolean(parsed.future),
      };
      return this.cache;
    } catch {
      this.cache = { ...EMPTY };
      return this.cache;
    }
  }

  write(next: H2HEntitlements): void {
    this.cache = { ...next };
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
    } catch {
      /* ignore */
    }
  }

  grant(productId: H2HProductId): H2HEntitlements {
    const cur = this.read();
    const next = { ...cur };
    switch (productId) {
      case H2H_PRODUCT_IDS.allModes:
        next.allModes = true;
        next.bounty = true;
        next.tradeUp = true;
        next.knockout = true;
        next.future = true;
        break;
      case H2H_PRODUCT_IDS.bounty:
        next.bounty = true;
        break;
      case H2H_PRODUCT_IDS.tradeUp:
        next.tradeUp = true;
        break;
      case H2H_PRODUCT_IDS.knockout:
        next.knockout = true;
        break;
      case H2H_PRODUCT_IDS.future:
        next.future = true;
        break;
    }
    this.write(next);
    return next;
  }
}

const store = new DevEntitlementStore();

export function getH2HEntitlements(): H2HEntitlements {
  return store.read();
}

export function ownsH2HMode(mode: H2HGameMode, ents: H2HEntitlements = getH2HEntitlements()): boolean {
  if (mode === 'classic') return true;
  if (ents.allModes) return true;
  switch (mode) {
    case 'bounty':
      return ents.bounty;
    case 'tradeUp':
      return ents.tradeUp;
    case 'knockout':
      return ents.knockout;
  }
}

/** Host-only gate. Guests joining a paid lobby must NEVER be blocked by this. */
export function canHostH2HMode(
  mode: H2HGameMode,
  ents: H2HEntitlements = getH2HEntitlements(),
): boolean {
  return ownsH2HMode(mode, ents);
}

/**
 * Development purchase stub — simulates a successful non-consumable unlock.
 * Replace body with StoreKit purchase + server receipt verification.
 */
export async function purchaseH2HProduct(
  productId: H2HProductId,
): Promise<{ ok: true; entitlements: H2HEntitlements }> {
  await new Promise((r) => window.setTimeout(r, 450));
  const entitlements = store.grant(productId);
  return { ok: true, entitlements };
}

export async function purchaseH2HMode(
  mode: H2HPaidGameMode,
): Promise<{ ok: true; entitlements: H2HEntitlements }> {
  return purchaseH2HProduct(productIdForMode(mode));
}

export async function purchaseUnlockAll(): Promise<{
  ok: true;
  entitlements: H2HEntitlements;
}> {
  return purchaseH2HProduct(H2H_PRODUCT_IDS.allModes);
}

/** Restore Purchases stub — later: AppStore.sync() / restoreCompletedTransactions. */
export async function restoreH2HPurchases(): Promise<H2HEntitlements> {
  await new Promise((r) => window.setTimeout(r, 350));
  return getH2HEntitlements();
}

/** Test helper only — not wired into production UI. */
export function __devResetH2HEntitlements(): void {
  store.write({ ...EMPTY });
}
