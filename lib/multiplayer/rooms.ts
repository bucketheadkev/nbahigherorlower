import { ensureAnonymousSession } from '@/lib/supabase/auth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { parseMatchResult, type MatchResultRow } from './match';
import { parseH2HState, type H2HMatchState, type H2HPickSelection } from './h2hState';
import type { H2HPosition } from './h2hPenalty';
import { isH2HGameMode, type H2HGameMode } from './gameModes';
import {
  mapRoomRpcError,
  MultiplayerApiError,
  type RoomActionResult,
  type RoomLobbySnapshot,
  type RoomPlayerRow,
  type RoomRow,
  type RoomStatus,
  type StartRoomResult,
} from './types';

function asRoomStatus(value: unknown): RoomStatus {
  if (
    value === 'waiting' ||
    value === 'playing' ||
    value === 'finished' ||
    value === 'abandoned'
  ) {
    return value;
  }
  return 'waiting';
}

function asPlayerNumber(value: unknown): 1 | 2 {
  return value === 2 ? 2 : 1;
}

function asOptionalTimestamp(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function parseActionResult(data: unknown): RoomActionResult {
  if (!data || typeof data !== 'object') {
    throw mapRoomRpcError(new Error('Empty room response'));
  }
  const row = data as Record<string, unknown>;
  return {
    room_id: String(row.room_id),
    room_code: String(row.room_code).toUpperCase(),
    host_user_id: String(row.host_user_id),
    status: asRoomStatus(row.status),
    expires_at: String(row.expires_at),
    player_id: String(row.player_id),
    player_number: asPlayerNumber(row.player_number),
    display_name: String(row.display_name),
    rejoined: Boolean(row.rejoined),
    game_mode: isH2HGameMode(row.game_mode) ? row.game_mode : 'classic',
  };
}

function parseStartResult(data: unknown): StartRoomResult {
  if (!data || typeof data !== 'object') {
    throw mapRoomRpcError(new Error('Empty start response'));
  }
  const row = data as Record<string, unknown>;
  return {
    room_id: String(row.room_id),
    room_code: String(row.room_code).toUpperCase(),
    host_user_id: String(row.host_user_id),
    status: asRoomStatus(row.status),
    expires_at: String(row.expires_at),
    started_at: asOptionalTimestamp(row.started_at),
  };
}

export function parseRoom(row: Record<string, unknown>): RoomRow {
  return {
    id: String(row.id),
    room_code: String(row.room_code).toUpperCase(),
    host_user_id: String(row.host_user_id),
    status: asRoomStatus(row.status),
    created_at: String(row.created_at),
    expires_at: String(row.expires_at),
    started_at: asOptionalTimestamp(row.started_at),
    game_mode: isH2HGameMode(row.game_mode) ? row.game_mode : 'classic',
  };
}

function parsePlayer(row: Record<string, unknown>): RoomPlayerRow {
  const progress = Number(row.match_progress ?? 0);
  return {
    id: String(row.id),
    room_id: String(row.room_id),
    user_id: String(row.user_id),
    display_name: String(row.display_name),
    player_number: asPlayerNumber(row.player_number),
    is_ready: Boolean(row.is_ready),
    joined_at: String(row.joined_at),
    match_progress: Number.isFinite(progress)
      ? Math.max(0, Math.min(5, Math.round(progress)))
      : 0,
  };
}

export async function createRoom(
  displayName: string,
  gameMode: H2HGameMode = 'classic',
): Promise<RoomActionResult> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('create_room', {
    display_name: displayName,
    game_mode: gameMode,
  });
  if (error) {
    const upper = String(error.message ?? '').toUpperCase();
    const missingModeRpc =
      upper.includes('PGRST202') ||
      upper.includes('PGRST203') ||
      upper.includes('SCHEMA CACHE') ||
      upper.includes('COULD NOT FIND THE FUNCTION');

    // Never silently create a classic lobby when the host picked another mode.
    if (missingModeRpc && gameMode !== 'classic') {
      throw new MultiplayerApiError(
        'RPC_MISSING',
        'Server update required for game modes. Run SQL 20260821_h2h_game_mode_fix.sql in Supabase.',
      );
    }

    // Classic-only fallback for installs that still only have create_room(display_name).
    if (missingModeRpc && gameMode === 'classic') {
      const retry = await supabase.rpc('create_room', { display_name: displayName });
      if (retry.error) throw mapRoomRpcError(retry.error);
      return parseActionResult(retry.data);
    }

    throw mapRoomRpcError(error);
  }

  const result = parseActionResult(data);

  // If create ignored the mode (old overload / missing column), host pins it.
  if (result.game_mode !== gameMode) {
    const { error: modeError } = await supabase.rpc('set_room_game_mode', {
      room_id: result.room_id,
      game_mode: gameMode,
    });
    if (modeError) {
      const upper = String(modeError.message ?? '').toUpperCase();
      if (
        gameMode !== 'classic' &&
        (upper.includes('PGRST202') ||
          upper.includes('SCHEMA CACHE') ||
          upper.includes('COULD NOT FIND THE FUNCTION'))
      ) {
        throw new MultiplayerApiError(
          'RPC_MISSING',
          'Server update required for game modes. Run SQL 20260821_h2h_game_mode_fix.sql in Supabase.',
        );
      }
      if (gameMode !== 'classic') throw mapRoomRpcError(modeError);
    }
  }

  return { ...result, game_mode: gameMode };
}

