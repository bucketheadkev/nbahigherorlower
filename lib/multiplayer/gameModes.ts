/**
 * 1V1 game-mode catalog — single source of truth for mode metadata + IAP product IDs.
 * Classic single-player is unrelated and must not import this for gating.
 */

export type H2HGameMode = 'classic' | 'bounty' | 'tradeUp' | 'knockout';

/** Reserved for a future paid mode — not shown until designed. */
export type H2HFutureGameMode = 'future';

export type H2HPaidGameMode = Exclude<H2HGameMode, 'classic'>;

export type H2HProductId =
  | 'bounty_mode'
  | 'trade_up_mode'
  | 'knockout_mode'
  | 'future_mode'
  | 'all_modes';

export interface H2HModeDefinition {
  id: H2HGameMode;
  title: string;
  tagline: string;
  priceCents: number | null;
  productId: H2HProductId | null;
  free: boolean;
  accent: string;
  /** Visible but not selectable / purchasable yet. */
  comingSoon?: boolean;
}

/** Tunable Trade Up attempt count — change here only. */
export const TRADE_UP_ATTEMPTS = 7;

/** Low-tier starting-player pool ceiling for Trade Up (inclusive). */
export const TRADE_UP_STARTER_MAX_DOLLARS = 25_000_000;

/** Knockout first-to-N position wins. */
export const KNOCKOUT_WINS_TO_FINISH = 3;

export const H2H_PRODUCT_IDS = {
  bounty: 'bounty_mode' as const,
  tradeUp: 'trade_up_mode' as const,
  knockout: 'knockout_mode' as const,
  future: 'future_mode' as const,
  allModes: 'all_modes' as const,
};

export const H2H_MODE_DEFS: readonly H2HModeDefinition[] = [
  {
    id: 'classic',
    title: 'CLASSIC',
    tagline: 'Build your five. Higher total value wins.',
    priceCents: null,
    productId: null,
    free: true,
    accent: '#29e490',
  },
  {
    id: 'knockout',
    title: 'KNOCKOUT',
    tagline: 'Coming soon',
    priceCents: 199,
    productId: H2H_PRODUCT_IDS.knockout,
    free: false,
    accent: '#ff6a00',
    comingSoon: true,
  },
  {
    id: 'bounty',
    title: 'BOUNTY',
    tagline: 'Coming soon',
    priceCents: 199,
    productId: H2H_PRODUCT_IDS.bounty,
    free: false,
    accent: '#5b8cff',
    comingSoon: true,
  },
  {
    id: 'tradeUp',
    title: 'TRADE UP',
    tagline: 'Coming soon',
    priceCents: 199,
    productId: H2H_PRODUCT_IDS.tradeUp,
    free: false,
    accent: '#f0b429',
    comingSoon: true,
  },
] as const;

export const UNLOCK_ALL_PRICE_CENTS = 499;

/** Individual paid modes currently sellable (excludes unfinished Mode #5). */
export function paidModesForSale(): H2HModeDefinition[] {
  return H2H_MODE_DEFS.filter((m) => !m.free);
}

/** Modes hosts can pick today (excludes coming-soon placeholders). */
export function hostableH2HModes(): H2HModeDefinition[] {
  return H2H_MODE_DEFS.filter((m) => !m.comingSoon);
}

/**
 * Savings vs buying each paid mode individually.
 * Returns null until there are 4 paid $1.99 modes (do not claim 37% early).
 */
export function unlockAllSavingsPercent(): number | null {
  const paid = paidModesForSale();
  if (paid.length < 4) return null;
  const individual = paid.reduce((sum, m) => sum + (m.priceCents ?? 0), 0);
  if (individual <= 0) return null;
  return Math.round(((individual - UNLOCK_ALL_PRICE_CENTS) / individual) * 100);
}

export function modeDef(id: H2HGameMode): H2HModeDefinition {
  return H2H_MODE_DEFS.find((m) => m.id === id) ?? H2H_MODE_DEFS[0]!;
}

export function isH2HGameMode(value: unknown): value is H2HGameMode {
  return (
    value === 'classic' ||
    value === 'bounty' ||
    value === 'tradeUp' ||
    value === 'knockout'
  );
}

export function formatModePrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function productIdForMode(mode: H2HPaidGameMode): H2HProductId {
  switch (mode) {
    case 'bounty':
      return H2H_PRODUCT_IDS.bounty;
    case 'tradeUp':
      return H2H_PRODUCT_IDS.tradeUp;
    case 'knockout':
      return H2H_PRODUCT_IDS.knockout;
  }
}
