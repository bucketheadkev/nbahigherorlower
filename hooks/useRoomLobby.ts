'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchRoomLobby,
  setPlayerReady as setPlayerReadyRpc,
  startRoom as startRoomRpc,
} from '@/lib/multiplayer/rooms';
import type { RoomLobbySnapshot, RoomPlayerRow } from '@/lib/multiplayer/types';
import { MultiplayerApiError } from '@/lib/multiplayer/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { h2hDebug } from '@/lib/multiplayer/h2hDebug';

interface UseRoomLobbyOptions {
  roomId: string;
  enabled?: boolean;
}

interface UseRoomLobbyResult {
  snapshot: RoomLobbySnapshot | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setReady: (ready: boolean) => Promise<{ started: boolean }>;
  readyBusy: boolean;
  startGame: () => Promise<void>;
  startBusy: boolean;
}

/** Reconciliation only — Realtime + Ready RPC drive normal progression. */
const LOBBY_RECONCILE_MS = 1200;

/**
 * Loads lobby state and subscribes to rooms + room_players for one room.
 * Realtime is primary; short reconcile + focus/online cover missed events.
 */
export function useRoomLobby({
  roomId,
  enabled = true,
}: UseRoomLobbyOptions): UseRoomLobbyResult {
  const [snapshot, setSnapshot] = useState<RoomLobbySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readyBusy, setReadyBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const statusRef = useRef<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const queuedRef = useRef(false);

  const refetch = useCallback(async () => {
    if (!enabled || !roomId) return;
    if (inflightRef.current) {
      queuedRef.current = true;
      return inflightRef.current;
    }

    const run = (async () => {
      try {
        const next = await fetchRoomLobby(roomId);
        if (roomIdRef.current !== roomId) return;
        const prevStatus = statusRef.current;
        statusRef.current = next.room.status;
        if (prevStatus !== next.room.status) {
          h2hDebug('lobby.status', {
            roomId,
            from: prevStatus,
            to: next.room.status,
            ready: next.players.map((p) => ({ n: p.player_number, ready: p.is_ready })),
          });
        }
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
        inflightRef.current = null;
        if (queuedRef.current) {
          queuedRef.current = false;
          void refetch();
        }
      }
    })();

    inflightRef.current = run;
    return run;
  }, [enabled, roomId]);

  useEffect(() => {
    if (!enabled || !roomId) return;

    setLoading(true);
    void refetch();

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`mp_room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_players',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          h2hDebug('lobby.realtime', { table: 'room_players', roomId });
          void refetch();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        () => {
          h2hDebug('lobby.realtime', { table: 'rooms', roomId });
          void refetch();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          h2hDebug('lobby.subscribed', { roomId });
          void refetch();
        }
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        h2hDebug('lobby.reconcile', { reason: 'visible', roomId });
        void refetch();
      }
    };
    const onOnline = () => {
      h2hDebug('lobby.reconcile', { reason: 'online', roomId });
      void refetch();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onVisible);
    const poll = window.setInterval(() => {
      void refetch();
    }, LOBBY_RECONCILE_MS);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [enabled, roomId, refetch]);

  const setReady = useCallback(
    async (ready: boolean) => {
      if (readyBusy || startBusy) return { started: false };
      setReadyBusy(true);
      setError(null);
      try {
        const result = await setPlayerReadyRpc(roomId, ready);
        h2hDebug('lobby.readyWritten', { roomId, ready, started: result.started });
        await refetch();
        if (result.started) {
          h2hDebug('lobby.matchStarted', { roomId, via: 'readyRpc' });
        }
        return { started: result.started };
      } catch (err) {
        const upper = String(
          err instanceof Error ? err.message : err ?? '',
        ).toUpperCase();
        if (upper.includes('ROOM_STARTED') || upper.includes('ALREADY')) {
          h2hDebug('lobby.setReady.alreadyStarted', { roomId });
          await refetch();
          return { started: true };
        }
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
    [readyBusy, refetch, roomId, startBusy],
  );

  const startGame = useCallback(async () => {
    if (startBusy || readyBusy) return;
    setStartBusy(true);
    setError(null);
    try {
      h2hDebug('lobby.startGame', { roomId });
      await startRoomRpc(roomId);
      await refetch();
      h2hDebug('lobby.matchStarted', { roomId, via: 'startRoom' });
    } catch (err) {
      const upper = String(err instanceof Error ? err.message : err ?? '').toUpperCase();
      if (upper.includes('ROOM_STARTED') || upper.includes('ALREADY')) {
        h2hDebug('lobby.startGame.alreadyStarted', { roomId });
        await refetch();
        return;
      }
      const message =
        err instanceof MultiplayerApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not start the match.';
      setError(message);
      throw err;
    } finally {
      setStartBusy(false);
    }
  }, [readyBusy, refetch, roomId, startBusy]);

  return {
    snapshot,
    loading,
    error,
    refetch,
    setReady,
    readyBusy,
    startGame,
    startBusy,
  };
}

export function slotFor(
  players: RoomPlayerRow[],
  number: 1 | 2,
): RoomPlayerRow | null {
  return players.find((p) => p.player_number === number) ?? null;
}
