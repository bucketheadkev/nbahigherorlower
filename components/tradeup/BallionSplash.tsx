'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BALLION_SPLASH_LOGO_SRC } from './TradeUpLogo';

/**
 * Single coordinated timeline (ms). CSS keyframe % = ms / INTRO_TOTAL_MS.
 * Tune here and keep `--oneb-intro-ms` / keyframes in oneb-theme.css in sync.
 */
export const INTRO_TOTAL_MS = 5000;

export const INTRO_MARKS = {
  atmosphereEnd: 150,
  studioRevealEnd: 900,
  studioHoldEnd: 1350,
  studioDissolveEnd: 1850,
  logoRevealStart: 1650,
  logoRevealEnd: 2550,
  /** Loading bar appears as soon as KovA is gone. */
  loadBarStart: 1850,
  /** Bar reaches full just before home crossfade completes. */
  loadBarFull: 4700,
  logoHoldEnd: 4300,
  homeRevealEnd: 5000,
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
 * Cinematic launch intro — one timeline, center-locked studio credit,
 * continuous transformation into the 1B Run mark + load bar, then home crossfade.
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

  // Guarantee --run before paint even if HMR remounts mid-boot.
  useLayoutEffect(() => {
    if (introFinishedThisLoad) return;
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

    // Nuclear: never leave z-index 200 longer than ~3.5s even if timers are cleared.
    armModuleFailsafe(finish, reduceMotion ? 1600 : 3500);

    setBoot(false);
    setRun(true);
    void preloadIntroAssets();

    const duration = reduceMotion ? 720 : INTRO_TOTAL_MS;
    schedule(() => {
      if (finishedRef.current) return;
      // Don't block exit on appReady — stuck ready flag caused blank navy.
      finish();
    }, duration);

    schedule(finish, Math.min(duration + 800, 3200));

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

      {/* Single stage: studio + brand share one grid cell — no translate centering */}
      <div className="oneb-intro__stage">
        <div className="oneb-intro__studio">
          <p className="oneb-intro__studio-name">KovA STUDIOS</p>
          <p className="oneb-intro__studio-presents">PRESENTS</p>
          <span className="oneb-intro__studio-sheen" aria-hidden />
        </div>

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
              <span className="oneb-intro__bar-fill" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
