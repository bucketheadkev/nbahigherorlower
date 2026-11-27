'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BALLION_SPLASH_LOGO_SRC } from './TradeUpLogo';

/**
 * Single coordinated timeline (ms). CSS keyframe % = ms / INTRO_TOTAL_MS.
 * Keep `--oneb-intro-ms` in splash-intro.css in sync.
 */
export const INTRO_TOTAL_MS = 3600;

export const INTRO_MARKS = {
  atmosphereEnd: 100,
  logoRevealStart: 60,
  logoRevealEnd: 720,
  loadBarStart: 900,
  loadBarFull: 2850,
  logoHoldEnd: 3000,
  homeRevealEnd: 3600,
} as const;

/** Longest the intro waits near the end of the bar for the app to be ready. */
export const INTRO_HOLD_MAX_MS = 4000;

const BAR_START = 0.26;
const BAR_FULL = 0.82;
const HOLD_AT = 0.72;

function barProgress(elapsed: number, duration: number): number {
  const p = Math.min(1, Math.max(0, (elapsed / duration - BAR_START) / (BAR_FULL - BAR_START)));
  return 1 - (1 - p) ** 2.4;
}

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

let introFinishedThisLoad = false;

export function hasIntroFinishedThisLoad(): boolean {
  return introFinishedThisLoad;
}

export function resetIntroFinishedThisLoad(): void {
  introFinishedThisLoad = false;
  clearModuleFailsafe();
}

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

export function clearBootVeil(): void {
  try {
    document.documentElement.classList.remove('oneb-booting');
  } catch {
    /* ignore */
  }
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
 * Launch intro — soft dramatic light, logo, machined load bar → home.
 */
export function BallionSplash({
  onDone,
  reduceMotion = false,
  appReady = true,
}: BallionSplashProps) {
  const [run, setRun] = useState(true);
  const [done, setDone] = useState(introFinishedThisLoad);
  const [exiting, setExiting] = useState(false);
  const onDoneRef = useRef(onDone);
  const finishedRef = useRef(introFinishedThisLoad);
  const appReadyRef = useRef(appReady);
  const timersRef = useRef<number[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const pctRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    appReadyRef.current = appReady;
  }, [appReady]);

  useLayoutEffect(() => {
    if (introFinishedThisLoad || finishedRef.current) {
      finishedRef.current = true;
      introFinishedThisLoad = true;
      clearBootVeil();
      setExiting(true);
      setDone(true);
      onDoneRef.current();
      return;
    }
    clearBootVeil();
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
      clearBootVeil();
      setExiting(true);
      setDone(true);
      onDoneRef.current();
    };

    if (finishedRef.current || introFinishedThisLoad) {
      finishedRef.current = true;
      introFinishedThisLoad = true;
      clearModuleFailsafe();
      clearBootVeil();
      setExiting(true);
      setDone(true);
      onDoneRef.current();
      return clearTimers;
    }

    const duration = reduceMotion ? 720 : INTRO_TOTAL_MS;
    armModuleFailsafe(finish, duration + INTRO_HOLD_MAX_MS + 1000);

    setRun(true);
    let assetsReady = false;
    void preloadIntroAssets().then(() => {
      assetsReady = true;
    });

    let elapsed = 0;
    let held = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      const ready = appReadyRef.current && assetsReady;
      const holding = !ready && elapsed >= duration * HOLD_AT && held < INTRO_HOLD_MAX_MS;
      rootRef.current?.classList.toggle('is-holding', holding);
      if (holding) held += dt;
      else elapsed += dt;
      const progress = barProgress(elapsed, duration);
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${progress})`;
      if (pctRef.current) pctRef.current.textContent = `${Math.round(progress * 100)}`;
      if (elapsed >= duration) {
        finish();
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    schedule(finish, duration + INTRO_HOLD_MAX_MS + 800);

    return () => {
      window.cancelAnimationFrame(raf);
      clearTimers();
    };
  }, [reduceMotion]);

  if (done) return null;

  return (
    <div
      ref={rootRef}
      className={[
        'oneb-intro',
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
        <div className="oneb-intro__bloom oneb-intro__bloom--cool" />
        <div className="oneb-intro__bloom oneb-intro__bloom--warm" />
        <div className="oneb-intro__bloom oneb-intro__bloom--spot" />
        <div className="oneb-intro__shaft oneb-intro__shaft--a" />
        <div className="oneb-intro__shaft oneb-intro__shaft--b" />
        <div className="oneb-intro__vignette" />
        <div className="oneb-intro__atm-grain" />
      </div>

      <div className="oneb-intro__stage">
        <div className="oneb-intro__brand">
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
              <span className="oneb-intro__logo-illum" aria-hidden />
              <span className="oneb-intro__logo-sweep" aria-hidden />
            </div>
          </div>

          <p className="oneb-intro__wordmark">1B RUN</p>

          <div className="oneb-intro__load" role="status" aria-label="Loading">
            <div className="oneb-intro__bar">
              <span className="oneb-intro__bar-track" aria-hidden />
              <span ref={fillRef} className="oneb-intro__bar-fill">
                <span className="oneb-intro__bar-sheen" aria-hidden />
              </span>
            </div>
            <div className="oneb-intro__load-meta">
              <p className="oneb-intro__load-label">Loading</p>
              <p className="oneb-intro__load-pct">
                <span ref={pctRef}>0</span>%
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
