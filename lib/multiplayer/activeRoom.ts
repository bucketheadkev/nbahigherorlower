/**
 * Non-sensitive active-room restore for Phase 2 lobbies.
 * Never stores secrets or service-role keys.
 */

import { isValidH2HRoomCode } from '@/lib/multiplayer/roomCode';

const ACTIVE_ROOM_KEY = 'ballion_mp_active_room_v1';

export interface ActiveRoomPersist {
  roomId: string;
  roomCode: string;
  savedAt: string;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function readActiveRoom(): ActiveRoomPersist | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_ROOM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveRoomPersist>;
    const roomId = typeof parsed.roomId === 'string' ? parsed.roomId.trim() : '';
    const roomCode =
      typeof parsed.roomCode === 'string' ? parsed.roomCode.trim().toUpperCase() : '';
    const savedAt = typeof parsed.savedAt === 'string' ? parsed.savedAt : '';
    if (!isUuid(roomId) || !isValidH2HRoomCode(roomCode) || !savedAt) {
      clearActiveRoom();
      return null;
    }
    return { roomId, roomCode, savedAt };
  } catch {
    clearActiveRoom();
    return null;
  }
}

export function writeActiveRoom(roomId: string, roomCode: string): void {
  if (typeof window === 'undefined') return;
  if (!isUuid(roomId) || !roomCode.trim()) return;
  try {
    const payload: ActiveRoomPersist = {
      roomId,
      roomCode: roomCode.trim().toUpperCase(),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearActiveRoom(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACTIVE_ROOM_KEY);
  } catch {
    /* ignore */
  }
}
