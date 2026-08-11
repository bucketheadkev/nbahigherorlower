'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';
import type { H2HOpponent } from '@/lib/tradeup/h2hOpponents';
import { generateIndependentH2HOpponent } from '@/lib/tradeup/h2hOpponents';

type MmPhase = 'enter' | 'searching' | 'found' | 'intro';

interface HeadToHeadMatchmakingProps {
  reduceMotion?: boolean;
  /** Avoid repeating the last rematch opponent when possible. */
  excludeName?: string | null;
  onReady: (opponent: H2HOpponent) => void;
  onExit: () => void;
}

function randomSearchMs(reduceMotion: boolean): number {
  if (reduceMotion) return 240;
  return 2000 + Math.floor(Math.random() * 1001);
}

/**
 * Staged H2H matchmaking — YOU vs OPPONENT, no avatars/names.
 */
export const HeadToHeadMatchmaking = memo(function HeadToHeadMatchmaking({
  reduceMotion = false,
  excludeName = null,
  onReady,
  onExit,
}: HeadToHeadMatchmakingProps) {
  const [phase, setPhase] = useState<MmPhase>('enter');
  const opponentRef = useRef<H2HOpponent | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    opponentRef.current = generateIndependentH2HOpponent(excludeName);
    const timers: number[] = [];

    const enterMs = reduceMotion ? 80 : 500;
    const searchMs = randomSearchMs(reduceMotion);
    const foundMs = reduceMotion ? 140 : 1200;
    const introMs = reduceMotion ? 200 : 3000;

    timers.push(
      window.setTimeout(() => {
        setPhase('searching');
      }, enterMs),
    );

    timers.push(
      window.setTimeout(() => {
        hapticMedium();
        setPhase('found');
      }, enterMs + searchMs),
    );

    timers.push(
      window.setTimeout(() => {
        hapticLight();
        setPhase('intro');
      }, enterMs + searchMs + foundMs),
    );

    timers.push(
      window.setTimeout(() => {
        const opp = opponentRef.current;
        if (opp) onReadyRef.current(opp);
      }, enterMs + searchMs + foundMs + introMs),
    );

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [excludeName, reduceMotion]);

  const status =
    phase === 'enter' || phase === 'searching'
      ? 'FINDING OPPONENT'
      : phase === 'found'
        ? 'OPPONENT FOUND'
        : null;

  return (
    <div className={`h2hmm is-${phase}`} aria-label="Head-to-Head matchmaking">
      <button type="button" className="h2hmm__back" onPointerDown={onExit}>
        ← Home
      </button>

      <header className="h2hmm__names" aria-live="polite">
        <span className="h2hmm__name h2hmm__name--you">YOU</span>
        <span className="h2hmm__name-vs">VS</span>
        <span
          className={`h2hmm__name h2hmm__name--opp${
            phase === 'enter' || phase === 'searching' ? ' is-searching' : ' is-locked'
          }`}
        >
          OPPONENT
        </span>
      </header>

      <p className="h2hmm__mode">HEAD-TO-HEAD</p>

      {status ? <p className={`h2hmm__status is-${phase}`}>{status}</p> : null}

      {phase === 'intro' ? (
        <p className="h2hmm__objective">
          BUILD THE MORE
          <br />
          VALUABLE TEAM
          <em>5 PLAYERS · HIGHEST VALUE WINS</em>
        </p>
      ) : null}
    </div>
  );
});
