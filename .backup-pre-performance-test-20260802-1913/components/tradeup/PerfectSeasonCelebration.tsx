'use client';

import { useEffect, useState } from 'react';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { ChampionshipRingVisual } from './ChampionshipRingVisual';

interface PerfectSeasonCelebrationProps {
  active: boolean;
}

/**
 * Unique 82–0 celebration: a championship ring drops onto the screen.
 * Never shown for any other record.
 */
export function PerfectSeasonCelebration({ active }: PerfectSeasonCelebrationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const reduceMotion = getPrefersReducedMotion();
    setVisible(true);
    if (reduceMotion) return;
    const timer = window.setTimeout(() => {
      /* Keep ring present after drop — it settles into the final card area. */
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active || !visible) return null;

  return (
    <div className="perfect-ring-drop" aria-hidden>
      <div className="perfect-ring-drop__burst" />
      <div className="perfect-ring-drop__trail" />
      <div className="perfect-ring-drop__ring">
        <ChampionshipRingVisual size="hero" animate />
      </div>
      <p className="perfect-ring-drop__label">Championship Ring</p>
    </div>
  );
}
