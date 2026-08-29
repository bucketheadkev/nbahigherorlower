'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { H2H_POSITIONS, type H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HRoundPublic } from '@/lib/multiplayer/h2hState';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { H2HMatchupReveal } from './H2HMatchupReveal';
import { H2HPositionTransition } from './H2HPositionTransition';

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
  const [pendingPosition, setPendingPosition] = useState<H2HPosition | null>(null);
  const indexRef = useRef(0);
  indexRef.current = index;
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
          setPendingPosition(null);
          setIndex(Math.min(row.index, Math.max(0, orderedRounds.length - 1)));
        }
      })
      .on('broadcast', { event: 'reveal_transition' }, ({ payload }) => {
        const row = payload as { position?: H2HPosition; from?: number };
        if (row.from === myPlayerNumber) return;
        if (row.position && H2H_POSITIONS.includes(row.position)) {
          setPendingPosition(row.position);
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
    const nextRound = orderedRounds[index + 1];
    if (!nextRound) return;
    const nextPos = nextRound.position as H2HPosition;
    setPendingPosition(nextPos);
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'reveal_transition',
      payload: { position: nextPos, from: myPlayerNumber },
    });
  }, [index, isHost, isLast, myPlayerNumber, onComplete, orderedRounds]);

  const finishTransition = useCallback(() => {
    const next = indexRef.current + 1;
    setPendingPosition(null);
    setIndex(next);
    if (isHost) {
      void channelRef.current?.send({
        type: 'broadcast',
        event: 'reveal_step',
        payload: { index: next, from: myPlayerNumber },
      });
    }
  }, [isHost, myPlayerNumber]);

  useEffect(() => {
    if (orderedRounds.length === 0) onComplete();
  }, [onComplete, orderedRounds.length]);

  if (pendingPosition) {
    return (
      <H2HPositionTransition
        position={pendingPosition}
        onDone={finishTransition}
      />
    );
  }

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
      onContinue={handleContinue}
    />
  );
}
