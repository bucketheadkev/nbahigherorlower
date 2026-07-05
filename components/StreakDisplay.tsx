'use client';

import { useEffect } from 'react';

interface StreakDisplayProps {
  streak: number;
  bestStreak: number;
  pop?: boolean;
  onPopComplete?: () => void;
}

export function StreakDisplay({ streak, bestStreak, pop = false, onPopComplete }: StreakDisplayProps) {
  useEffect(() => {
    if (!pop || !onPopComplete) return;
    const timer = setTimeout(onPopComplete, 500);
    return () => clearTimeout(timer);
  }, [pop, onPopComplete]);

  return (
    <div className="inline-flex items-center gap-4 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2">
      <div className="text-right">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">Streak</p>
        <p className={`text-lg font-semibold tabular-nums text-white ${pop ? 'animate-streak-pop' : ''}`}>
          {streak}
        </p>
      </div>
      <div className="h-8 w-px bg-white/10" />
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">Best</p>
        <p className="text-lg font-semibold tabular-nums text-white/70">{bestStreak}</p>
      </div>
    </div>
  );
}
