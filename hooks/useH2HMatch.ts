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
import { h2hDebug } from '@/lib/multiplayer/h2hDebug';

interface UseH2HMatchOptions {
  roomId: string;
  userId: string;
}

/** Reconciliation only — Realtime is primary. */
const MATCH_RECONCILE_MS = 1500;

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
  const lastDebugKey = useRef('');
  const inflightRef = useRef<Promise<void> | null>(null);
  const queuedRef = useRef(false);

  const applyState = useCallback((nextState: H2HMatchState, nextLobby: RoomLobbySnapshot) => {
    if (roomIdRef.current !== roomId) return;
    const bounty =
      nextState.mode_config.mode === 'bounty' ? nextState.mode_config.bounty : null;
    const key = [
      nextState.phase,
      nextState.game_mode,
      bounty?.revealed,
      bounty?.bountyPosition,
      bounty?.multiplier,
      nextState.resolved_rounds.length,
      nextState.opponent_pick_count,
      nextState.my_picks?.length ?? 0,
      nextState.showdown.started,
      nextState.showdown.index,
      nextState.showdown.finished,
      nextState.showdown.revision,
    ].join(':');
    if (key !== lastDebugKey.current) {
      lastDebugKey.current = key;
      h2hDebug('match.state', {
        roomId,
        phase: nextState.phase,
        mode: nextState.game_mode,
        bounty,
        myPicks: nextState.my_picks?.length ?? 0,
        oppPicks: nextState.opponent_pick_count,
        rounds: nextState.resolved_rounds.length,
        showdown: nextState.showdown,
      });
    }
    setState(nextState);
    setLobby(nextLobby);
    setError(null);
  }, [roomId]);

  const refetch = useCallback(async () => {
    if (!roomId) return;
    if (inflightRef.current) {
      queuedRef.current = true;
      return inflightRef.current;
    }

    const run = (async () => {
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
        applyState(nextState, nextLobby);
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
        inflightRef.current = null;
        if (queuedRef.current) {
          queuedRef.current = false;
          void refetch();
        }
      }
    })();

    inflightRef.current = run;
    return run;
  }, [applyState, roomId]);

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
          h2hDebug('match.realtime', { table: 'h2h_matches', roomId });
          void refetch();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'h2h_rounds', filter: `room_id=eq.${roomId}` },
        () => {
          h2hDebug('match.realtime', { table: 'h2h_rounds', roomId });
          void refetch();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'h2h_picks', filter: `room_id=eq.${roomId}` },
        () => {
          h2hDebug('match.realtime', { table: 'h2h_picks', roomId });
          void refetch();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => {
          h2hDebug('match.realtime', { table: 'rooms', roomId });
          void refetch();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_players',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          h2hDebug('match.realtime', { table: 'room_players', roomId });
          void refetch();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          h2hDebug('match.subscribed', { roomId });
          void refetch();
        }
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        h2hDebug('match.reconcile', { reason: 'visible', roomId });
        void refetch();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener('focus', onVisible);
    const poll = window.setInterval(() => {
      void refetch();
    }, MATCH_RECONCILE_MS);

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
      setLockBusy(true);
      try {
        // Optimistic local pick so our own board never waits on the network.
        setState((prev) => {
          if (!prev) return prev;
          const others = (prev.my_picks ?? []).filter((p) => p.position !== position);
          return {
            ...prev,
            my_picks: [...others, { position, selection, raw_value: rawValue }],
            my_locked: others.length + 1 >= 5,
          };
        });

        const result = await lockH2HPick(roomId, position, selection, rawValue);
        h2hDebug('match.pickLocked', {
          roomId,
          position,
          my_count: result.my_count,
          opp_count: result.opp_count,
          finished: result.finished,
        });

        // Apply RPC counts immediately so opponent progress does not wait on Realtime.
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            opponent_pick_count:
              result.opp_count != null ? result.opp_count : prev.opponent_pick_count,
            my_locked: result.my_count != null ? result.my_count >= 5 : prev.my_locked,
            opponent_locked:
              result.opp_count != null ? result.opp_count >= 5 : prev.opponent_locked,
            phase: result.finished ? 'finished' : prev.phase,
            p1_total: result.p1_total ?? prev.p1_total,
            p2_total: result.p2_total ?? prev.p2_total,
          };
        });
      } catch (err) {
        const message =
          err instanceof MultiplayerApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not lock pick.';
        setError(message);
        throw err;
      } finally {
        setLockBusy(false);
        try {
          await refetch();
        } catch (err) {
          console.warn('[useH2HMatch] refetch after lock failed', err);
        }
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
