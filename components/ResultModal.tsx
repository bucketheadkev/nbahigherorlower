'use client';

import { AdSlot } from '@/components/AdSlot';
import { ShareButton } from '@/components/ShareButton';
import { formatXHandle, getXUsername, submitLeaderboardScore } from '@/lib/xUsername';
import { useEffect, useState } from 'react';

interface ResultModalProps {
  streak: number;
  mode: string;
  onPlayAgain: () => void;
  onHome: () => void;
}

export function ResultModal({ streak, mode, onPlayAgain, onHome }: ResultModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    const handle = getXUsername();
    setUsername(handle);
    if (handle && streak > 0) {
      submitLeaderboardScore(streak, mode).then(setSubmitted);
    }
  }, [streak, mode]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
      <div className="glass-card animate-card-enter w-full max-w-md p-6 sm:p-8">
        <div className="text-center">
          <p className="section-label">Run ended</p>
          <h2 className="title-display mt-3 text-4xl text-white sm:text-5xl">{streak}</h2>
          <p className="mt-2 text-base text-white/55">streak — can you beat this?</p>
        </div>

        {username ? (
          <p className="mt-4 text-center text-sm text-white/45">
            {submitted
              ? `${formatXHandle(username)} updated on the global leaderboard`
              : `Posting score for ${formatXHandle(username)}…`}
          </p>
        ) : (
          <p className="mt-4 text-center text-sm text-white/45">
            Type your X username on the home page to appear on the leaderboard.
          </p>
        )}

        <div className="mt-6">
          <ShareButton streak={streak} />
        </div>

        <AdSlot className="mt-6" />

        <div className="mt-6 flex flex-col gap-3">
          <button type="button" onClick={onPlayAgain} className="btn-primary w-full">
            Play again
          </button>
          <button type="button" onClick={onHome} className="btn-secondary w-full">
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
