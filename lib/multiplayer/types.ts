import type { H2HGameMode } from './gameModes';

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'abandoned';

export interface RoomRow {
  id: string;
  room_code: string;
  host_user_id: string;
  status: RoomStatus;
  created_at: string;
  expires_at: string;
  started_at: string | null;
  game_mode: H2HGameMode;
}

export interface RoomPlayerRow {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  player_number: 1 | 2;
  is_ready: boolean;
  joined_at: string;
  match_progress: number;
}

export interface RoomLobbySnapshot {
  room: RoomRow;
  players: RoomPlayerRow[];
}

export interface RoomActionResult {
  room_id: string;
  room_code: string;
  host_user_id: string;
  status: RoomStatus;
  expires_at: string;
  player_id: string;
  player_number: 1 | 2;
  display_name: string;
  rejoined?: boolean;
  game_mode?: H2HGameMode;
}

export interface StartRoomResult {
  room_id: string;
  room_code: string;
  host_user_id: string;
  status: RoomStatus;
  expires_at: string;
  started_at: string | null;
}

export class MultiplayerApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MultiplayerApiError';
    this.code = code;
  }
}

export function mapRoomRpcError(error: unknown): MultiplayerApiError {
  const raw =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : error instanceof Error
        ? error.message
        : String(error ?? '');

  const upper = raw.toUpperCase();

  if (upper.includes('PGRST202') || upper.includes('SCHEMA CACHE')) {
    return new MultiplayerApiError(
      'RPC_MISSING',
      'Server update required. Run the latest 1V1 SQL migration in Supabase.',
    );
  }

  if (upper.includes('ROOM_INVALID') || upper.includes('INVALID ROOM')) {
    return new MultiplayerApiError('ROOM_INVALID', 'That room code is invalid.');
  }
  if (upper.includes('ROOM_EXPIRED')) {
    return new MultiplayerApiError('ROOM_EXPIRED', 'This lobby has expired.');
  }
  if (upper.includes('ROOM_FULL')) {
    return new MultiplayerApiError('ROOM_FULL', 'This lobby is full.');
  }
  if (upper.includes('ROOM_STARTED') || upper.includes('ROOM_PLAYING')) {
    return new MultiplayerApiError('ROOM_STARTED', 'This match has already started.');
  }
  if (upper.includes('ROOM_FINISHED')) {
    return new MultiplayerApiError('ROOM_FINISHED', 'This lobby has already finished.');
  }
  if (upper.includes('ROOM_ABANDONED')) {
    return new MultiplayerApiError('ROOM_ABANDONED', 'This lobby was abandoned.');
  }
  if (upper.includes('NOT_HOST')) {
    return new MultiplayerApiError('NOT_HOST', 'Only the host can start the match.');
  }
  if (upper.includes('NEED_TWO_PLAYERS')) {
    return new MultiplayerApiError('NEED_TWO_PLAYERS', 'Two players are required to start.');
  }
  if (upper.includes('PLAYERS_NOT_READY')) {
    return new MultiplayerApiError(
      'PLAYERS_NOT_READY',
      'Both players must be ready before starting.',
    );
  }
  if (upper.includes('INVALID_DISPLAY_NAME')) {
    return new MultiplayerApiError(
      'INVALID_DISPLAY_NAME',
      'Use 2–16 letters, numbers, spaces, or . _ -',
    );
  }
  if (upper.includes('NOT_AUTHENTICATED')) {
    return new MultiplayerApiError('NOT_AUTHENTICATED', 'Sign-in failed. Try again.');
  }
  if (upper.includes('NOT_IN_ROOM')) {
    return new MultiplayerApiError('NOT_IN_ROOM', 'You are not in this lobby.');
  }
  if (upper.includes('ROOM_NOT_PLAYING')) {
    return new MultiplayerApiError('ROOM_NOT_PLAYING', 'This match is not in progress.');
  }
  if (upper.includes('INVALID_PROGRESS') || upper.includes('PROGRESS_DECREASE')) {
    return new MultiplayerApiError('INVALID_PROGRESS', 'Could not update match progress.');
  }
  if (upper.includes('INVALID_LINEUP')) {
    return new MultiplayerApiError('INVALID_LINEUP', 'Lineup must contain exactly five players.');
  }
  if (upper.includes('INVALID_TOTAL')) {
    return new MultiplayerApiError('INVALID_TOTAL', 'Match total did not match the lineup.');
  }
  if (upper.includes('ALREADY_SUBMITTED')) {
    return new MultiplayerApiError('ALREADY_SUBMITTED', 'You already submitted this match.');
  }
  if (upper.includes('ALREADY_LOCKED')) {
    return new MultiplayerApiError('ALREADY_LOCKED', 'You already locked this position.');
  }
  if (upper.includes('WRONG_POSITION')) {
    return new MultiplayerApiError(
      'WRONG_POSITION',
      '1V1 draft server update needed. In Supabase → SQL Editor, run supabase/migrations/20260825_h2h_full_roster_draft.sql, then start a new match.',
    );
  }
  if (upper.includes('WRONG_PHASE')) {
    return new MultiplayerApiError('WRONG_PHASE', 'This matchup is not ready for that action.');
  }
  if (upper.includes('INVALID_POSITION') || upper.includes('INVALID_SELECTION')) {
    return new MultiplayerApiError('INVALID_SELECTION', 'That player pick is not valid for this round.');
  }
  if (upper.includes('ROUND_NOT_RESOLVED')) {
    return new MultiplayerApiError('ROUND_NOT_RESOLVED', 'Wait for the matchup to resolve.');
  }

  return new MultiplayerApiError(
    'UNKNOWN',
    raw.trim() || 'Something went wrong. Please try again.',
  );
}
