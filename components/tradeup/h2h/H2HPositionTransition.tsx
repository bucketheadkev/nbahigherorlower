'use client';

import { useEffect, useRef, useState } from 'react';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';

export const H2H_POSITION_TRANSITION_MS = 2500;

interface H2HPositionTransitionProps {
  position: H2HPosition;
  onDone: () => void;
}

/** Brief interstitial before the next position reveal (PG → SG → … → C). */
export function H2HPositionTransition({ position, onDone }: H2HPositionTransitionProps) {
  const reduceMotion = getPrefersReducedMotion();
  const [visible, setVisible] = useState(!reduceMotion);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (reduceMotion) {
      onDoneRef.current();
      return;
    }
    setVisible(false);
    const fadeIn = window.setTimeout(() => setVisible(true), 16);
    const done = window.setTimeout(() => onDoneRef.current(), H2H_POSITION_TRANSITION_MS);
    return () => {
      window.clearTimeout(fadeIn);
      window.clearTimeout(done);
    };
  }, [position, reduceMotion]);

  if (reduceMotion) return null;

  const label = POSITION_LABELS[position];

  return (
    <div className="h2h-lobby h2h-lobby--reveal" aria-label={`Next position: ${label}`}>
      <div
        className={`h2h-pos-transition${visible ? ' is-visible' : ''}`}
        role="status"
        aria-live="polite"
      >
        <p className="h2h-pos-transition__eyebrow">Next position</p>
        <p className="h2h-pos-transition__pos">{position}</p>
        <p className="h2h-pos-transition__label">{label}</p>
      </div>
    </div>
  );
}
