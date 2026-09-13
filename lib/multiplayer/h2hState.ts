import type { H2HPosition } from './h2hPenalty';
import { isH2HGameMode, type H2HGameMode } from './gameModes';
import { parseModeConfig, type H2HModeConfig } from './modeConfig';
import { parseShowdownCursor, type ShowdownCursor } from './showdownCursor';

export interface H2HPickSelection {
  name: string;
  position: H2HPosition;
  teamId: string;
  teamName: string;
  era: string;
  dollarValue: number;
  playerId: string;
  /** NBA primary slot — used when moving to alternate positions. */
  primarySlot?: H2HPosition;
  /** Roster dollar value at primary — stable value base when moving slots. */
  baseDollarValue?: number;
}

export interface H2HRoundPublic {
  position: H2HPosition;
  matchup_resolved: boolean;
  matchup_winner?: 'p1' | 'p2' | 'tie' | null;
  p1_raw_value?: number | null;
  p2_raw_value?: number | null;
  p1_adjusted_value?: number | null;
  p2_adjusted_value?: number | null;
  p1_total?: number | null;
  p2_total?: number | null;
  p1_selection?: H2HPickSelection | null;
  p2_selection?: H2HPickSelection | null;
  resolved_at?: string | null;
}

export interface H2HMatchState {
  room_id: string;
  current_position: H2HPosition;
  phase: 'selecting' | 'reveal' | 'finished';
  game_mode: H2HGameMode;
  mode_config: H2HModeConfig;
  showdown: ShowdownCursor;
  mode_seed: string | null;
  p1_user_id: string;
  p2_user_id: string;
  p1_total: number;
  p2_total: number;
  p1_continue: boolean;
  p2_continue: boolean;
  p1_rematch: boolean;
  p2_rematch: boolean;
  my_player_number: 1 | 2;
  my_locked: boolean;
  opponent_locked: boolean;
  opponent_rematch: boolean;
  my_pick: { selection: H2HPickSelection; raw_value: number } | null;
  my_picks: Array<{ position: H2HPosition; selection: H2HPickSelection; raw_value: number }>;
  opponent_pick_count: number;
  current_round: H2HRoundPublic;
  resolved_rounds: H2HRoundPublic[];
}

function asPosition(value: unknown): H2HPosition {
  if (value === 'PG' || value === 'SG' || value === 'SF' || value === 'PF' || value === 'C') {
    return value;
  }
  return 'PG';
}

function asSelection(raw: unknown): H2HPickSelection | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const name = String(row.name ?? '').trim();
  if (!name) return null;
  return {
    name,
    position: asPosition(row.position),
    teamId: String(row.teamId ?? ''),
    teamName: String(row.teamName ?? '—'),
    era: String(row.era ?? '—'),
    dollarValue: Math.round(Number(row.dollarValue ?? 0)),
    playerId: String(row.playerId ?? ''),
    primarySlot: row.primarySlot != null ? asPosition(row.primarySlot) : undefined,
    baseDollarValue:
      row.baseDollarValue != null ? Math.round(Number(row.baseDollarValue)) : undefined,
  };
}

function asRound(raw: unknown): H2HRoundPublic {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    position: asPosition(row.player_position ?? row.position),
    matchup_resolved: Boolean(row.matchup_resolved),
    matchup_winner:
      row.matchup_winner === 'p1' || row.matchup_winner === 'p2' || row.matchup_winner === 'tie'
        ? row.matchup_winner
        : null,
    p1_raw_value: row.p1_raw_value == null ? null : Math.round(Number(row.p1_raw_value)),
    p2_raw_value: row.p2_raw_value == null ? null : Math.round(Number(row.p2_raw_value)),
    p1_adjusted_value:
      row.p1_adjusted_value == null ? null : Math.round(Number(row.p1_adjusted_value)),
    p2_adjusted_value:
      row.p2_adjusted_value == null ? null : Math.round(Number(row.p2_adjusted_value)),
    p1_total: row.p1_total == null ? null : Math.round(Number(row.p1_total)),
    p2_total: row.p2_total == null ? null : Math.round(Number(row.p2_total)),
    p1_selection: asSelection(row.p1_selection),
    p2_selection: asSelection(row.p2_selection),
    resolved_at: row.resolved_at ? String(row.resolved_at) : null,
  };
}

export function parseH2HState(data: unknown): H2HMatchState {
  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const myPickRaw = row.my_pick as Record<string, unknown> | null;
  const mySelection = myPickRaw ? asSelection(myPickRaw.selection) : null;
  const gameMode = isH2HGameMode(row.game_mode) ? row.game_mode : 'classic';
  const modeConfig = parseModeConfig(row.mode_config, gameMode);
  const cfgRaw =
    row.mode_config && typeof row.mode_config === 'object'
      ? (row.mode_config as Record<string, unknown>)
      : null;
  return {
    room_id: String(row.room_id ?? ''),
    current_position: asPosition(row.current_position),
    phase:
      row.phase === 'reveal' || row.phase === 'finished' || row.phase === 'selecting'
        ? row.phase
        : 'selecting',
    game_mode: gameMode,
    mode_config: modeConfig,
    showdown: parseShowdownCursor(cfgRaw?.showdown),
    mode_seed: cfgRaw?.seed != null ? String(cfgRaw.seed) : null,
    p1_user_id: String(row.p1_user_id ?? ''),
    p2_user_id: String(row.p2_user_id ?? ''),
    p1_total: Math.round(Number(row.p1_total ?? 0)),
    p2_total: Math.round(Number(row.p2_total ?? 0)),
    p1_continue: Boolean(row.p1_continue),
    p2_continue: Boolean(row.p2_continue),
    p1_rematch: Boolean(row.p1_rematch),
    p2_rematch: Boolean(row.p2_rematch),
    my_player_number: row.my_player_number === 2 ? 2 : 1,
    my_locked: Boolean(row.my_locked),
    opponent_locked: Boolean(row.opponent_locked),
    opponent_rematch: Boolean(row.opponent_rematch),
    my_pick:
      mySelection && myPickRaw
        ? { selection: mySelection, raw_value: Math.round(Number(myPickRaw.raw_value ?? 0)) }
        : null,
    my_picks: Array.isArray(row.my_picks)
      ? (row.my_picks as unknown[])
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const rec = item as Record<string, unknown>;
            const selection = asSelection(rec.selection);
            if (!selection) return null;
            return {
              position: asPosition(rec.position ?? rec.player_position),
              selection,
              raw_value: Math.round(Number(rec.raw_value ?? 0)),
            };
          })
          .filter((p): p is { position: H2HPosition; selection: H2HPickSelection; raw_value: number } =>
            Boolean(p),
          )
      : [],
    opponent_pick_count: Math.max(0, Math.round(Number(row.opponent_pick_count ?? 0))),
    current_round: asRound(row.current_round),
    resolved_rounds: Array.isArray(row.resolved_rounds)
      ? row.resolved_rounds.map(asRound)
      : [],
  };
}