export async function joinRoom(
  roomCode: string,
  displayName: string,
): Promise<RoomActionResult> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('join_room', {
    room_code: roomCode.trim().toUpperCase(),
    display_name: displayName,
  });
  if (error) throw mapRoomRpcError(error);
  return parseActionResult(data);
}

export async function leaveRoom(roomId: string): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('leave_room', { room_id: roomId });
  if (error) throw mapRoomRpcError(error);
}

export async function setPlayerReady(roomId: string, ready: boolean): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('set_player_ready', {
    room_id: roomId,
    ready,
  });
  if (error) throw mapRoomRpcError(error);
}

export async function startRoom(roomId: string): Promise<StartRoomResult> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('start_room', { room_id: roomId });
  if (error) throw mapRoomRpcError(error);
  return parseStartResult(data);
}

export async function fetchRoomLobby(roomId: string): Promise<RoomLobbySnapshot> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();

  const [roomRes, playersRes] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
    supabase
      .from('room_players')
      .select('*')
      .eq('room_id', roomId)
      .order('player_number', { ascending: true }),
  ]);

  if (roomRes.error) throw mapRoomRpcError(roomRes.error);
  if (playersRes.error) throw mapRoomRpcError(playersRes.error);
  if (!roomRes.data) {
    throw mapRoomRpcError(new Error('ROOM_INVALID'));
  }

  return {
    room: parseRoom(roomRes.data as Record<string, unknown>),
    players: (playersRes.data ?? []).map((row) =>
      parsePlayer(row as Record<string, unknown>),
    ),
  };
}

export async function updateMatchProgress(
  roomId: string,
  playerCount: number,
): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('update_match_progress', {
    room_id: roomId,
    player_count: playerCount,
  });
  if (error) throw mapRoomRpcError(error);
}

export async function submitMatchResult(
  roomId: string,
  lineup: unknown,
  totalValue: number,
): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('submit_match_result', {
    room_id: roomId,
    lineup,
    total_value: Math.round(totalValue),
  });
  if (error) throw mapRoomRpcError(error);
}

export async function fetchMatchResults(roomId: string): Promise<MatchResultRow[]> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('match_results')
    .select('*')
    .eq('room_id', roomId)
    .order('submitted_at', { ascending: true });
  if (error) throw mapRoomRpcError(error);
  return (data ?? []).map((row) => parseMatchResult(row as Record<string, unknown>));
}

