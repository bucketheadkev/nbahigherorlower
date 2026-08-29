'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { BALLION_SPLASH_LOGO_SRC } from './TradeUpLogo';

interface BallionSplashProps {
  onDone: () => void;
  reduceMotion?: boolean;
}

/**
 * Premium splash — navy field, soft electric-blue bloom,
 * transparent squircle app icon, minimal load rail.
 */
export function BallionSplash({ onDone, reduceMotion = false }: BallionSplashProps) {
  const { t } = useLocale();
  const [phase, setPhase] = useState<'enter' | 'load' | 'exit'>('enter');
  const onDoneRef = useRef(onDone);
  const finishedRef = useRef(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const img = new window.Image();
    img.src = BALLION_SPLASH_LOGO_SRC;
  }, []);

  useEffect(() => {
    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onDoneRef.current();
    };

    if (reduceMotion) {
      const t = window.setTimeout(finish, 720);
      return () => window.clearTimeout(t);
    }

    const enterMs = 320;
    const loadMs = 1900;
    const exitMs = 340;
    const t1 = window.setTimeout(() => setPhase('load'), enterMs);
    const t2 = window.setTimeout(() => setPhase('exit'), enterMs + loadMs);
    const t3 = window.setTimeout(finish, enterMs + loadMs + exitMs);
    // Absolute failsafe if timers/HMR get interrupted
    const failsafe = window.setTimeout(finish, 4200);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(failsafe);
    };
  }, [reduceMotion]);

  return (
    <div
      className={`ballion-splash is-${phase}${reduceMotion ? ' is-instant' : ''}`}
      aria-label="$1B RUN"
      role="status"
    >
      <div className="splash-world" aria-hidden>
        <div className="splash-world__grain" />
        <div className="splash-world__bloom splash-world__bloom--wide" />
        <div className="splash-world__bloom splash-world__bloom--core" />
      </div>

      <div className="ballion-splash__logo-wrap">
        <div className="ballion-splash__mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="ballion-splash__logo"
            src={BALLION_SPLASH_LOGO_SRC}
            alt="$1B RUN"
            width={1024}
            height={1024}
            decoding="sync"
            fetchPriority="high"
            draggable={false}
            onContextMenu={(event) => event.preventDefault()}
          />
        </div>

        <div className="ballion-splash__load" aria-hidden>
          <div className="ballion-splash__bar">
            <span className="ballion-splash__bar-fill" />
          </div>
          <p className="ballion-splash__load-label">{t('splash.loading')}</p>
        </div>
      </div>
    </div>
  );
}
