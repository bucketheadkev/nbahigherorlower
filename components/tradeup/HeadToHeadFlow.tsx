'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';
import type { H2HOpponent } from '@/lib/tradeup/h2hOpponents';
import { HeadToHeadMatchmaking } from './HeadToHeadMatchmaking';
import { TradeUpLoading } from './TradeUpLoading';

const BillionTradeEngine = dynamic(
  () =>
    import('./BillionTradeEngine').then((mod) => ({
      default: mod.BillionTradeEngine,
    })),
  { loading: () => <TradeUpLoading /> },
);

type H2HScreen = 'matchmaking' | 'playing';

interface HeadToHeadFlowProps {
  onExit: () => void;
}

/**
 * Head-to-Head shell — matchmaking → reused Billion draft → value showdown.
 * Does not alter the Billion Challenge home path.
 */
export function HeadToHeadFlow({ onExit }: HeadToHeadFlowProps) {
  const reduceMotion = useGameReducedMotion();
  const [screen, setScreen] = useState<H2HScreen>('matchmaking');
  const [opponent, setOpponent] = useState<H2HOpponent | null>(null);
  const [excludeName, setExcludeName] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(0);

  const handleReady = useCallback((next: H2HOpponent) => {
    setOpponent(next);
    setScreen('playing');
  }, []);

  const handleFindNew = useCallback(() => {
    setExcludeName(opponent?.displayName ?? null);
    setOpponent(null);
    setRunKey((k) => k + 1);
    setScreen('matchmaking');
  }, [opponent?.displayName]);

  if (screen === 'matchmaking' || !opponent) {
    return (
      <HeadToHeadMatchmaking
        key={`mm-${runKey}`}
        reduceMotion={reduceMotion}
        excludeName={excludeName}
        onReady={handleReady}
        onExit={onExit}
      />
    );
  }

  return (
    <BillionTradeEngine
      key={`h2h-${runKey}-${opponent.id}`}
      challengeMode="h2h"
      h2hOpponent={opponent}
      h2hPlayerName="YOU"
      onExit={onExit}
      onPlayAgain={handleFindNew}
    />
  );
}
