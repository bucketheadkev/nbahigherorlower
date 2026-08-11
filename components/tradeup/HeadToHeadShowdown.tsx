'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import {
  hapticMedium,
  hapticSuccess,
  hapticTap,
  hapticWarning,
} from '@/lib/tradeup/haptics';
import type { H2HOpponent } from '@/lib/tradeup/h2hOpponents';
import {
  cancelFrame,
  easeOutCubic,
  scheduleFrame,
} from '@/lib/tradeup/perf/rafClock';

interface HeadToHeadShowdownProps {
  playerName: string;
  playerValue: number;
  opponent: H2HOpponent;
  reduceMotion?: boolean;
  onFindNewOpponent: () => void;
  onExit: () => void;
}

type Outcome = 'win' | 'loss' | 'tie';

/**
 * H2H value showdown — paced dual count-up, brief pause, then result.
 */
export const HeadToHeadShowdown = memo(function HeadToHeadShowdown({
  playerName: _playerName,
  playerValue,
  opponent,
  reduceMotion = false,
  onFindNewOpponent,
  onExit,
}: HeadToHeadShowdownProps) {
  const [playerShown, setPlayerShown] = useState(0);
  const [oppShown, setOppShown] = useState(0);
  const [valuesLocked, setValuesLocked] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const rafRef = useRef(0);
  const doneRef = useRef(false);

  const outcome: Outcome =
    playerValue > opponent.teamValue
      ? 'win'
      : playerValue < opponent.teamValue
        ? 'loss'
        : 'tie';

  useEffect(() => {
    if (doneRef.current) return;
    const ms = reduceMotion ? 120 : 2200;
    const t0 = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = easeOutCubic(t);
      setPlayerShown(Math.round(playerValue * e));
      setOppShown(Math.round(opponent.teamValue * e));
      if (t < 1) {
        rafRef.current = scheduleFrame(step);
        return;
      }
      setPlayerShown(playerValue);
      setOppShown(opponent.teamValue);
      setValuesLocked(true);
      doneRef.current = true;
    };

    rafRef.current = scheduleFrame(step);
    return () => cancelFrame(rafRef.current);
  }, [opponent.teamValue, playerValue, reduceMotion]);

  useEffect(() => {
    if (!valuesLocked || showResult) return;
    const pause = reduceMotion ? 80 : 850;
    const t = window.setTimeout(() => {
      setShowResult(true);
      if (outcome === 'win') hapticSuccess();
      else if (outcome === 'loss') hapticWarning();
      else hapticMedium();
    }, pause);
    return () => window.clearTimeout(t);
  }, [outcome, reduceMotion, showResult, valuesLocked]);

  const headline =
    outcome === 'win'
      ? 'YOU WIN'
      : outcome === 'loss'
        ? 'OPPONENT WINS'
        : 'TIE';

  return (
    <div
      className={`h2h-showdown is-${outcome}${valuesLocked ? ' is-locked' : ''}${
        showResult ? ' is-resolved' : ''
      }`}
      aria-label="Head-to-Head result"
    >
      <header className="h2h-showdown__names">
        <span>YOU</span>
        <em>VS</em>
        <span>OPPONENT</span>
      </header>

      <p className="h2h-showdown__mode">HEAD-TO-HEAD</p>
      <p className="h2h-showdown__headline">
        {showResult ? headline : 'VALUE SHOWDOWN'}
      </p>

      <div className="h2h-showdown__rows">
        <div className="h2h-showdown__row">
          <span>YOU</span>
          <strong>{formatDollarsExact(playerShown)}</strong>
        </div>
        <div className="h2h-showdown__row h2h-showdown__row--opp">
          <span>OPPONENT</span>
          <strong>{formatDollarsExact(oppShown)}</strong>
        </div>
      </div>

      {showResult ? (
        <div className="h2h-showdown__actions">
          <button
            type="button"
            className="h2h-showdown__rematch"
            onPointerDown={(e) => {
              e.preventDefault();
              hapticTap();
              onFindNewOpponent();
            }}
          >
            FIND NEW OPPONENT
          </button>
          <button
            type="button"
            className="h2h-showdown__home"
            onPointerDown={(e) => {
              e.preventDefault();
              hapticTap();
              onExit();
            }}
          >
            Home
          </button>
        </div>
      ) : null}
    </div>
  );
});
