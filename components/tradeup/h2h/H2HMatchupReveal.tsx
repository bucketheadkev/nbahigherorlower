'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { getTeamColors, contrastOnPrimary } from '@/lib/tradeup/teamColors';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HPickSelection, H2HRoundPublic } from '@/lib/multiplayer/h2hState';
import { H2HEmojiReactions } from './H2HEmojiReactions';

const REVEAL_MS = 1400;
const NEXT_DELAY_MS = 2200;

interface H2HMatchupRevealProps {
  roomId: string;
  position: H2HPosition;
  round: H2HRoundPublic;
  p1Name: string;
  p2Name: string;
  myPlayerNumber: 1 | 2;
  isHost: boolean;
  continueBusy: boolean;
  isLast: boolean;
  runningTotals?: { left: number; right: number } | null;
  formatScore?: (value: number) => string;
  onContinue: () => void;
}

function lerp(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * t);
}

function roundValue(raw: number | null | undefined, adj: number | null | undefined): number {
  return raw ?? adj ?? 0;
}

export function H2HMatchupReveal({
  roomId,
  position,
  round,
  p1Name,
  p2Name,
  myPlayerNumber,
  isHost,
  continueBusy,
  isLast,
  runningTotals = null,
  formatScore,
  onContinue,
}: H2HMatchupRevealProps) {
  const reduceMotion = getPrefersReducedMotion();
  const resolvedAt = round.resolved_at ? Date.parse(round.resolved_at) : Date.now();
  const [progress, setProgress] = useState(() =>
    reduceMotion ? 1 : Math.min(1, Math.max(0, (Date.now() - resolvedAt) / REVEAL_MS)),
  );
  const [canAdvance, setCanAdvance] = useState(false);
  const [countdown, setCountdown] = useState(2);

  useEffect(() => {
    if (reduceMotion) {
      setProgress(1);
      return;
    }
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, Math.max(0, (Date.now() - resolvedAt) / REVEAL_MS));
      setProgress(t);
      if (t < 1) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [reduceMotion, resolvedAt]);

  const done = progress >= 1;

  useEffect(() => {
    if (!done) {
      setCanAdvance(false);
      setCountdown(2);
      return;
    }
    const started = Date.now();
    setCanAdvance(false);
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - started;
      setCountdown(Math.max(0, Math.ceil((NEXT_DELAY_MS - elapsed) / 1000)));
      if (elapsed >= NEXT_DELAY_MS) {
        setCanAdvance(true);
        window.clearInterval(tick);
      }
    }, 200);
    return () => window.clearInterval(tick);
  }, [done, position]);

  const p1Raw = roundValue(round.p1_raw_value, round.p1_adjusted_value);
  const p2Raw = roundValue(round.p2_raw_value, round.p2_adjusted_value);
  const p1Shown = lerp(0, p1Raw, progress);
  const p2Shown = lerp(0, p2Raw, progress);

  const iAmP1 = myPlayerNumber === 1;
  const left = iAmP1
    ? { name: p1Name, you: true, selection: round.p1_selection, shown: p1Shown, won: round.matchup_winner === 'p1' }
    : { name: p2Name, you: true, selection: round.p2_selection, shown: p2Shown, won: round.matchup_winner === 'p2' };
  const right = iAmP1
    ? { name: p2Name, you: false, selection: round.p2_selection, shown: p2Shown, won: round.matchup_winner === 'p2' }
    : { name: p1Name, you: false, selection: round.p1_selection, shown: p1Shown, won: round.matchup_winner === 'p1' };

  const winnerSide = useMemo(() => {
    if (round.matchup_winner === 'p1') return iAmP1 ? 'left' : 'right';
    if (round.matchup_winner === 'p2') return iAmP1 ? 'right' : 'left';
    return null;
  }, [iAmP1, round.matchup_winner]);

  const fmt = formatScore ?? formatDollarsExact;
  const leftTotalAhead =
    runningTotals != null && runningTotals.left > runningTotals.right;
  const rightTotalAhead =
    runningTotals != null && runningTotals.right > runningTotals.left;

  return (
    <div className="h2h-lobby h2h-lobby--reveal" aria-label={`${position} matchup`}>
      <div className="h2h-reveal__body">
        <p className="h2h-reveal__pos">{position}</p>

        {runningTotals ? (
          <div className="h2h-reveal__score-row" aria-label="Running totals">
            <span
              className={`h2h-reveal__score-side h2h-reveal__score-side--left${leftTotalAhead ? ' is-ahead' : ''}`}
            >
              {fmt(runningTotals.left)}
            </span>
            <span
              className={`h2h-reveal__score-side h2h-reveal__score-side--right${rightTotalAhead ? ' is-ahead' : ''}`}
            >
              {fmt(runningTotals.right)}
            </span>
          </div>
        ) : null}

        <div className="h2h-reveal__match">
          <PlayerCard
            position={position}
            side="left"
            {...left}
            highlight={winnerSide === 'left'}
          />
          <PlayerCard
            position={position}
            side="right"
            {...right}
            highlight={winnerSide === 'right'}
          />
        </div>
      </div>

      {done ? (
        <div className="h2h-reveal__footer">
          <H2HEmojiReactions
            roomId={roomId}
            position={position}
            myPlayerNumber={myPlayerNumber}
            enabled
          />

          {isHost ? (
            <button
              type="button"
              className="run-btn run-btn--primary h2h-reveal__next ui-tap"
              disabled={continueBusy || !canAdvance}
              onClick={onContinue}
            >
              <strong>
                {continueBusy
                  ? '…'
                  : !canAdvance
                    ? `${countdown}`
                    : isLast
                      ? 'Results'
                      : 'Next'}
              </strong>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PlayerCard({
  position,
  side,
  name,
  you,
  selection,
  shown,
  won,
  highlight,
}: {
  position: H2HPosition;
  side: 'left' | 'right';
  name: string;
  you: boolean;
  selection: H2HPickSelection | null | undefined;
  shown: number;
  won: boolean;
  highlight: boolean;
}) {
  const colors = selection ? getTeamColors(selection.teamId) : { primary: '#10202b' };
  const ink = contrastOnPrimary(colors.primary);

  return (
    <div
      className={`h2h-reveal__side h2h-reveal__side--${side}${you ? ' is-you' : ''}${won ? ' is-win' : ''}${highlight ? ' is-highlight' : ''}`}
    >
      <p className="h2h-reveal__side-label">{you ? 'You' : name.split(/\s+/)[0] ?? name}</p>
      <div
        className="h2h-reveal__card"
        style={{ background: colors.primary, color: ink }}
      >
        <span className="h2h-reveal__card-pos" style={{ color: ink, opacity: 0.72 }}>
          {position}
        </span>
        <strong className="h2h-reveal__card-name" style={{ color: ink }}>
          {selection?.name ?? '—'}
        </strong>
        <em className="h2h-reveal__card-value" style={{ color: ink }}>
          {formatDollarsExact(shown)}
        </em>
      </div>
    </div>
  );
}
