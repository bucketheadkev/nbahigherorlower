'use client';

import { AdSlot } from '@/components/AdSlot';
import { GameBoard } from '@/components/GameBoard';
import { GameOverScreen } from '@/components/GameOverScreen';
import { RoundTimer } from '@/components/RoundTimer';
import { SiteHeader } from '@/components/SiteHeader';
import { StreakDisplay } from '@/components/StreakDisplay';
import { useGame } from '@/hooks/useGame';
import { ROUND_TIME_SECONDS } from '@/lib/categoryCycle';
import { getCategoryLabel } from '@/lib/categories';
import type { FeedbackState } from '@/types/game';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export function GameScreen() {
  const router = useRouter();
  const goHome = useCallback(() => router.push('/'), [router]);

  const {
    state,
    isGameOver,
    isRevealing,
    canGuess,
    guess,
    restart,
    clearStreakPop,
    finalStreak,
    loseReason,
    gameOverSecondsLeft,
  } = useGame(goHome);

  const boardFeedback: FeedbackState = useMemo(() => {
    if (isRevealing) {
      return state.wasCorrect ? 'correct' : 'wrong';
    }
    if (isGameOver) return 'wrong';
    return 'idle';
  }, [isRevealing, isGameOver, state.wasCorrect]);

  if (!state.round) {
    return (
      <main className="page-bg flex min-h-screen items-center justify-center">
        <p className="text-white/50">Loading game…</p>
      </main>
    );
  }

  const categoryLabel = getCategoryLabel(state.round.category);
  const showAnswer = isGameOver || (isRevealing && state.wasCorrect === false);

  return (
    <main className="page-bg min-h-screen">
      <SiteHeader />

      <div className="mx-auto flex w-full max-w-4xl flex-col px-4 pb-10 pt-2 sm:px-6">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-label">Now playing</p>
            <h1 className="mt-1 text-xl font-semibold text-white">{categoryLabel}</h1>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <RoundTimer
              secondsLeft={state.secondsLeft}
              totalSeconds={ROUND_TIME_SECONDS}
              urgent={state.secondsLeft <= 10 && state.phase === 'playing'}
            />
            <StreakDisplay
              streak={state.streak}
              bestStreak={state.bestStreak}
              pop={state.streakPop}
              onPopComplete={clearStreakPop}
            />
          </div>
        </header>

        <div className="flex flex-col items-center">
          <GameBoard
            round={state.round}
            feedback={boardFeedback}
            canGuess={canGuess}
            revealHidden={showAnswer}
            onGuess={guess}
          />
        </div>

        <AdSlot className="mt-10" />
      </div>

      {isGameOver && loseReason ? (
        <GameOverScreen
          round={state.round}
          streak={finalStreak}
          loseReason={loseReason}
          secondsLeft={gameOverSecondsLeft}
          onRestart={restart}
        />
      ) : null}
    </main>
  );
}
