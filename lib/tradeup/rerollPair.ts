/**
 * Team/Era one-sided reroll pair selection (Classic booth + header).
 */

import type { DecadeEra, SpinPair } from '@/lib/tradeup/billionDollar';
import type { TeamInfo } from '@/lib/tradeup/types';

export type TicketRerollKind = 'team' | 'era';

export function uniqueTeams(pairs: SpinPair[]): TeamInfo[] {
  const seen = new Set<string>();
  const out: TeamInfo[] = [];
  for (const p of pairs) {
    if (seen.has(p.team.id)) continue;
    seen.add(p.team.id);
    out.push(p.team);
  }
  return out;
}

export function erasForTeam(pairs: SpinPair[], teamId: string): DecadeEra[] {
  const seen = new Set<string>();
  const out: DecadeEra[] = [];
  for (const p of pairs) {
    if (p.team.id !== teamId || seen.has(p.era)) continue;
    seen.add(p.era);
    out.push(p.era);
  }
  return out;
}

export function pickRerollPair(
  pairs: SpinPair[],
  locked: SpinPair,
  kind: TicketRerollKind,
): SpinPair {
  if (kind === 'team') {
    // Prefer teams that can keep the same era so the era reel stays truthful.
    const allTeams = uniqueTeams(pairs).filter((t) => t.id !== locked.team.id);
    const sameEraPool = allTeams.filter((t) =>
      erasForTeam(pairs, t.id).includes(locked.era),
    );
    const pool = sameEraPool.length > 0 ? sameEraPool : allTeams;
    if (pool.length === 0) return locked;
    const team = pool[Math.floor(Math.random() * pool.length)]!;
    const eras = erasForTeam(pairs, team.id);
    const era = eras.includes(locked.era)
      ? locked.era
      : (eras[Math.floor(Math.random() * eras.length)] ?? locked.era);
    return { team, era };
  }

  const otherEras = erasForTeam(pairs, locked.team.id).filter((e) => e !== locked.era);
  if (otherEras.length === 0) return locked;
  const era = otherEras[Math.floor(Math.random() * otherEras.length)]!;
  return { team: locked.team, era };
}

/** Null when no alternate Team/Era exists — callers must not charge a reroll. */
export function resolveRerollPair(
  pairs: SpinPair[],
  locked: SpinPair,
  kind: TicketRerollKind,
): SpinPair | null {
  const next = pickRerollPair(pairs, locked, kind);
  if (next.team.id === locked.team.id && next.era === locked.era) return null;
  return next;
}
