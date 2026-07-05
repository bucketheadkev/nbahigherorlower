'use client';

import { getComparisonCopy } from '@/lib/categories';
import { FULL_RUN_MODE } from '@/lib/gameModes';
import { formatXHandle, getXUsername, submitLeaderboardScore } from '@/lib/xUsername';
import type { LoseReason, RoundState } from '@/types/game';
import { useEffect, useState } from 'react';

interface GameOverScreenProps {
  round: RoundState;
  streak: number;
  loseReason: LoseReason;
  secondsLeft: number;
  onRestart: () => void;
}

export function GameOverScreen({
  round,
  streak,
  loseReason,
  secondsLeft,
  onRestart,
}: GameOverScreenProps) {
  const [submitted, setSubmitted] = useState(false);
  const copy = getComparisonCopy(round.hiddenPlayer, round.revealedPlayer, round.category);
  const title = loseReason === 'timeout' ? "Time's up!" : 'Wrong answer';

  useEffect(() => {
    const handle = getXUsername();
    if (handle && streak > 0) {
      submitLeaderboardScore(streak, FULL_RUN_MODE).then(setSubmitted);
    }
  }, [streak]);

  return (
    <div className="game-over-screen">
      <div className="game-over-card animate-card-enter">
        <p className="section-label">{title}</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">The answer was</h2>
        <p className="mt-4 text-lg leading-relaxed text-orange-300">{copy.hiddenReveal}</p>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
          <p className="text-sm text-white/45">Your streak</p>
          <p className="title-display mt-1 text-4xl text-white">{streak}</p>
        </div>

        {getXUsername() ? (
          <p className="mt-4 text-center text-xs text-white/40">
            {submitted
              ? `${formatXHandle(getXUsername())} updated on the global leaderboard`
              : 'Saving your score…'}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <button type="button" onClick={onRestart} className="btn-accent w-full">
            Restart game
          </button>
          <p className="text-center text-sm text-white/40">
            {secondsLeft > 0
              ? `Returning home in ${secondsLeft}s…`
              : 'Returning home…'}
          </p>
        </div>
      </div>
    </div>
  );
}
