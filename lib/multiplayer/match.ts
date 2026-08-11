import type { BillionRunPlayer } from '@/lib/tradeup/billionRuns';
import { getDollarValue, type ValuedPlayer } from '@/lib/tradeup/billionDollar';
import { LINEUP_POSITIONS } from '@/lib/tradeup/startingLineup';
import { TEAMS } from '@/lib/tradeup/teams';
import type { Position } from '@/lib/tradeup/types';
import { MultiplayerApiError } from './types';

export interface MatchLineupEntry {
  name: string;
  position: Position;
  teamId: string;
  teamName: string;
  era: string;
  dollarValue: number;
}

export interface MatchResultRow {
  id: string;
  room_id: string;
  user_id: string;
  lineup: MatchLineupEntry[];
  total_value: number;
  submitted_at: string;
}

export type MatchOutcome = 'win' | 'loss' | 'tie';

function teamNameForId(teamId: string): string {
  return TEAMS.find((t) => t.id === teamId)?.fullName ?? teamId;
}

function playerEra(player: ValuedPlayer): string {
  const era = (player as ValuedPlayer & { era?: string }).era;
  return typeof era === 'string' && era.length > 0 ? era : '—';
}

/** Build the five-player payload from a completed roster (PG→C order). */
export function serializeMatchLineup(roster: ValuedPlayer[]): MatchLineupEntry[] {
  const ordered =
    roster.length === 5
      ? roster
      : LINEUP_POSITIONS.map(
          (pos) =>
            roster.find((p) => p.primaryPosition === pos) ??
            roster[LINEUP_POSITIONS.indexOf(pos)],
        ).filter((p): p is ValuedPlayer => Boolean(p));

  if (ordered.length !== 5) {
    throw new MultiplayerApiError('INVALID_LINEUP', 'Lineup must have exactly five players.');
  }

  return ordered.map((player, i) => {
    const pos = LINEUP_POSITIONS[i]!;
    return {
      name: player.name,
      position: pos,
      teamId: player.teamId,
      teamName: teamNameForId(player.teamId),
      era: playerEra(player),
      dollarValue: Math.round(getDollarValue(player)),
    };
  });
}

export function lineupFromBillionPlayers(players: BillionRunPlayer[]): MatchLineupEntry[] {
  return players.map((p) => ({
    name: p.name,
    position: p.position,
    teamId: p.teamId,
    teamName: p.teamName,
    era: p.era,
    dollarValue: Math.round(p.dollarValue),
  }));
}

export function sumLineupValue(lineup: MatchLineupEntry[]): number {
  return lineup.reduce((sum, p) => sum + Math.round(p.dollarValue), 0);
}

export function deriveMatchOutcome(
  myUserId: string,
  results: MatchResultRow[],
): { outcome: MatchOutcome; myTotal: number; oppTotal: number } | null {
  if (results.length < 2) return null;
  const mine = results.find((r) => r.user_id === myUserId);
  const theirs = results.find((r) => r.user_id !== myUserId);
  if (!mine || !theirs) return null;
  if (mine.total_value > theirs.total_value) {
    return { outcome: 'win', myTotal: mine.total_value, oppTotal: theirs.total_value };
  }
  if (mine.total_value < theirs.total_value) {
    return { outcome: 'loss', myTotal: mine.total_value, oppTotal: theirs.total_value };
  }
  return { outcome: 'tie', myTotal: mine.total_value, oppTotal: theirs.total_value };
}

export function parseMatchResult(row: Record<string, unknown>): MatchResultRow {
  const lineupRaw = row.lineup;
  const lineup: MatchLineupEntry[] = Array.isArray(lineupRaw)
    ? lineupRaw.map((entry) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        return {
          name: String(e.name ?? '—'),
          position: (String(e.position ?? 'PG') as Position),
          teamId: String(e.teamId ?? ''),
          teamName: String(e.teamName ?? '—'),
          era: String(e.era ?? '—'),
          dollarValue: Math.round(Number(e.dollarValue ?? 0)),
        };
      })
    : [];

  return {
    id: String(row.id),
    room_id: String(row.room_id),
    user_id: String(row.user_id),
    lineup,
    total_value: Math.round(Number(row.total_value ?? 0)),
    submitted_at: String(row.submitted_at ?? ''),
  };
}
