/**
 * Conference seed + playoff / play-in berth from regular-season wins.
 * Single-team approximation of the NBA playoff structure.
 */

export type SeasonBerth = 'playoffs' | 'play_in' | 'missed';

export interface SeasonStanding {
  wins: number;
  losses: number;
  /** 1–10 when in the dance / play-in; null when lottery. */
  seed: number | null;
  berth: SeasonBerth;
}

export function deriveSeasonStanding(wins: number, losses = 82 - wins): SeasonStanding {
  let seed: number | null = null;
  if (wins >= 60) seed = 1;
  else if (wins >= 55) seed = 2;
  else if (wins >= 52) seed = 3;
  else if (wins >= 49) seed = 4;
  else if (wins >= 47) seed = 5;
  else if (wins >= 45) seed = 6;
  else if (wins >= 42) seed = 7;
  else if (wins >= 40) seed = 8;
  else if (wins >= 38) seed = 9;
  else if (wins >= 36) seed = 10;

  const berth: SeasonBerth =
    seed == null ? 'missed' : seed <= 6 ? 'playoffs' : 'play_in';

  return { wins, losses, seed, berth };
}

export function formatSeedLabel(seed: number | null): string {
  if (seed == null) return 'Out of the playoffs';
  const suffix =
    seed === 1 ? 'st' : seed === 2 ? 'nd' : seed === 3 ? 'rd' : 'th';
  return `${seed}${suffix} seed`;
}

/** Auto playoff berth (seeds 1–6). */
export function madeAutoPlayoffs(wins: number): boolean {
  return deriveSeasonStanding(wins).berth === 'playoffs';
}

/** Soft championship odds % for briefing UI (single-team approximation). */
export function championshipOddsPercent(
  wins: number,
  lineupScore: number,
  seed: number | null,
): number {
  if (seed == null) return 0;
  const seedBase = [0, 38, 24, 16, 11, 8, 5, 3.2, 2.2, 1.4, 0.9][seed] ?? 0;
  const quality = Math.min(8, Math.max(-4, (lineupScore - 72) * 0.32));
  const winBoost = Math.min(6, Math.max(-3, (wins - 50) * 0.22));
  const raw = seedBase + quality + winBoost;
  return Math.round(Math.min(52, Math.max(0.4, raw)) * 10) / 10;
}

/** Seeds 7–10 — must survive the play-in. */
export function needsPlayIn(wins: number): boolean {
  return deriveSeasonStanding(wins).berth === 'play_in';
}
