'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { H2H_POSITIONS, type H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HRoundPublic } from '@/lib/multiplayer/h2hState';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { H2HMatchupReveal } from './H2HMatchupReveal';
interface H2HRevealSequenceProps {
  roomId: string;
  rounds: H2HRoundPublic[];
  p1Name: string;
  p2Name: string;
  myPlayerNumber: 1 | 2;
  isHost: boolean;
  scoreFormatter?: (rounds: H2HRoundPublic[]) => { p1: number; p2: number };
  /** Custom score display for score line (e.g. KO win counts). */
  formatScore?: (value: number) => string;
  onComplete: () => void;
}

/**
 * Client-side PG→C reveal rounds after both lineups are locked.
 * Emojis + bounce animations fire on each position reveal.
 */
export function H2HRevealSequence({
  roomId,
  rounds,
  p1Name,
  p2Name,
  myPlayerNumber,
  isHost,
  scoreFormatter,
  formatScore,
  onComplete,
}: H2HRevealSequenceProps) {
  const orderedRounds = useMemo(
    () =>
      H2H_POSITIONS.map((pos) => rounds.find((r) => r.position === pos)).filter(
        (r): r is H2HRoundPublic => Boolean(r?.matchup_resolved),
      ),
    [rounds],
  );

  const [index, setIndex] = useState(0);
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>['channel']> | null>(
    null,
  );
  const round = orderedRounds[index];
  const isLast = index >= orderedRounds.length - 1;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`h2h_reveal:${roomId}`)
      .on('broadcast', { event: 'reveal_step' }, ({ payload }) => {
        const row = payload as { index?: number; from?: number };
        if (row.from === myPlayerNumber) return;
        if (typeof row.index === 'number') {
          setIndex(Math.min(row.index, Math.max(0, orderedRounds.length - 1)));
        }
      })
      .on('broadcast', { event: 'reveal_finish' }, ({ payload }) => {
        const row = payload as { from?: number };
        if (row.from === myPlayerNumber) return;
        onComplete();
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [myPlayerNumber, onComplete, orderedRounds.length, roomId]);

  const runningTotals = useMemo(() => {
    if (!round) return null;
    const slice = orderedRounds.slice(0, index + 1);
    const totals = scoreFormatter
      ? scoreFormatter(slice)
      : { p1: round.p1_total ?? 0, p2: round.p2_total ?? 0 };
    const iAmP1 = myPlayerNumber === 1;
    return {
      left: iAmP1 ? totals.p1 : totals.p2,
      right: iAmP1 ? totals.p2 : totals.p1,
    };
  }, [index, myPlayerNumber, orderedRounds, round, scoreFormatter]);
  const handleContinue = useCallback(() => {
    if (!isHost) return;
    if (isLast) {
      void channelRef.current?.send({
        type: 'broadcast',
        event: 'reveal_finish',
        payload: { from: myPlayerNumber },
      });
      onComplete();
      return;
    }
    const next = index + 1;
    setIndex(next);
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'reveal_step',
      payload: { index: next, from: myPlayerNumber },
    });
  }, [index, isHost, isLast, myPlayerNumber, onComplete]);
  useEffect(() => {
    if (orderedRounds.length === 0) onComplete();
  }, [onComplete, orderedRounds.length]);

  if (!round) return null;

  return (
    <H2HMatchupReveal
      roomId={roomId}
      position={round.position as H2HPosition}
      round={round}
      p1Name={p1Name}
      p2Name={p2Name}
      myPlayerNumber={myPlayerNumber}
      isHost={isHost}
      continueBusy={false}
      isLast={isLast}
      runningTotals={runningTotals}
      formatScore={formatScore}
      onContinue={handleContinue}    />
  );
}
