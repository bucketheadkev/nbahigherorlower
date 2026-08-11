'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchRoomLobby,
  setPlayerReady as setPlayerReadyRpc,
} from '@/lib/multiplayer/rooms';
import type { RoomLobbySnapshot, RoomPlayerRow } from '@/lib/multiplayer/types';
import { MultiplayerApiError } from '@/lib/multiplayer/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface UseRoomLobbyOptions {
  roomId: string;
  enabled?: boolean;
}

interface UseRoomLobbyResult {
  snapshot: RoomLobbySnapshot | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  readyBusy: boolean;
}

/**
 * Loads lobby state and subscribes to room_players changes for one room.
 * Refetches on reconnect, tab focus, and app foreground.
 */
export function useRoomLobby({
  roomId,
  enabled = true,
}: UseRoomLobbyOptions): UseRoomLobbyResult {
  const [snapshot, setSnapshot] = useState<RoomLobbySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readyBusy, setReadyBusy] = useState(false);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  const refetch = useCallback(async () => {
    if (!enabled || !roomId) return;
    try {
      const next = await fetchRoomLobby(roomId);
      if (roomIdRef.current !== roomId) return;
      setSnapshot(next);
      setError(null);
    } catch (err) {
      if (roomIdRef.current !== roomId) return;
      const message =
        err instanceof MultiplayerApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not load lobby.';
      setError(message);
    } finally {
      if (roomIdRef.current === roomId) setLoading(false);
    }
  }, [enabled, roomId]);

  useEffect(() => {
    if (!enabled || !roomId) return;

    setLoading(true);
    void refetch();

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`room_players:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_players',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void refetch();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void refetch();
        }
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    const onOnline = () => {
      void refetch();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [enabled, roomId, refetch]);

  const setReady = useCallback(
    async (ready: boolean) => {
      if (readyBusy) return;
      setReadyBusy(true);
      setError(null);
      try {
        await setPlayerReadyRpc(roomId, ready);
        await refetch();
      } catch (err) {
        const message =
          err instanceof MultiplayerApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not update ready status.';
        setError(message);
        throw err;
      } finally {
        setReadyBusy(false);
      }
    },
    [readyBusy, refetch, roomId],
  );

  return { snapshot, loading, error, refetch, setReady, readyBusy };
}

export function slotFor(
  players: RoomPlayerRow[],
  number: 1 | 2,
): RoomPlayerRow | null {
  return players.find((p) => p.player_number === number) ?? null;
}
