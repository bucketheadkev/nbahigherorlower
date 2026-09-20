'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BALLION_SPLASH_LOGO_SRC } from './TradeUpLogo';

/**
 * Single coordinated timeline (ms). CSS keyframe % = ms / INTRO_TOTAL_MS.
 * Tune here and keep `--oneb-intro-ms` / keyframes in oneb-theme.css in sync.
 */
export const INTRO_TOTAL_MS = 3400;

export const INTRO_MARKS = {
  atmosphereEnd: 100,
  logoRevealStart: 0,
  logoRevealEnd: 620,
  loadBarStart: 180,
  loadBarFull: 3000,
  logoHoldEnd: 2800,
  homeRevealEnd: 3400,
} as const;

export const INTRO_EASING = {
  materialize: 'cubic-bezier(0.22, 1, 0.36, 1)',
  settle: 'cubic-bezier(0.16, 1, 0.3, 1)',
  soften: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

interface BallionSplashProps {
  onDone: () => void;
  reduceMotion?: boolean;
  appReady?: boolean;
}

/** Survives Strict Mode remounts within one page load. */
let introFinishedThisLoad = false;

/** Parent shell reads this so HMR can't re-show a finished intro. */
export function hasIntroFinishedThisLoad(): boolean {
  return introFinishedThisLoad;
}

/** Hard refresh / ?replaySplash=1 — allow the intro to run again this load. */
export function resetIntroFinishedThisLoad(): void {
  introFinishedThisLoad = false;
  clearModuleFailsafe();
}

/**
 * Module-level hard stop — must NOT live in a ref cleared by effect cleanup,
 * or Strict Mode / HMR can leave the z-index 200 navy veil forever.
 */
let moduleFailsafeId: number | null = null;
let moduleFailsafeBound: (() => void) | null = null;

function clearModuleFailsafe() {
  if (moduleFailsafeId != null) {
    window.clearTimeout(moduleFailsafeId);
    moduleFailsafeId = null;
  }
  moduleFailsafeBound = null;
}

function armModuleFailsafe(finish: () => void, ms: number) {
  moduleFailsafeBound = finish;
  if (moduleFailsafeId != null) return;
  moduleFailsafeId = window.setTimeout(() => {
    moduleFailsafeId = null;
    moduleFailsafeBound?.();
  }, ms);
}

async function preloadIntroAssets(): Promise<void> {
  const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
    Promise.race([
      promise,
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      }),
    ]);

  const imageTask = new Promise<void>((resolve) => {
    const img = new window.Image();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    img.onload = done;
    img.onerror = done;
    img.src = BALLION_SPLASH_LOGO_SRC;
    if (img.complete) done();
  });

  const fontTask =
    typeof document !== 'undefined' && document.fonts?.ready
      ? document.fonts.ready.then(() => undefined).catch(() => undefined)
      : Promise.resolve();

  await withTimeout(Promise.all([withTimeout(imageTask, 800), withTimeout(fontTask, 800)]), 1000);
}

/**
 * Launch intro — 1B Run logo + load bar → home.
 */
export function BallionSplash({
  onDone,
  reduceMotion = false,
  appReady = true,
}: BallionSplashProps) {
  // Start the timeline immediately — never sit on blank navy boot.
  const [boot, setBoot] = useState(false);
  const [run, setRun] = useState(true);
  const [done, setDone] = useState(introFinishedThisLoad);
  const [exiting, setExiting] = useState(false);
  const onDoneRef = useRef(onDone);
  const finishedRef = useRef(introFinishedThisLoad);
  const appReadyRef = useRef(appReady);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    appReadyRef.current = appReady;
  }, [appReady]);

  // Sync parent before paint when HMR remounts after a finished intro —
  // otherwise showSplash stays true with a null splash and dead pointer-events.
  useLayoutEffect(() => {
    if (introFinishedThisLoad || finishedRef.current) {
      finishedRef.current = true;
      introFinishedThisLoad = true;
      setExiting(true);
      setDone(true);
      onDoneRef.current();
      return;
    }
    setBoot(false);
    setRun(true);
  }, []);

  useEffect(() => {
    const clearTimers = () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };

    const schedule = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timersRef.current.push(id);
    };

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      introFinishedThisLoad = true;
      clearTimers();
      clearModuleFailsafe();
      setExiting(true);
      setDone(true);
      onDoneRef.current();
    };

    if (finishedRef.current || introFinishedThisLoad) {
      finishedRef.current = true;
      introFinishedThisLoad = true;
      clearModuleFailsafe();
      setExiting(true);
      setDone(true);
      onDoneRef.current();
      return clearTimers;
    }

    const duration = reduceMotion ? 720 : INTRO_TOTAL_MS;
    // Nuclear: survive Strict Mode timer clears — must outlast the full intro.
    armModuleFailsafe(finish, duration + 1000);

    setBoot(false);
    setRun(true);
    void preloadIntroAssets();

    schedule(() => {
      if (finishedRef.current) return;
      // Don't block exit on appReady — stuck ready flag caused blank navy.
      finish();
    }, duration);

    // Secondary only — never cut the cinematic short of INTRO_TOTAL_MS.
    schedule(finish, duration + 800);

    return () => {
      clearTimers();
      // Intentionally do NOT clear moduleFailsafe — Strict Mode must not kill it.
    };
  }, [reduceMotion]);

  if (done) return null;

  return (
    <div
      className={[
        'oneb-intro',
        boot ? 'oneb-intro--boot' : '',
        run ? 'oneb-intro--run' : '',
        reduceMotion ? 'oneb-intro--reduced' : '',
        exiting ? 'is-exiting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="presentation"
      aria-hidden="true"
    >
      <div className="oneb-intro__veil" />

      <div className="oneb-intro__atmosphere" aria-hidden>
        <div className="oneb-intro__atm-glow" />
        <div className="oneb-intro__atm-wash" />
        <div className="oneb-intro__atm-grain" />
        <div className="oneb-intro__core-glow" />
      </div>

      <div className="oneb-intro__stage">
        <div className="oneb-intro__brand">
          <div className="oneb-intro__logo-stage">
            <div className="oneb-intro__logo-pulse" aria-hidden />
            <div className="oneb-intro__logo-glow" aria-hidden />
            <div className="oneb-intro__logo-tilt">
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
                <span className="oneb-intro__logo-illum" aria-hidden />
                <span className="oneb-intro__logo-sweep" aria-hidden />
              </div>
            </div>
          </div>

          <div className="oneb-intro__load" role="status" aria-label="Loading">
            <div className="oneb-intro__bar">
              <span className="oneb-intro__bar-track" aria-hidden />
              <span className="oneb-intro__bar-fill">
                <span className="oneb-intro__bar-sheen" aria-hidden />
              </span>
            </div>
            <p className="oneb-intro__load-label">Loading</p>
          </div>
        </div>
      </div>
    </div>
  );
}
