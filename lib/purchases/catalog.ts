/**
 * Shop IAP catalog (display prices + product id placeholders).
 * Live App Store prices come from StoreKit when the native bridge is present;
 * these strings are catalog / UI fallbacks only — never treat them as a grant signal.
 */

export type ShopProductKind = 'coins' | 'remove_ads' | 'premium' | 'pro_monthly' | 'pro_yearly';

export interface ShopCatalogProduct {
  productId: string;
  kind: ShopProductKind;
  /** Catalog display price (USD string). Prefer StoreKit `displayPrice` when available. */
  displayPrice: string;
  /** Coins granted on a verified purchase (packs) or as a one-time / renewal bonus. */
  coins?: number;
  /** Human label for UI (optional). */
  title: string;
  /** Permanent unlock vs auto-renewing subscription. */
  billing: 'consumable' | 'non_consumable' | 'subscription';
}

/** Rewarded-ad placeholder — UI only until an ad SDK is wired. */
export const WATCH_AD_COINS = 50;

/** Coin packs: price → coin amount. ($0.99 pack removed.) */
export const COIN_PACKS: readonly ShopCatalogProduct[] = [
  {
    productId: 'com.1brun.coins.600',
    kind: 'coins',
    displayPrice: '$2.99',
    coins: 600,
    title: '600 Coins',
    billing: 'consumable',
  },
  {
    productId: 'com.1brun.coins.1200',
    kind: 'coins',
    displayPrice: '$4.99',
    coins: 1200,
    title: '1,200 Coins',
    billing: 'consumable',
  },
  {
    productId: 'com.1brun.coins.2600',
    kind: 'coins',
    displayPrice: '$9.99',
    coins: 2600,
    title: '2,600 Coins',
    billing: 'consumable',
  },
  {
    productId: 'com.1brun.coins.6000',
    kind: 'coins',
    displayPrice: '$19.99',
    coins: 6000,
    title: '6,000 Coins',
    billing: 'consumable',
  },
  {
    productId: 'com.1brun.coins.17000',
    kind: 'coins',
    displayPrice: '$49.99',
    coins: 17000,
    title: '17,000 Coins',
    billing: 'consumable',
  },
] as const;

/** Permanent remove-ads unlock. */
export const REMOVE_ADS_PRODUCT: ShopCatalogProduct = {
  productId: 'com.1brun.removeads',
  kind: 'remove_ads',
  displayPrice: '$7.99',
  title: 'Remove Ads',
  billing: 'non_consumable',
};

/**
 * Premium: permanent. Entitlement flags premium (multiplayer access may already exist
 * elsewhere — this only records the purchase flag). Includes 500 coins on verified buy.
 */
export const PREMIUM_PRODUCT: ShopCatalogProduct = {
  productId: 'com.1brun.premium',
  kind: 'premium',
  displayPrice: '$9.99',
  coins: 500,
  title: 'Premium',
  billing: 'non_consumable',
};

/** Pro monthly: 750 coins on verified renew / purchase; no forced ads while active. */
export const PRO_MONTHLY_PRODUCT: ShopCatalogProduct = {
  productId: 'com.1brun.pro.monthly',
  kind: 'pro_monthly',
  displayPrice: '$5.99',
  coins: 750,
  title: 'Pro Monthly',
  billing: 'subscription',
};

/** Pro yearly: same Pro entitlement window as server reports; catalog price only. */
export const PRO_YEARLY_PRODUCT: ShopCatalogProduct = {
  productId: 'com.1brun.pro.yearly',
  kind: 'pro_yearly',
  displayPrice: '$49.99',
  coins: 750,
  title: 'Pro Yearly',
  billing: 'subscription',
};

export const SHOP_CATALOG: readonly ShopCatalogProduct[] = [
  ...COIN_PACKS,
  REMOVE_ADS_PRODUCT,
  PREMIUM_PRODUCT,
  PRO_MONTHLY_PRODUCT,
  PRO_YEARLY_PRODUCT,
];

const BY_ID = new Map(SHOP_CATALOG.map((p) => [p.productId, p]));

export function shopProductById(productId: string): ShopCatalogProduct | undefined {
  return BY_ID.get(productId);
}

export function coinPacks(): readonly ShopCatalogProduct[] {
  return COIN_PACKS;
}
