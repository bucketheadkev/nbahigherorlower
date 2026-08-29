'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getTeamColors, contrastOnPrimary } from '@/lib/tradeup/teamColors';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HPickSelection, H2HRoundPublic } from '@/lib/multiplayer/h2hState';
import { playH2HRoundWinSound, prepareH2HEmojiAudio } from '@/lib/tradeup/h2hEmojiSound';
import { H2HEmojiReactions } from './H2HEmojiReactions';

const REVEAL_MS = 1400;

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
  onContinue: () => void;
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
  onContinue,
}: H2HMatchupRevealProps) {
  const reduceMotion = getPrefersReducedMotion();
  const resolvedAt = round.resolved_at ? Date.parse(round.resolved_at) : Date.now();
  const [progress, setProgress] = useState(() =>
    reduceMotion ? 1 : Math.min(1, Math.max(0, (Date.now() - resolvedAt) / REVEAL_MS)),
  );
  const roundWinSoundPlayed = useRef(false);

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
  const positionLabel = POSITION_LABELS[position];

  const iAmP1 = myPlayerNumber === 1;
  const left = iAmP1
    ? { name: p1Name, you: true, selection: round.p1_selection, won: round.matchup_winner === 'p1' }
    : { name: p2Name, you: true, selection: round.p2_selection, won: round.matchup_winner === 'p2' };
  const right = iAmP1
    ? { name: p2Name, you: false, selection: round.p2_selection, won: round.matchup_winner === 'p2' }
    : { name: p1Name, you: false, selection: round.p1_selection, won: round.matchup_winner === 'p1' };

  const winnerSide = useMemo(() => {
    if (round.matchup_winner === 'p1') return iAmP1 ? 'left' : 'right';
    if (round.matchup_winner === 'p2') return iAmP1 ? 'right' : 'left';
    return null;
  }, [iAmP1, round.matchup_winner]);

  const winnerHeadline = useMemo(() => {
    if (round.matchup_winner === 'tie') return `Tie — ${positionLabel}`;
    const winnerName =
      round.matchup_winner === 'p1'
        ? p1Name.split(/\s+/)[0] ?? p1Name
        : p2Name.split(/\s+/)[0] ?? p2Name;
    return `${winnerName} wins ${positionLabel}`;
  }, [p1Name, p2Name, positionLabel, round.matchup_winner]);

  const iWonRound = (left.you && left.won) || (right.you && right.won);

  useEffect(() => {
    if (!done || roundWinSoundPlayed.current) return;
    roundWinSoundPlayed.current = true;
    if (iWonRound) {
      prepareH2HEmojiAudio();
      playH2HRoundWinSound();
    }
  }, [done, iWonRound]);

  return (
    <div className="h2h-lobby h2h-lobby--reveal" aria-label={`${position} matchup`}>
      <div className={`h2h-reveal__body${done ? ' is-done' : ''}`}>
        {done ? (
          <p
            className={`h2h-reveal__winner${iWonRound ? ' is-you-win' : winnerSide ? ' is-opp-win' : ' is-tie'}`}
            role="status"
          >
            {winnerHeadline}
          </p>
        ) : (
          <p className="h2h-reveal__pos">{position}</p>
        )}

        <div className="h2h-reveal__match">
          <PlayerCard
            position={position}
            side="left"
            {...left}
            highlight={done && winnerSide === 'left'}
            dimmed={done && winnerSide === 'right'}
          />
          <PlayerCard
            position={position}
            side="right"
            {...right}
            highlight={done && winnerSide === 'right'}
            dimmed={done && winnerSide === 'left'}
          />
        </div>
      </div>

      {done ? (
        <div className="h2h-reveal__footer">
          <H2HEmojiReactions
            key={position}
            roomId={roomId}
            position={position}
            myPlayerNumber={myPlayerNumber}
            enabled
          />

          {isHost ? (
            <button
              type="button"
              className="run-btn run-btn--primary h2h-reveal__next ui-tap"
              disabled={continueBusy}
              onPointerDown={(e) => {
                e.preventDefault();
                if (continueBusy) return;
                onContinue();
              }}
            >
              <strong>{continueBusy ? '…' : isLast ? 'Results' : 'Next'}</strong>
            </button>
          ) : (
            <p className="h2h-reveal__wait" role="status">
              Waiting for host…
            </p>
          )}
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
  won,
  highlight,
  dimmed,
}: {
  position: H2HPosition;
  side: 'left' | 'right';
  name: string;
  you: boolean;
  selection: H2HPickSelection | null | undefined;
  won: boolean;
  highlight: boolean;
  dimmed: boolean;
}) {
  const colors = selection ? getTeamColors(selection.teamId) : { primary: '#10202b' };
  const ink = contrastOnPrimary(colors.primary);

  return (
    <div
      className={`h2h-reveal__side h2h-reveal__side--${side}${you ? ' is-you' : ''}${won ? ' is-win' : ''}${highlight ? ' is-highlight' : ''}${dimmed ? ' is-dimmed' : ''}`}
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
      </div>
    </div>
  );
}
