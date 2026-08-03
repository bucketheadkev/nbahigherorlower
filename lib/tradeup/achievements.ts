/** Persistent championship rings — perfect seasons and playoff titles. */

export type ChampionshipKind = 'perfect_season' | 'nba_champion';

export interface ChampionshipRing {
  id: string;
  /** ISO timestamp when the title was earned. */
  earnedAt: string;
  /** Starting five names, PG → C order. */
  lineup: string[];
  wins: number;
  losses: number;
  kind: ChampionshipKind;
  /** Historical opponents beaten en route (playoff titles). */
  path?: string[];
}

const RINGS_KEY = 'tradeup_championship_rings_v1';

function isRing(value: unknown): value is ChampionshipRing {
  if (!value || typeof value !== 'object') return false;
  const ring = value as Partial<ChampionshipRing>;
  if (
    typeof ring.id !== 'string' ||
    typeof ring.earnedAt !== 'string' ||
    !Array.isArray(ring.lineup) ||
    !ring.lineup.every((name) => typeof name === 'string') ||
    typeof ring.wins !== 'number' ||
    typeof ring.losses !== 'number'
  ) {
    return false;
  }
  // Legacy perfect-season rings omitted `kind`.
  if (ring.kind == null && ring.wins === 82 && ring.losses === 0) return true;
  return ring.kind === 'perfect_season' || ring.kind === 'nba_champion';
}

function normalizeRing(ring: ChampionshipRing): ChampionshipRing {
  if (ring.kind) return ring;
  return { ...ring, kind: 'perfect_season' };
}

export function getChampionshipRings(): ChampionshipRing[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRing)
      .map(normalizeRing)
      .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
  } catch {
    return [];
  }
}

export function getChampionshipRingCount(): number {
  return getChampionshipRings().length;
}

function persistRing(ring: ChampionshipRing): ChampionshipRing {
  const next = [ring, ...getChampionshipRings()];
  localStorage.setItem(RINGS_KEY, JSON.stringify(next));
  return ring;
}

/** Award one ring for an 82–0 season. Returns the new ring, or null if not perfect. */
export function awardPerfectSeasonRing(lineupNames: string[]): ChampionshipRing | null {
  if (typeof window === 'undefined') return null;
  const lineup = lineupNames.map((name) => name.trim()).filter(Boolean).slice(0, 5);
  if (lineup.length !== 5) return null;

  const ring: ChampionshipRing = {
    id: `ring_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    earnedAt: new Date().toISOString(),
    lineup,
    wins: 82,
    losses: 0,
    kind: 'perfect_season',
  };

  return persistRing(ring);
}

/** Award a ring for winning the NBA Finals in the playoff run. */
export function awardNbaChampionshipRing(input: {
  lineupNames: string[];
  seasonWins: number;
  seasonLosses: number;
  path: string[];
}): ChampionshipRing | null {
  if (typeof window === 'undefined') return null;
  const lineup = input.lineupNames.map((name) => name.trim()).filter(Boolean).slice(0, 5);
  if (lineup.length !== 5) return null;

  const ring: ChampionshipRing = {
    id: `champ_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    earnedAt: new Date().toISOString(),
    lineup,
    wins: input.seasonWins,
    losses: input.seasonLosses,
    kind: 'nba_champion',
    path: input.path,
  };

  return persistRing(ring);
}

export function buildPerfectSeasonShareText(lineup: string[]): string {
  const names = lineup.join(' · ');
  return [
    'Trade Up — PERFECT SEASON',
    '82–0',
    names,
    'Championship ring earned.',
    'Chase 82–0.',
  ].join('\n');
}
