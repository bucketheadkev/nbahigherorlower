import { BILLION_GOAL, getDollarValue, type ValuedPlayer } from './billionDollar';
import { LINEUP_POSITIONS } from './startingLineup';
import { TEAMS } from './teams';
import type { Position } from './types';

const BILLION_RUNS_KEY = 'oneb_billion_runs_v1';
const MAX_RUNS = 40;

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

function teamNameForId(teamId: string): string {
  return TEAMS.find((t) => t.id === teamId)?.fullName ?? teamId;
}

function playerEra(player: ValuedPlayer): string {
  const era = (player as ValuedPlayer & { era?: string }).era;
  return typeof era === 'string' && era.length > 0 ? era : '—';
}

export function getBillionRuns(): BillionRun[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BILLION_RUNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BillionRun[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (run) =>
          run &&
          typeof run.teamValue === 'number' &&
          run.teamValue >= BILLION_GOAL &&
          Array.isArray(run.players),
      )
      .sort((a, b) => b.completedAt - a.completedAt);
  } catch {
    return [];
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
  return run;
}
