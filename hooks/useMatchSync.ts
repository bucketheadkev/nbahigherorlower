'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchResultRow } from '@/lib/multiplayer/match';
import {
  fetchMatchResults,
  fetchRoomLobby,
  submitMatchResult,
  updateMatchProgress,
} from '@/lib/multiplayer/rooms';
import type { RoomLobbySnapshot } from '@/lib/multiplayer/types';
import { MultiplayerApiError } from '@/lib/multiplayer/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface UseMatchSyncOptions {
  roomId: string;
  userId: string;
  enabled?: boolean;
}

interface UseMatchSyncResult {
  snapshot: RoomLobbySnapshot | null;
  results: MatchResultRow[];
  loading: boolean;
  error: string | null;
  myProgress: number;
  opponentProgress: number;
  opponentName: string;
  myResult: MatchResultRow | null;
  bothSubmitted: boolean;
  refetch: () => Promise<void>;
  pushProgress: (count: number) => Promise<void>;
  submitResult: (lineup: unknown, totalValue: number) => Promise<void>;
  submitBusy: boolean;
}

export function useMatchSync({
  roomId,
  userId,
  enabled = true,
}: UseMatchSyncOptions): UseMatchSyncResult {
  const [snapshot, setSnapshot] = useState<RoomLobbySnapshot | null>(null);
  const [results, setResults] = useState<MatchResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const lastProgressSent = useRef(-1);
  const submittedLock = useRef(false);

  const refetch = useCallback(async () => {
    if (!enabled || !roomId) return;
    try {
      const [lobby, matchResults] = await Promise.all([
        fetchRoomLobby(roomId),
        fetchMatchResults(roomId),
      ]);
      if (roomIdRef.current !== roomId) return;
      setSnapshot(lobby);
      setResults(matchResults);
      setError(null);
      if (matchResults.some((r) => r.user_id === userId)) {
        submittedLock.current = true;
      }
    } catch (err) {
      if (roomIdRef.current !== roomId) return;
      const message =
        err instanceof MultiplayerApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not load match.';
      setError(message);
    } finally {
      if (roomIdRef.current === roomId) setLoading(false);
    }
  }, [enabled, roomId, userId]);

  useEffect(() => {
    if (!enabled || !roomId) return;

    setLoading(true);
    void refetch();

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`mp_match:${roomId}`)
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_results',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
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

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('focus', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [enabled, roomId, refetch]);

  const pushProgress = useCallback(
    async (count: number) => {
      const next = Math.max(0, Math.min(5, Math.round(count)));
      if (next <= lastProgressSent.current) return;
      lastProgressSent.current = next;
      try {
        await updateMatchProgress(roomId, next);
      } catch (err) {
        // Allow retry on next tick if send failed
        lastProgressSent.current = next - 1;
        const message =
          err instanceof MultiplayerApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not sync progress.';
        setError(message);
      }
    },
    [roomId],
  );

  const submitResult = useCallback(
    async (lineup: unknown, totalValue: number) => {
      if (submittedLock.current || submitBusy) return;
      submittedLock.current = true;
      setSubmitBusy(true);
      setError(null);
      try {
        await submitMatchResult(roomId, lineup, totalValue);
        await refetch();
      } catch (err) {
        const code = err instanceof MultiplayerApiError ? err.code : '';
        if (code !== 'ALREADY_SUBMITTED') {
          submittedLock.current = false;
        }
        const message =
          err instanceof MultiplayerApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not submit match result.';
        setError(message);
        throw err;
      } finally {
        setSubmitBusy(false);
      }
    },
    [refetch, roomId, submitBusy],
  );

  const players = snapshot?.players ?? [];
  const me = players.find((p) => p.user_id === userId) ?? null;
  const opponent = players.find((p) => p.user_id !== userId) ?? null;
  const myResult = results.find((r) => r.user_id === userId) ?? null;

  return {
    snapshot,
    results,
    loading,
    error,
    myProgress: me?.match_progress ?? 0,
    opponentProgress: opponent?.match_progress ?? 0,
    opponentName: opponent?.display_name ?? 'Opponent',
    myResult,
    bothSubmitted: results.length >= 2,
    refetch,
    pushProgress,
    submitResult,
    submitBusy,
  };
}
