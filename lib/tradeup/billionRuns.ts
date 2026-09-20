import { BILLION_GOAL, getDollarValue, type ValuedPlayer } from './billionDollar';
import { LINEUP_POSITIONS } from './startingLineup';
import { TEAMS } from './teams';
import type { Position } from './types';

export const BILLION_RUNS_KEY = 'oneb_billion_runs_v1';
export const MAX_BILLION_RUNS = 40;

const MAX_RUNS = MAX_BILLION_RUNS;

export interface BillionRunPlayer {
  name: string;
  position: Position;
  teamId: string;
  teamName: string;
  era: string;
  dollarValue: number;
}

export interface BillionRun {
  id: string;
  completedAt: number;
  teamValue: number;
  players: BillionRunPlayer[];
}

/** Optional listener after local billion-runs writes (cloud push). */
let billionRunsListener: ((runs: BillionRun[]) => void) | null = null;
let suppressBillionRunsListener = 0;

export function setBillionRunsListener(listener: ((runs: BillionRun[]) => void) | null): void {
  billionRunsListener = listener;
}

function notifyBillionRuns(runs: BillionRun[]): void {
  if (suppressBillionRunsListener === 0) {
    billionRunsListener?.(runs);
  }
}

function teamNameForId(teamId: string): string {
  return TEAMS.find((t) => t.id === teamId)?.fullName ?? teamId;
}

function playerEra(player: ValuedPlayer): string {
  const era = (player as ValuedPlayer & { era?: string }).era;
  return typeof era === 'string' && era.length > 0 ? era : '—';
}

function sanitizeRuns(parsed: unknown): BillionRun[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (run): run is BillionRun =>
        Boolean(run) &&
        typeof (run as BillionRun).teamValue === 'number' &&
        (run as BillionRun).teamValue >= BILLION_GOAL &&
        Array.isArray((run as BillionRun).players),
    )
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, MAX_RUNS);
}

export function getBillionRuns(): BillionRun[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BILLION_RUNS_KEY);
    if (!raw) return [];
    return sanitizeRuns(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

/** Replace local My Runs list (e.g. after cloud merge). Optionally skip cloud push echo. */
export function replaceBillionRuns(
  runs: BillionRun[],
  options?: { fromCloud?: boolean },
): void {
  if (typeof window === 'undefined') return;
  const next = sanitizeRuns(runs);
  if (options?.fromCloud) suppressBillionRunsListener += 1;
  try {
    if (next.length === 0) localStorage.removeItem(BILLION_RUNS_KEY);
    else localStorage.setItem(BILLION_RUNS_KEY, JSON.stringify(next));
    notifyBillionRuns(next);
  } finally {
    if (options?.fromCloud) {
      suppressBillionRunsListener = Math.max(0, suppressBillionRunsListener - 1);
    }
  }
}

export function saveBillionRun(roster: ValuedPlayer[], teamValue: number): BillionRun | null {
  if (typeof window === 'undefined') return null;
  const value = Math.max(0, Math.round(teamValue));
  if (value < BILLION_GOAL || roster.length < 5) return null;

  const byPos = new Map<Position, ValuedPlayer>();
  for (const player of roster) {
    byPos.set(player.primaryPosition, player);
  }

  const players: BillionRunPlayer[] = LINEUP_POSITIONS.map((pos) => {
    const player =
      roster.find((p) => p.primaryPosition === pos) ??
      byPos.get(pos) ??
      roster[LINEUP_POSITIONS.indexOf(pos)];
    if (!player) {
      return {
        name: '—',
        position: pos,
        teamId: '',
        teamName: '—',
        era: '—',
        dollarValue: 0,
      };
    }
    return {
      name: player.name,
      position: pos,
      teamId: player.teamId,
      teamName: teamNameForId(player.teamId),
      era: playerEra(player),
      dollarValue: getDollarValue(player),
    };
  });

  // Prefer slot order if roster was already PG→C
  if (roster.length === 5) {
    for (let i = 0; i < 5; i += 1) {
      const player = roster[i]!;
      const pos = LINEUP_POSITIONS[i]!;
      players[i] = {
        name: player.name,
        position: pos,
        teamId: player.teamId,
        teamName: teamNameForId(player.teamId),
        era: playerEra(player),
        dollarValue: getDollarValue(player),
      };
    }
  }

  const run: BillionRun = {
    id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    completedAt: Date.now(),
    teamValue: value,
    players,
  };

  const next = [run, ...getBillionRuns()].slice(0, MAX_RUNS);
  localStorage.setItem(BILLION_RUNS_KEY, JSON.stringify(next));
  notifyBillionRuns(next);
  return run;
}

/** Semantic merge of My Runs lists — union by id, cap 40 newest by completedAt. */
export function mergeBillionRuns(a: BillionRun[], b: BillionRun[]): BillionRun[] {
  const byId = new Map<string, BillionRun>();
  const consider = (run: BillionRun) => {
    if (!run?.id || run.teamValue < BILLION_GOAL) return;
    const prev = byId.get(run.id);
    if (!prev) {
      byId.set(run.id, run);
      return;
    }
    if (
      run.teamValue > prev.teamValue ||
      (run.teamValue === prev.teamValue && run.completedAt > prev.completedAt)
    ) {
      byId.set(run.id, run);
    }
  };
  for (const run of a) consider(run);
  for (const run of b) consider(run);

  // Near-duplicate collapse: same value + time ±2s + same five names.
  const list = [...byId.values()];
  const kept: BillionRun[] = [];
  for (const run of list.sort((x, y) => y.completedAt - x.completedAt)) {
    const fingerprint = run.players
      .map((p) => `${p.position}|${p.name}|${p.dollarValue}`)
      .join(';');
    const dup = kept.find(
      (other) =>
        other.teamValue === run.teamValue &&
        Math.abs(other.completedAt - run.completedAt) <= 2000 &&
        other.players.map((p) => `${p.position}|${p.name}|${p.dollarValue}`).join(';') ===
          fingerprint,
    );
    if (!dup) kept.push(run);
  }
  return kept.sort((x, y) => y.completedAt - x.completedAt).slice(0, MAX_RUNS);
}
