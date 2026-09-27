/**
 * 1V1 game-mode catalog — single source of truth for mode metadata.
 * Classic single-player is unrelated and must not import this for gating.
 *
 * Shared 1B Run visual identity applies to every mode; mode ids stay stable
 * for rooms/invites (`classic` = Standard 1v1 in the UI).
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
  /** Hostable only inside the native Capacitor app (not 1brun.com). */
  nativeOnly?: boolean;
}

/** Tunable Trade Up attempt count — change here only. */
export const TRADE_UP_ATTEMPTS = 7;

/** Low-tier starting-player pool ceiling for Trade Up (inclusive). */
export const TRADE_UP_STARTER_MAX_DOLLARS = 25_000_000;

/** Knockout first-to-N position wins. */
export const KNOCKOUT_WINS_TO_FINISH = 3;

/** Bounty multipliers — equal weight; server is authoritative. */
export const BOUNTY_MULTIPLIERS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type BountyMultiplier = (typeof BOUNTY_MULTIPLIERS)[number];

export const H2H_MODE_DEFS: readonly H2HModeDefinition[] = [
  {
    id: 'classic',
    title: 'STANDARD',
    tagline: 'Build your five. Higher total value wins.',
    free: true,
    accent: '#29e490',
  },
  {
    id: 'bounty',
    title: 'BOUNTY',
    tagline: 'One position. One multiplier. Same for both.',
    free: true,
    accent: '#2ad4a8',
    nativeOnly: true,
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
    id: 'tradeUp',
    title: 'TRADE UP',
    tagline: 'Coming soon',
    free: true,
    accent: '#f0b429',
    comingSoon: true,
  },
] as const;

export interface HostableH2HModesOptions {
  /** When true, include nativeOnly modes (Bounty). Default false. */
  native?: boolean;
}

/** Modes hosts can pick today (excludes coming-soon; respects native gate). */
export function hostableH2HModes(opts: HostableH2HModesOptions = {}): H2HModeDefinition[] {
  const native = Boolean(opts.native);
  return H2H_MODE_DEFS.filter((m) => {
    if (m.comingSoon) return false;
    if (m.nativeOnly && !native) return false;
    return true;
  });
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

export function isBountyMultiplier(value: unknown): value is BountyMultiplier {
  const n = typeof value === 'number' ? value : Number(value);
  return BOUNTY_MULTIPLIERS.includes(n as BountyMultiplier);
}
