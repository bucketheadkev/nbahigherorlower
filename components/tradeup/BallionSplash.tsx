'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BALLION_SPLASH_LOGO_SRC } from './TradeUpLogo';

/**
 * Timing & easing knobs for the cinematic launch intro.
 * Durations also mirrored as CSS custom properties on `.oneb-intro`
 * in `app/oneb-theme.css` — keep both in sync when tuning.
 */
export const INTRO_TIMING = {
  /** Studio credit — soft drift / fade in */
  studioInMs: 720,
  /** Brief hold at full clarity */
  studioHoldMs: 560,
  /** Studio fade-out (overlaps logo reveal) */
  studioOutMs: 680,
  /** Logo animation starts this many ms after handoff begins */
  logoOverlapMs: 260,
  /** Logo scale-up + settle + sweep */
  logoInMs: 980,
  /** Hold before home crossfade (extends if app not ready) */
  logoHoldMs: 420,
  /** Crossfade into home / morph toward header logo */
  revealHomeMs: 580,
  failsafeMs: 7000,
  reducedTotalMs: 900,
} as const;

export const INTRO_EASING = {
  /** Soft cinematic ease-out (no bounce) */
  reveal: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** Controlled settle — tiny overshoot, not springy */
  settle: 'cubic-bezier(0.22, 1.12, 0.28, 1)',
  soften: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

type IntroPhase =
  | 'studio-in'
  | 'studio-hold'
  | 'handoff'
  | 'logo-hold'
  | 'reveal'
  | 'done';

interface BallionSplashProps {
  onDone: () => void;
  reduceMotion?: boolean;
  appReady?: boolean;
}

/** Module guard — survives React Strict Mode remounts within one page load. */
let introFinishedThisLoad = false;

function applyLogoMorph(
  root: HTMLDivElement | null,
  stage: HTMLDivElement | null,
) {
  if (!root || !stage) return;

  const target = document.querySelector('.run-home__logo') as HTMLElement | null;
  if (!target) {
    root.style.removeProperty('--intro-dx');
    root.style.removeProperty('--intro-dy');
    root.style.removeProperty('--intro-s');
    root.classList.remove('oneb-intro--morph');
    return;
  }

  const sr = stage.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  if (sr.width < 8 || tr.width < 8) {
    root.classList.remove('oneb-intro--morph');
    return;
  }

  const dx = tr.left + tr.width / 2 - (sr.left + sr.width / 2);
  const dy = tr.top + tr.height / 2 - (sr.top + sr.height / 2);
  const scale = tr.width / sr.width;

  root.style.setProperty('--intro-dx', `${dx}px`);
  root.style.setProperty('--intro-dy', `${dy}px`);
  root.style.setProperty('--intro-s', String(Math.max(0.08, Math.min(scale, 1))));
  root.classList.add('oneb-intro--morph');
}

/**
 * Premium cinematic intro — KovA Studios credit → 1B Run logo → home.
 * Overlay only; home is rendered underneath by TradeUpApp.
 * Animations use transform + opacity only (60fps-friendly).
 */
export function BallionSplash({
  onDone,
  reduceMotion = false,
  appReady = true,
}: BallionSplashProps) {
  const [phase, setPhase] = useState<IntroPhase>(
    reduceMotion ? 'handoff' : 'studio-in',
  );
  const onDoneRef = useRef(onDone);
  const finishedRef = useRef(introFinishedThisLoad);
  const appReadyRef = useRef(appReady);
  const timersRef = useRef<number[]>([]);
  const logoStageRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

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
      setPhase('handoff');
      schedule(() => setPhase('logo-hold'), 280);
      schedule(() => {
        applyLogoMorph(rootRef.current, logoStageRef.current);
        setPhase('reveal');
        schedule(finish, 420);
      }, Math.max(0, INTRO_TIMING.reducedTotalMs - 420));
      return clearTimers;
    }

    const t = INTRO_TIMING;
    const handoffAt = t.studioInMs + t.studioHoldMs;
    const logoHoldAt = handoffAt + t.logoOverlapMs + t.logoInMs;
    const armRevealAt = logoHoldAt + t.logoHoldMs;

    schedule(() => setPhase('studio-hold'), t.studioInMs);
    schedule(() => setPhase('handoff'), handoffAt);
    schedule(() => setPhase('logo-hold'), logoHoldAt);

    schedule(() => {
      const tryReveal = () => {
        if (finishedRef.current) return;
        if (!appReadyRef.current) {
          schedule(tryReveal, 100);
          return;
        }
        applyLogoMorph(rootRef.current, logoStageRef.current);
        setPhase('reveal');
        schedule(finish, t.revealHomeMs);
      };
      tryReveal();
    }, armRevealAt);

    return clearTimers;
  }, [reduceMotion]);

  if (phase === 'done') return null;

  const showStudio =
    phase === 'studio-in' || phase === 'studio-hold' || phase === 'handoff';
  const showLogo =
    phase === 'handoff' || phase === 'logo-hold' || phase === 'reveal';

  const introStyle = {
    '--oneb-intro-studio-in': `${INTRO_TIMING.studioInMs}ms`,
    '--oneb-intro-studio-out': `${INTRO_TIMING.studioOutMs}ms`,
    '--oneb-intro-logo-delay': `${INTRO_TIMING.logoOverlapMs}ms`,
    '--oneb-intro-logo-in': `${INTRO_TIMING.logoInMs}ms`,
    '--oneb-intro-reveal': `${INTRO_TIMING.revealHomeMs}ms`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={[
        'oneb-intro',
        `oneb-intro--${phase}`,
        reduceMotion ? 'oneb-intro--reduced' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={introStyle}
      role="presentation"
      aria-hidden="true"
    >
      <div className="oneb-intro__veil" />

      {showStudio ? (
        <div className="oneb-intro__studio">
          <div className="oneb-intro__studio-soft" aria-hidden>
            <p className="oneb-intro__studio-name">KovA STUDIOS</p>
            <p className="oneb-intro__studio-presents">PRESENTS</p>
          </div>
          <div className="oneb-intro__studio-sharp">
            <p className="oneb-intro__studio-name">KovA STUDIOS</p>
            <p className="oneb-intro__studio-presents">PRESENTS</p>
          </div>
        </div>
      ) : null}

      {showLogo ? (
        <div ref={logoStageRef} className="oneb-intro__logo-stage">
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
            <span className="oneb-intro__logo-sweep" aria-hidden />
          </div>
        </div>
      ) : null}
    </div>
  );
}
