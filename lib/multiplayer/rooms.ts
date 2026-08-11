import { ensureAnonymousSession } from '@/lib/supabase/auth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  mapRoomRpcError,
  type RoomActionResult,
  type RoomLobbySnapshot,
  type RoomPlayerRow,
  type RoomRow,
  type RoomStatus,
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

function parseRoom(row: Record<string, unknown>): RoomRow {
  return {
    id: String(row.id),
    room_code: String(row.room_code).toUpperCase(),
    host_user_id: String(row.host_user_id),
    status: asRoomStatus(row.status),
    created_at: String(row.created_at),
    expires_at: String(row.expires_at),
  };
}

function parsePlayer(row: Record<string, unknown>): RoomPlayerRow {
  return {
    id: String(row.id),
    room_id: String(row.room_id),
    user_id: String(row.user_id),
    display_name: String(row.display_name),
    player_number: asPlayerNumber(row.player_number),
    is_ready: Boolean(row.is_ready),
    joined_at: String(row.joined_at),
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
