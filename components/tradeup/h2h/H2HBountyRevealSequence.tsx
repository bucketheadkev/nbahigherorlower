'use client';

import { useEffect, useRef, useState } from 'react';
import type { BountyMultiplier } from '@/lib/multiplayer/gameModes';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import { h2hDebug } from '@/lib/multiplayer/h2hDebug';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import { hapticLight, hapticMedium, hapticSuccess } from '@/lib/tradeup/haptics';
import { GameBackground } from '../game/GameBackground';

type RevealStage =
  | 'breathe'
  | 'positionSuspense'
  | 'position'
  | 'multiplierSuspense'
  | 'multiplier'
  | 'done';

interface H2HBountyRevealSequenceProps {
  bountyPosition: H2HPosition;
  multiplier: BountyMultiplier;
  onComplete: () => void;
}

/**
 * Bounty announcement only — position + multiplier + short copy.
 * Does NOT reveal drafted players (that happens in showdown).
 * Stage timers are stable against parent re-renders / match polls.
 * Timing is local presentation only — not a server sync gate.
 */
export function H2HBountyRevealSequence({
  bountyPosition,
  multiplier,
  onComplete,
}: H2HBountyRevealSequenceProps) {
  const reduced = getPrefersReducedMotion();
  const [stage, setStage] = useState<RevealStage>('breathe');
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const stageRef = useRef(stage);
  stageRef.current = stage;

  useEffect(() => {
    h2hDebug('bounty.reveal.start', { bountyPosition, multiplier });
  }, [bountyPosition, multiplier]);

  useEffect(() => {
    // Visual pacing targets (local only — authoritative bounty already known).
    const delays: Record<RevealStage, number> = reduced
      ? {
          breathe: 200,
          positionSuspense: 400,
          position: 700,
          multiplierSuspense: 350,
          multiplier: 1400,
          done: 0,
        }
      : {
          breathe: 700, // lineup-complete breathing room before THE BOUNTY IS…
          positionSuspense: 1000, // hold "THE BOUNTY IS…"
          position: 1400, // hold position (e.g. POWER FORWARD)
          multiplierSuspense: 900, // "BOUNTY MULTIPLIER" suspense
          multiplier: 2300, // hero 9× + explanation together
          done: 0,
        };

    const order: RevealStage[] = [
      'breathe',
      'positionSuspense',
      'position',
      'multiplierSuspense',
      'multiplier',
      'done',
    ];
    const idx = order.indexOf(stage);
    if (idx < 0 || stage === 'done') return;

    h2hDebug('bounty.reveal.stage', { stage });

    if (stage === 'position') hapticLight();
    if (stage === 'multiplier') {
      if (multiplier >= 8) hapticSuccess();
      else hapticMedium();
    }

    const next = order[idx + 1];
    if (!next) return;
    const t = window.setTimeout(() => {
      // Ignore stale timeouts if stage advanced somehow.
      if (stageRef.current !== stage) return;
      if (next === 'done') {
        h2hDebug('bounty.reveal.complete', { bountyPosition, multiplier });
        onCompleteRef.current();
      } else {
        setStage(next);
      }
    }, delays[stage]);
    return () => window.clearTimeout(t);
    // Intentionally omit onComplete — parent poll recreates it every second.
  }, [bountyPosition, multiplier, reduced, stage]);

  const positionLabel = POSITION_LABELS[bountyPosition];
  const positionUpper = positionLabel.toUpperCase();
  const highMult = multiplier >= 8;
  const showPosChip =
    stage === 'multiplierSuspense' || stage === 'multiplier';
  const showMultiplier = stage === 'multiplier';
  const showExplain = stage === 'multiplier';

  return (
    <div className="h2h-shell h2h-shell--arena" aria-label="Bounty reveal">
      <GameBackground />
      <div className={`h2h-bounty-reveal is-${stage}${highMult ? ' is-high-mult' : ''}`}>
        <p className="h2h-bounty-reveal__kicker">BOUNTY</p>

        {(stage === 'breathe' || stage === 'positionSuspense' || stage === 'position') && (
          <h1 className="h2h-bounty-reveal__headline">
            {stage === 'breathe'
              ? 'LINEUPS COMPLETE'
              : stage === 'positionSuspense'
                ? 'THE BOUNTY IS…'
                : positionUpper}
          </h1>
        )}

        {showPosChip ? (
          <>
            <p className="h2h-bounty-reveal__pos-chip" aria-label="Bounty position">
              {positionUpper}
            </p>
            <h1
              className={`h2h-bounty-reveal__headline h2h-bounty-reveal__headline--mult${
                showMultiplier ? ' is-revealed' : ''
              }`}
            >
              {stage === 'multiplierSuspense' ? 'BOUNTY MULTIPLIER' : `${multiplier}×`}
            </h1>
          </>
        ) : null}

        {showExplain ? (
          <p className="h2h-bounty-reveal__explain" role="status">
            {`Your ${positionLabel} is worth ${multiplier}× their normal value.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
