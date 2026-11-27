'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { BALLION_SPLASH_LOGO_SRC } from './TradeUpLogo';

gsap.registerPlugin(useGSAP);

/** Decoded during the intro so Home's art is ready when the splash lifts. */
const HOME_ART = ['/images/home-v10/rh10-court@2x.webp', '/images/home-v9/rh9-ball.webp'];
/** Exit transition before handing off to Home. */
const EXIT_MS = 460;

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

  const loadImage = (src: string) =>
    new Promise<void>((resolve) => {
      const img = new window.Image();
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      img.onload = done;
      img.onerror = done;
      img.src = src;
      if (img.complete) done();
    });
  const imageTask = Promise.all([BALLION_SPLASH_LOGO_SRC, ...HOME_ART].map(loadImage)).then(() => undefined);

  const fontTask =
    typeof document !== 'undefined' && document.fonts?.ready
      ? document.fonts.ready.then(() => undefined).catch(() => undefined)
      : Promise.resolve();

  await withTimeout(Promise.all([withTimeout(imageTask, 800), withTimeout(fontTask, 800)]), 1000);
}

/**
 * Launch intro — light-streak ignition opens the cobalt field, logo reveal, machined load rail → home.
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
  const sparkRef = useRef<HTMLSpanElement | null>(null);
  const railRef = useRef<HTMLSpanElement | null>(null);
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;

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

    const handOff = () => {
      setExiting(true);
      setDone(true);
      onDoneRef.current();
    };

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      introFinishedThisLoad = true;
      clearTimers();
      clearModuleFailsafe();
      clearBootVeil();
      const root = rootRef.current;
      if (reduceRef.current || !root) {
        handOff();
        return;
      }
      /* Cinematic exit, then hand off. Timer guarantees hand-off even if the tween is killed. */
      const q = gsap.utils.selector(root);
      gsap
        .timeline({ defaults: { ease: 'power2.in' } })
        .to(q('.cs__center'), { scale: 1.08, autoAlpha: 0, duration: EXIT_MS / 1000 }, 0)
        .to(q('.cs__flash'), { autoAlpha: 1, duration: 0.18, ease: 'power1.out' }, 0.12)
        .to(q('.cs__flash'), { autoAlpha: 0, duration: 0.2, ease: 'power1.in' }, 0.3)
        .to(root, { autoAlpha: 0, duration: 0.22, ease: 'power1.in' }, EXIT_MS / 1000 - 0.2);
      window.setTimeout(handOff, EXIT_MS);
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
    let flared = false;
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
      if (sparkRef.current && railRef.current) {
        sparkRef.current.style.transform = `translate3d(${(railRef.current.clientWidth * progress).toFixed(1)}px, 0, 0)`;
        sparkRef.current.style.opacity = progress > 0.002 && progress < 0.999 ? '1' : '0';
      }
      if (pctRef.current) pctRef.current.textContent = `${Math.round(progress * 100)}`;
      if (!flared && progress >= 1 && !reduceRef.current && railRef.current) {
        flared = true;
        gsap
          .timeline()
          .fromTo(
            railRef.current.querySelector('.cs__flare'),
            { autoAlpha: 0, scaleX: 0.4 },
            { autoAlpha: 1, scaleX: 1, duration: 0.22, ease: 'power2.out' },
          )
          .to(railRef.current.querySelector('.cs__flare'), { autoAlpha: 0, duration: 0.5, ease: 'power1.in' });
      }
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

  useGSAP(
    () => {
      if (done || reduceMotion) return;
      const q = gsap.utils.selector(rootRef);
      gsap.set(q('.cs__field'), { scaleY: 0.004, autoAlpha: 0 });
      gsap.set(q('.cs__streak'), { scaleX: 0, autoAlpha: 1 });
      gsap.set(q('.cs__beam'), { autoAlpha: 0 });
      gsap.set(q('.cs__mark'), { scale: 0.55, rotationX: 38, y: 26, autoAlpha: 0, transformPerspective: 700 });
      gsap.set(q('.cs__char'), { yPercent: 150 });
      gsap.set(q('.cs__tag'), { autoAlpha: 0, y: 8 });
      gsap.set(q('.cs__load'), { autoAlpha: 0, y: 10 });
      gsap.set(q('.cs__glare'), { xPercent: -160 });

      gsap
        .timeline({ defaults: { ease: 'expo.out' } })
        .to(q('.cs__streak'), { scaleX: 1, duration: 0.5 }, 0.08)
        .to(q('.cs__field'), { autoAlpha: 1, duration: 0.12, ease: 'none' }, 0.36)
        .to(q('.cs__field'), { scaleY: 1, duration: 0.75, ease: 'expo.inOut' }, 0.36)
        .to(q('.cs__streak'), { autoAlpha: 0, scaleY: 6, duration: 0.5, ease: 'power2.out' }, 0.62)
        .to(q('.cs__beam'), { autoAlpha: 1, duration: 1.2, ease: 'power1.inOut', stagger: 0.15 }, 0.7)
        .to(q('.cs__mark'), { scale: 1, rotationX: 0, y: 0, autoAlpha: 1, duration: 1.05, ease: 'back.out(1.5)' }, 0.72)
        .fromTo(q('.cs__glare'), { xPercent: -160 }, { xPercent: 160, duration: 1.1, ease: 'power2.inOut' }, 1.15)
        .to(q('.cs__char'), { yPercent: 0, duration: 0.8, stagger: 0.05 }, 1.0)
        .to(q('.cs__tag'), { autoAlpha: 1, y: 0, duration: 0.7 }, 1.32)
        .to(q('.cs__load'), { autoAlpha: 1, y: 0, duration: 0.6 }, 0.86);

      gsap.to(q('.cs__beam--a'), { rotation: 9, duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      gsap.to(q('.cs__beam--b'), { rotation: -8, duration: 6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      gsap.to(q('.cs__mark'), { y: -5, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.8 });
    },
    { scope: rootRef, dependencies: [done, reduceMotion] },
  );

  if (done) return null;

  return (
    <div
      ref={rootRef}
      className={[
        'oneb-intro',
        'cs',
        run ? 'oneb-intro--run' : '',
        reduceMotion ? 'oneb-intro--reduced cs--reduced' : '',
        exiting ? 'is-exiting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="presentation"
      aria-hidden="true"
    >
      <div className="cs__field">
        <div className="cs__beam cs__beam--a" />
        <div className="cs__beam cs__beam--b" />
        <div className="cs__floor" />
      </div>
      <div className="cs__streak" />

      <div className="cs__center">
        <div className="cs__mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="cs__logo"
            src={BALLION_SPLASH_LOGO_SRC}
            alt=""
            width={1024}
            height={1024}
            decoding="sync"
            fetchPriority="high"
            draggable={false}
            onContextMenu={(event) => event.preventDefault()}
          />
          <span className="cs__glare" aria-hidden />
          <span className="cs__edge" aria-hidden />
        </div>

        <p className="cs__word" aria-label="1B RUN">
          {['1', 'B', ' ', 'R', 'U', 'N'].map((ch, i) =>
            ch === ' ' ? (
              <span key={i} className="cs__gap" />
            ) : (
              <span key={i} className="cs__char-mask">
                <span className="cs__char">{ch}</span>
              </span>
            ),
          )}
        </p>
        <p className="cs__tag">
          CHASE <span className="cs__tag-amt">$1 BILLION</span>
        </p>

        <div className="cs__load" role="status" aria-label="Loading">
          <span ref={railRef} className="cs__rail">
            <span className="cs__ticks" aria-hidden />
            <span ref={fillRef} className="cs__fill">
              <span className="cs__fill-sheen" aria-hidden />
            </span>
            <span ref={sparkRef} className="cs__spark" aria-hidden />
            <span className="cs__flare" aria-hidden />
          </span>
          <span className="cs__meta">
            <span className="cs__meta-label">Loading</span>
            <span className="cs__meta-pct">
              <span ref={pctRef}>0</span>%
            </span>
          </span>
        </div>
      </div>

      <div className="cs__flash" />
    </div>
  );
}
