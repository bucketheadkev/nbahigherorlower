'use client';

import { useEffect, useRef, useState } from 'react';
import { BALLION_SPLASH_LOGO_SRC } from './TradeUpLogo';

/**
 * Single coordinated timeline (ms). CSS keyframe % = ms / INTRO_TOTAL_MS.
 * Tune here and keep `animation-duration` on `.oneb-intro--run` in sync.
 */
export const INTRO_TOTAL_MS = 3700;

export const INTRO_MARKS = {
  atmosphereEnd: 150,
  studioRevealEnd: 900,
  studioHoldEnd: 1350,
  studioDissolveEnd: 1850,
  logoRevealStart: 1650,
  logoRevealEnd: 2550,
  logoHoldEnd: 3100,
  homeRevealEnd: 3700,
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

async function preloadIntroAssets(): Promise<void> {
  const tasks: Promise<void>[] = [];

  tasks.push(
    new Promise<void>((resolve) => {
      const img = new window.Image();
      img.decoding = 'sync';
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = BALLION_SPLASH_LOGO_SRC;
      if (img.complete) resolve();
    }),
  );

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    tasks.push(document.fonts.ready.then(() => undefined).catch(() => undefined));
  }

  await Promise.all(tasks);
}

/**
 * Cinematic launch intro — one timeline, center-locked studio credit,
 * continuous transformation into the 1B Run mark, then home crossfade.
 */
export function BallionSplash({
  onDone,
  reduceMotion = false,
  appReady = true,
}: BallionSplashProps) {
  const [boot, setBoot] = useState(true);
  const [run, setRun] = useState(false);
  const [done, setDone] = useState(introFinishedThisLoad);
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
      setDone(true);
      onDoneRef.current();
    };

    if (finishedRef.current) {
      onDoneRef.current();
      return clearTimers;
    }

    let cancelled = false;

    const start = async () => {
      await preloadIntroAssets();
      if (cancelled || finishedRef.current) return;

      setBoot(false);

      if (reduceMotion) {
        setRun(true);
        schedule(() => {
          const waitReady = () => {
            if (finishedRef.current) return;
            if (!appReadyRef.current) {
              schedule(waitReady, 80);
              return;
            }
            finish();
          };
          waitReady();
        }, 720);
        return;
      }

      // Double-rAF so initial hidden styles paint before the timeline starts.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (cancelled || finishedRef.current) return;
          setRun(true);

          schedule(() => {
            const waitReady = () => {
              if (finishedRef.current) return;
              if (!appReadyRef.current) {
                schedule(waitReady, 80);
                return;
              }
              finish();
            };
            waitReady();
          }, INTRO_TOTAL_MS);

          schedule(finish, INTRO_TOTAL_MS + 4000);
        });
      });
    };

    void start();

    return () => {
      cancelled = true;
      clearTimers();
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

      {/* Single stage: studio + logo share one grid cell — no translate centering */}
      <div className="oneb-intro__stage">
        <div className="oneb-intro__studio">
          <p className="oneb-intro__studio-name">KovA STUDIOS</p>
          <p className="oneb-intro__studio-presents">PRESENTS</p>
          <span className="oneb-intro__studio-sheen" aria-hidden />
        </div>

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
      </div>
    </div>
  );
}
