'use client';

import { useEffect, useRef, useState } from 'react';
import { BALLION_SPLASH_LOGO_SRC } from './TradeUpLogo';

/**
 * Timing & easing knobs for the cinematic launch intro.
 * Durations also mirrored as CSS custom properties on `.oneb-intro`
 * in `app/oneb-theme.css` — keep both in sync when tuning.
 */
export const INTRO_TIMING = {
  /** Stage 1 — studio credit fade in */
  studioInMs: 650,
  /** Stage 1 — hold at full opacity */
  studioHoldMs: 850,
  /** Stage 1 — fade out to black */
  studioOutMs: 500,
  /** Brief black beat before logo */
  blackBeatMs: 150,
  /** Stage 2 — logo reveal + scale */
  logoInMs: 900,
  /** Stage 2 — hold at full visibility (minimum; extends if app not ready) */
  logoHoldMs: 500,
  /** Fade intro overlay away to reveal home */
  revealHomeMs: 500,
  /** Absolute failsafe — always finish by this time */
  failsafeMs: 7000,
  /** Reduced-motion total duration (fade-only) */
  reducedTotalMs: 900,
} as const;

export const INTRO_EASING = {
  /** CSS timing-function for cinematic ease-out reveals */
  reveal: 'cubic-bezier(0.22, 1, 0.36, 1)',
  /** CSS timing-function for soft fade-outs */
  soften: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

type IntroPhase =
  | 'studio-in'
  | 'studio-hold'
  | 'studio-out'
  | 'black'
  | 'logo-in'
  | 'logo-hold'
  | 'reveal'
  | 'done';

interface BallionSplashProps {
  onDone: () => void;
  reduceMotion?: boolean;
  /** True when the app shell has finished its first-ready work. */
  appReady?: boolean;
}

/** Module guard — survives React Strict Mode remounts within one page load. */
let introFinishedThisLoad = false;

/**
 * Premium cinematic intro — KovA Studios credit → 1B Run logo → home.
 * Overlay only; home is rendered underneath by TradeUpApp.
 */
export function BallionSplash({
  onDone,
  reduceMotion = false,
  appReady = true,
}: BallionSplashProps) {
  const [phase, setPhase] = useState<IntroPhase>(
    reduceMotion ? 'logo-in' : 'studio-in',
  );
  const onDoneRef = useRef(onDone);
  const finishedRef = useRef(introFinishedThisLoad);
  const appReadyRef = useRef(appReady);
  const revealArmedRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    appReadyRef.current = appReady;
  }, [appReady]);

  useEffect(() => {
    const img = new window.Image();
    img.src = BALLION_SPLASH_LOGO_SRC;
  }, []);

  useEffect(() => {
    const clearTimers = () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };

    const schedule = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timersRef.current.push(id);
      return id;
    };

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      introFinishedThisLoad = true;
      clearTimers();
      setPhase('done');
      onDoneRef.current();
    };

    if (finishedRef.current) {
      onDoneRef.current();
      return clearTimers;
    }

    schedule(finish, INTRO_TIMING.failsafeMs);

    if (reduceMotion) {
      setPhase('logo-in');
      schedule(() => setPhase('logo-hold'), 280);
      schedule(() => {
        setPhase('reveal');
        schedule(finish, 420);
      }, Math.max(0, INTRO_TIMING.reducedTotalMs - 420));
      return clearTimers;
    }

    const t = INTRO_TIMING;
    const marks: Array<{ at: number; phase: IntroPhase }> = [
      { at: t.studioInMs, phase: 'studio-hold' },
      { at: t.studioInMs + t.studioHoldMs, phase: 'studio-out' },
      {
        at: t.studioInMs + t.studioHoldMs + t.studioOutMs,
        phase: 'black',
      },
      {
        at: t.studioInMs + t.studioHoldMs + t.studioOutMs + t.blackBeatMs,
        phase: 'logo-in',
      },
      {
        at:
          t.studioInMs +
          t.studioHoldMs +
          t.studioOutMs +
          t.blackBeatMs +
          t.logoInMs,
        phase: 'logo-hold',
      },
    ];

    for (const mark of marks) {
      schedule(() => setPhase(mark.phase), mark.at);
    }

    const armRevealAt =
      t.studioInMs +
      t.studioHoldMs +
      t.studioOutMs +
      t.blackBeatMs +
      t.logoInMs +
      t.logoHoldMs;

    schedule(() => {
      revealArmedRef.current = true;
      const tryReveal = () => {
        if (finishedRef.current) return;
        if (!appReadyRef.current) {
          schedule(tryReveal, 100);
          return;
        }
        setPhase('reveal');
        schedule(finish, t.revealHomeMs);
      };
      tryReveal();
    }, armRevealAt);

    return clearTimers;
  }, [reduceMotion]);

  // If hold already armed and app becomes ready while polling, the schedule handles it.
  useEffect(() => {
    if (!appReady || !revealArmedRef.current || finishedRef.current) return;
    if (phase !== 'logo-hold') return;
    // Polling loop in the main effect will pick this up on next tick.
  }, [appReady, phase]);

  if (phase === 'done') return null;

  const showStudio =
    phase === 'studio-in' || phase === 'studio-hold' || phase === 'studio-out';
  const showLogo =
    phase === 'logo-in' || phase === 'logo-hold' || phase === 'reveal';

  return (
    <div
      className={[
        'oneb-intro',
        `oneb-intro--${phase}`,
        reduceMotion ? 'oneb-intro--reduced' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="presentation"
      aria-hidden="true"
    >
      <div className="oneb-intro__veil" />

      {showStudio ? (
        <div className="oneb-intro__studio">
          <p className="oneb-intro__studio-name">KovA STUDIOS</p>
          <p className="oneb-intro__studio-presents">PRESENTS</p>
        </div>
      ) : null}

      {showLogo ? (
        <div className="oneb-intro__logo-stage">
          <div className="oneb-intro__logo-glow" aria-hidden />
          <div className="oneb-intro__logo-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="oneb-intro__logo"
              src={BALLION_SPLASH_LOGO_SRC}
              alt=""
              width={1024}
              height={1024}
              decoding="sync"
              fetchPriority="high"
              draggable={false}
              onContextMenu={(event) => event.preventDefault()}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
