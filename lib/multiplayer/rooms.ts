import { ensureAnonymousSession } from '@/lib/supabase/auth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { parseMatchResult, type MatchResultRow } from './match';
import {
  mapRoomRpcError,
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

export async function createRoom(displayName: string): Promise<RoomActionResult> {
  await ensureAnonymousSession();
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('create_room', {
    display_name: displayName,
  });
  if (error) throw mapRoomRpcError(error);
  return parseActionResult(data);
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
