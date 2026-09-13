'use client';

import { useEffect, useState } from 'react';
import { MoneyRain, RESULTS_POUR_TOTAL_MS } from './MoneyRain';

/**
 * Classic $1B celebration — same mega money rain as 1v1 wins (no confetti).
 * Cash-register SFX is fired by the reveal when the total settles.
 */
export function BillionCelebration({
  durationMs = RESULTS_POUR_TOTAL_MS + 350,
}: {
  durationMs?: number;
}) {
  const [alive, setAlive] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeAt = Math.max(0, durationMs - 650);
    const fadeT = window.setTimeout(() => setFading(true), fadeAt);
    const endT = window.setTimeout(() => setAlive(false), durationMs);
    return () => {
      window.clearTimeout(fadeT);
      window.clearTimeout(endT);
    };
  }, [durationMs]);

  if (!alive) return null;

  return (
    <div
      className={`billion-celebration${fading ? ' is-fading' : ''}`}
      aria-hidden
    >
      <MoneyRain intense mega />
    </div>
  );
}