export async function initH2HMatch(roomId: string): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('init_h2h_match', { room_id: roomId });
  if (error) throw mapRoomRpcError(error);
}

export async function fetchH2HState(roomId: string): Promise<H2HMatchState> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_h2h_state', { room_id: roomId });
  if (error) throw mapRoomRpcError(error);
  return parseH2HState(data);
}

export async function lockH2HPick(
  roomId: string,
  position: H2HPosition,
  selection: H2HPickSelection,
  rawValue: number,
): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('lock_h2h_pick', {
    room_id: roomId,
    player_position: position,
    selection,
    raw_value: Math.round(rawValue),
  });
  if (error) throw mapRoomRpcError(error);
}

export async function moveH2HPick(
  roomId: string,
  fromPosition: H2HPosition,
  toPosition: H2HPosition,
  selection: H2HPickSelection,
  rawValue: number,
): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const args = {
    room_id: roomId,
    from_position: fromPosition,
    to_position: toPosition,
    selection,
    raw_value: Math.round(rawValue),
  };

  const { error } = await supabase.rpc('move_h2h_pick', args);
  if (!error) return;

  const upper = String(error.message ?? '').toUpperCase();
  const hardStop =
    upper.includes('WRONG_PHASE') ||
    upper.includes('ROOM_NOT_PLAYING') ||
    upper.includes('NOT_IN_ROOM') ||
    upper.includes('NOT_AUTHENTICATED');

  if (hardStop) throw mapRoomRpcError(error);

  const { error: clearError } = await supabase.rpc('clear_h2h_pick', {
    room_id: roomId,
    player_position: fromPosition,
  });
  if (clearError) throw mapRoomRpcError(clearError);

  const { error: lockError } = await supabase.rpc('lock_h2h_pick', {
    room_id: roomId,
    player_position: toPosition,
    selection,
    raw_value: Math.round(rawValue),
  });
  if (lockError) throw mapRoomRpcError(lockError);
}

export async function ackH2HContinue(roomId: string): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('ack_h2h_continue', { room_id: roomId });
  if (error) throw mapRoomRpcError(error);
}

export async function ackH2HRematch(roomId: string): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('ack_h2h_rematch', { room_id: roomId });
  if (!error) return;

  const upper = String(error.message ?? '').toUpperCase();
  const missingRpc =
    upper.includes('PGRST202') ||
    upper.includes('SCHEMA CACHE') ||
    upper.includes('ACK_H2H_REMATCH');

  if (missingRpc) {
    const { error: initError } = await supabase.rpc('init_h2h_match', { room_id: roomId });
    if (initError) throw mapRoomRpcError(initError);
    return;
  }

  throw mapRoomRpcError(error);
}

export async function seedH2HTradeUpStarter(
  roomId: string,
  starter: Record<string, unknown>,
): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('seed_h2h_tradeup_starter', {
    room_id: roomId,
    starter,
  });
  if (error) throw mapRoomRpcError(error);
}

export async function applyH2HTradeUpDecision(
  roomId: string,
  didTrade: boolean,
  newPlayer: Record<string, unknown> | null,
): Promise<void> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('apply_h2h_tradeup_decision', {
    room_id: roomId,
    did_trade: didTrade,
    new_player: newPlayer,
  });
  if (error) throw mapRoomRpcError(error);
}

/** Fallback when get_h2h_state lacks mode columns — members can SELECT matches. */
export async function fetchH2HMatchExtras(roomId: string): Promise<{
  game_mode: H2HGameMode;
  mode_config: unknown;
} | null> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('h2h_matches')
    .select('game_mode, mode_config')
    .eq('room_id', roomId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    game_mode: isH2HGameMode(row.game_mode) ? row.game_mode : 'classic',
    mode_config: row.mode_config ?? {},
  };
}
