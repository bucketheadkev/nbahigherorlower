'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ackH2HContinue,
  ackH2HRematch,
  fetchH2HState,
  fetchRoomLobby,
  initH2HMatch,
  lockH2HPick,
  moveH2HPick,
} from '@/lib/multiplayer/rooms';
import type { H2HMatchState, H2HPickSelection } from '@/lib/multiplayer/h2hState';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { RoomLobbySnapshot } from '@/lib/multiplayer/types';
import { MultiplayerApiError } from '@/lib/multiplayer/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface UseH2HMatchOptions {
  roomId: string;
  userId: string;
}

export function useH2HMatch({ roomId, userId }: UseH2HMatchOptions) {
  const [lobby, setLobby] = useState<RoomLobbySnapshot | null>(null);
  const [state, setState] = useState<H2HMatchState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockBusy, setLockBusy] = useState(false);
  const [continueBusy, setContinueBusy] = useState(false);
  const [rematchBusy, setRematchBusy] = useState(false);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  const refetch = useCallback(async () => {
    if (!roomId) return;
    try {
      let nextState: H2HMatchState;
      try {
        nextState = await fetchH2HState(roomId);
      } catch (err) {
        const code = err instanceof MultiplayerApiError ? err.code : '';
        if (code === 'ROOM_INVALID') {
          await initH2HMatch(roomId);
          nextState = await fetchH2HState(roomId);
        } else {
          throw err;
        }
      }
      const nextLobby = await fetchRoomLobby(roomId);
      if (roomIdRef.current !== roomId) return;
      setState(nextState);
      setLobby(nextLobby);
      setError(null);
    } catch (err) {
      if (roomIdRef.current !== roomId) return;
      setError(
        err instanceof MultiplayerApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not load match.',
      );
    } finally {
      if (roomIdRef.current === roomId) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    void refetch();

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`h2h_pos:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'h2h_matches', filter: `room_id=eq.${roomId}` },
        () => {
          void refetch();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'h2h_rounds', filter: `room_id=eq.${roomId}` },
        () => {
          void refetch();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'h2h_picks', filter: `room_id=eq.${roomId}` },
        () => {
          void refetch();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refetch();
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener('focus', onVisible);
    const poll = window.setInterval(() => {
      void refetch();
    }, 2000);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('focus', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [refetch, roomId]);

  const lockPick = useCallback(
    async (position: H2HPosition, selection: H2HPickSelection, rawValue: number) => {
      setError(null);
      try {
        await lockH2HPick(roomId, position, selection, rawValue);
      } catch (err) {
        const message =
          err instanceof MultiplayerApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not lock pick.';
        setError(message);
        throw err;
      }
      try {
        await refetch();
      } catch (err) {
        console.warn('[useH2HMatch] refetch after lock failed', err);
      }
    },
    [refetch, roomId],
  );

  const movePick = useCallback(
    async (
      fromPosition: H2HPosition,
      toPosition: H2HPosition,
      selection: H2HPickSelection,
      rawValue: number,
    ) => {
      setError(null);
      // Optimistic local seat update so UI never waits on the network round-trip.
      setState((prev) => {
        if (!prev?.my_picks) return prev;
        const withoutFrom = prev.my_picks.filter((pick) => pick.position !== fromPosition);
        const withoutDest = withoutFrom.filter((pick) => pick.position !== toPosition);
        return {
          ...prev,
          my_picks: [
            ...withoutDest,
            { position: toPosition, selection, raw_value: rawValue },
          ],
        };
      });
      try {
        await moveH2HPick(roomId, fromPosition, toPosition, selection, rawValue);
      } catch (err) {
        const message =
          err instanceof MultiplayerApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not move pick.';
        setError(message);
        try {
          await refetch();
        } catch {
          /* ignore */
        }
        throw err;
      }
      try {
        await refetch();
      } catch (err) {
        console.warn('[useH2HMatch] refetch after move failed', err);
      }
    },
    [refetch, roomId],
  );

  const ackContinue = useCallback(async () => {
    if (continueBusy) return;
    setContinueBusy(true);
    setError(null);
    try {
      await ackH2HContinue(roomId);
      await refetch();
    } catch (err) {
      const message =
        err instanceof MultiplayerApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not continue.';
      setError(message);
      throw err;
    } finally {
      setContinueBusy(false);
    }
  }, [continueBusy, refetch, roomId]);

  const ackRematch = useCallback(async () => {
    if (rematchBusy) return;
    setRematchBusy(true);
    setError(null);
    try {
      await ackH2HRematch(roomId);
      await refetch();
    } catch (err) {
      const message =
        err instanceof MultiplayerApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not start rematch.';
      setError(message);
      throw err;
    } finally {
      setRematchBusy(false);
    }
  }, [rematchBusy, refetch, roomId]);

  const opponent =
    lobby?.players.find((p) => p.user_id !== userId) ?? null;
  const me = lobby?.players.find((p) => p.user_id === userId) ?? null;

  return {
    lobby,
    state,
    loading,
    error,
    lockBusy,
    continueBusy,
    rematchBusy,
    myName: me?.display_name ?? 'You',
    opponentName: opponent?.display_name ?? 'Opponent',
    refetch,
    lockPick,
    movePick,
    ackContinue,
    ackRematch,
  };
}
