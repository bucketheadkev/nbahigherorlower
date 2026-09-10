/**
 * 1V1 game-mode catalog — single source of truth for mode metadata.
 * Classic single-player is unrelated and must not import this for gating.
 *
 * This release ships free Classic 1V1 only. Other mode ids remain parseable
 * for older room payloads but are not hostable and have no IAP / purchase path.
 */

export type H2HGameMode = 'classic' | 'bounty' | 'tradeUp' | 'knockout';

export interface H2HModeDefinition {
  id: H2HGameMode;
  title: string;
  tagline: string;
  free: boolean;
  accent: string;
  /** Visible in catalog metadata only; not selectable. */
  comingSoon?: boolean;
}

/** Tunable Trade Up attempt count — change here only. */
export const TRADE_UP_ATTEMPTS = 7;

/** Low-tier starting-player pool ceiling for Trade Up (inclusive). */
export const TRADE_UP_STARTER_MAX_DOLLARS = 25_000_000;

/** Knockout first-to-N position wins. */
export const KNOCKOUT_WINS_TO_FINISH = 3;

export const H2H_MODE_DEFS: readonly H2HModeDefinition[] = [
  {
    id: 'classic',
    title: 'CLASSIC',
    tagline: 'Build your five. Higher total value wins.',
    free: true,
    accent: '#29e490',
  },
  {
    id: 'knockout',
    title: 'KNOCKOUT',
    tagline: 'Coming soon',
    free: true,
    accent: '#ff6a00',
    comingSoon: true,
  },
  {
    id: 'bounty',
    title: 'BOUNTY',
    tagline: 'Coming soon',
    free: true,
    accent: '#5b8cff',
    comingSoon: true,
  },
  {
    id: 'tradeUp',
    title: 'TRADE UP',
    tagline: 'Coming soon',
    free: true,
    accent: '#f0b429',
    comingSoon: true,
  },
] as const;

/** Modes hosts can pick today (excludes coming-soon placeholders). */
export function hostableH2HModes(): H2HModeDefinition[] {
  return H2H_MODE_DEFS.filter((m) => !m.comingSoon);
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
