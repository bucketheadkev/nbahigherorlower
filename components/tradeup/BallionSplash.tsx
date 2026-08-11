'use client';

import { useEffect, useState } from 'react';
import { BALLION_SPLASH_LOGO_SRC } from './TradeUpLogo';

interface BallionSplashProps {
  onDone: () => void;
  reduceMotion?: boolean;
}

/**
 * Launch splash — solid $1B RUN navy + centered logo + load bar.
 */
export function BallionSplash({ onDone, reduceMotion = false }: BallionSplashProps) {
  const [phase, setPhase] = useState<'enter' | 'load' | 'exit'>('enter');

  useEffect(() => {
    const img = new window.Image();
    img.src = BALLION_SPLASH_LOGO_SRC;
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      const t = window.setTimeout(onDone, 700);
      return () => window.clearTimeout(t);
    }

    const enterMs = 280;
    const loadMs = 1850;
    const exitMs = 320;

    const t1 = window.setTimeout(() => setPhase('load'), enterMs);
    const t2 = window.setTimeout(() => setPhase('exit'), enterMs + loadMs);
    const t3 = window.setTimeout(onDone, enterMs + loadMs + exitMs);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [onDone, reduceMotion]);

  return (
    <div
      className={`ballion-splash is-${phase}${reduceMotion ? ' is-instant' : ''}`}
      aria-label="$1B RUN"
      role="status"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="ballion-splash__logo ballion-splash__logo--run"
        src={BALLION_SPLASH_LOGO_SRC}
        alt="$1B RUN"
        width={1024}
        height={1024}
        decoding="sync"
        fetchPriority="high"
      />
      <div className="ballion-splash__bar" aria-hidden>
        <span className="ballion-splash__bar-fill" />
      </div>
    </div>
  );
}
