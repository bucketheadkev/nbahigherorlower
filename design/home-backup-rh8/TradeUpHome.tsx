'use client';

import {
  memo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useAchievementCloudSync } from '@/hooks/useAchievementCloudSync';
import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';
import {
  hasSeenAccountPrompt,
  markAccountPromptSeen,
  resetAccountPromptSeen,
} from '@/lib/account/accountPromptStorage';
import { preloadClassicArena } from '@/lib/tradeup/classicArenaAssets';
import { AccountAuthSheet, type AccountSheetView } from './AccountAuthSheet';
import { AccountProgressPrompt } from './AccountProgressPrompt';
import { HomeModesSheet } from './HomeModesSheet';
import { HomeBankProgress } from './home/HomeBankProgress';
import { WallOfFameScreen } from './WallOfFameScreen';
import { useBankBalance } from '@/hooks/useBankBalance';
import { COINS_WELCOME, ensureWelcomeCoins } from '@/lib/tradeup/xp';

gsap.registerPlugin(useGSAP);

interface TradeUpHomeProps {
  onPlay: () => void;
  onHeadToHead: () => void;
  onOpenShop?: () => void;
  onOpenBoard?: () => void;
  allowAccountPrompt?: boolean;
  /** Home pane is the visible hub tab — idle motion pauses otherwise. */
  active?: boolean;
  /** Splash is gone — run the entrance timeline. */
  revealed?: boolean;
}

const WORDMARK = ['1', 'B', ' ', 'R', 'U', 'N'];

/** Rooftop spire tips in plate percent (x, y) — aviation beacons. */
const BEACONS: [number, number][] = [
  [31.7, 30.9],
  [19.6, 32.3],
  [40.8, 35.5],
  [71.2, 38.9],
  [88, 38.9],
];

/**
 * Premium home body — cobalt rooftop plate (sky · clouds · skyline cutout), live wordmark, bank + CTAs.
 * All Home motion is GSAP; framer-motion stays in sheets/chrome only.
 * Top chrome lives in HomeHubChromeHost (shared).
 * Memoized so hub Shop taps don't rebuild the home tree on website.
 */
export const TradeUpHome = memo(function TradeUpHome({
  onPlay,
  onHeadToHead,
  onOpenBoard,
  allowAccountPrompt = true,
  active = true,
  revealed = true,
}: TradeUpHomeProps) {
  const { resume, playTap } = useSound();
  const { t } = useLocale();
  const reduceMotion = useGameReducedMotion();
  const { state: accountState, setState: setAccountState } = useAccountAuth();
  useAchievementCloudSync(accountState);
  const [promptOpen, setPromptOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<AccountSheetView>('menu');
  const [modesOpen, setModesOpen] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  const [playShake, setPlayShake] = useState(false);
  const shakeTimerRef = useRef<number | null>(null);
  const bankBalance = useBankBalance(accountState.status) ?? 0;
  const isPermanent = accountState.status === 'permanent';
  const wallUsername = isPermanent ? accountState.profile.username : null;

  const rootRef = useRef<HTMLDivElement>(null);
  const idleRef = useRef<gsap.core.Timeline | null>(null);
  const introPlayed = useRef(false);
  const introDone = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;
  const introFrame = useRef(0);

  useEffect(() => {
    ensureWelcomeCoins(COINS_WELCOME);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      preloadClassicArena();
      new Image().src = '/images/home-v2/classic.jpg';
      new Image().src = '/images/home-v2/1v1.jpg';
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.oneb-tabbar');
    if (!bar) return;
    const root = document.documentElement;
    const apply = () =>
      root.style.setProperty(
        '--home-tabbar-h',
        `${Math.max(0, Math.round(window.innerHeight - bar.getBoundingClientRect().top))}px`,
      );
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    window.addEventListener('resize', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, []);

  const navLockRef = useRef(false);

  useEffect(() => {
    return () => {
      if (shakeTimerRef.current != null) window.clearTimeout(shakeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('resetAccountPrompt') === '1') {
        resetAccountPromptSeen();
        params.delete('resetAccountPrompt');
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', next);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!allowAccountPrompt) {
      setPromptOpen(false);
      return;
    }
    if (accountState.status === 'loading') return;
    if (accountState.status === 'permanent') {
      setPromptOpen(false);
      return;
    }
    if (accountState.status === 'needs_username') {
      setPromptOpen(false);
      setSheetView('claim');
      setSheetOpen(true);
      return;
    }
    if (hasSeenAccountPrompt()) {
      setPromptOpen(false);
      return;
    }
    setPromptOpen(true);
  }, [accountState.status, allowAccountPrompt]);

  /* Entrance + ambient loops. Idle stays paused unless Home is the visible tab. */
  const { contextSafe } = useGSAP(
    (_ctx, safe) => {
      const q = gsap.utils.selector(rootRef);
      const plate = q('.rh7-plate');
      const city = q('.rh7-plate__city');
      const clouds = q('.rh7-plate__clouds');
      const glow = q('.rh7-plate__glow');
      const sheen = q('.rh7-plate__sheen');
      const beacons = q('.rh7-plate__beacon');
      const lift = q('.rh7-bg__lift');
      const impact = q('.rh7-impact');
      const word = q('.rh7-logo__word');
      const chars = q('.rh7-logo__char');
      const ribbon = q('.rh7-tagline__plate');
      const tagline = q('.rh7-tagline__text');
      const bank = q('.rh7-bank');
      const ctas = q('.rh7-cta');
      const all = [
        plate,
        city,
        clouds,
        glow,
        sheen,
        beacons,
        lift,
        impact,
        word,
        chars,
        ribbon,
        tagline,
        bank,
        ctas,
      ];

      if (reduceMotion) {
        idleRef.current?.kill();
        idleRef.current = null;
        gsap.set(all, { clearProps: 'all' });
        introPlayed.current = true;
        return;
      }

      if (introPlayed.current) return;

      gsap.set(lift, { autoAlpha: 0.6 });
      gsap.set(plate, { scale: 1.16 });
      gsap.set(city, { yPercent: 9 });
      gsap.set(clouds, { xPercent: 6, autoAlpha: 0 });
      gsap.set(glow, { autoAlpha: 0 });
      gsap.set(chars, { scale: 1.9, yPercent: -12, autoAlpha: 0 });
      gsap.set(ribbon, { scaleX: 0 });
      gsap.set(tagline, { y: 8, autoAlpha: 0 });
      gsap.set(bank, { y: 34, autoAlpha: 0 });
      gsap.set(ctas, { y: 42, autoAlpha: 0 });

      cancelAnimationFrame(introFrame.current);
      if (!revealed || !safe) return;

      /* App flips showSplash on in a layout effect after first render — wait a frame and re-check. */
      const start = safe(() => {
        if (!revealedRef.current || introPlayed.current) return;
        introPlayed.current = true;

        const idle = gsap.timeline({ paused: true });
        idle
          .to(
            plate,
            {
              scale: 1.035,
              duration: 18,
              ease: 'sine.inOut',
              yoyo: true,
              repeat: -1,
            },
            0,
          )
          .to(
            city,
            {
              yPercent: -0.9,
              duration: 18,
              ease: 'sine.inOut',
              yoyo: true,
              repeat: -1,
            },
            0,
          )
          .to(
            clouds,
            {
              xPercent: -24,
              duration: 70,
              ease: 'sine.inOut',
              yoyo: true,
              repeat: -1,
            },
            0,
          )
          .to(
            glow,
            {
              autoAlpha: 0.55,
              duration: 4.5,
              ease: 'sine.inOut',
              yoyo: true,
              repeat: -1,
            },
            0,
          )
          .fromTo(
            sheen,
            { xPercent: -110 },
            {
              xPercent: 260,
              duration: 3.2,
              ease: 'sine.inOut',
              repeat: -1,
              repeatDelay: 5.5,
            },
            1.5,
          )
          .fromTo(
            q('.rh7-cta__sheen'),
            { xPercent: 0 },
            {
              xPercent: 480,
              duration: 1.15,
              ease: 'power2.inOut',
              repeat: -1,
              repeatDelay: 4.4,
            },
            1.2,
          );
        beacons.forEach((b, i) => {
          idle.fromTo(
            b,
            { autoAlpha: 0.15 },
            {
              autoAlpha: 1,
              duration: 0.18,
              ease: 'power1.out',
              yoyo: true,
              repeat: -1,
              repeatDelay: 1.3 + i * 0.37,
            },
            i * 0.45,
          );
        });
        idleRef.current = idle;

        gsap
          .timeline({
            defaults: { ease: 'expo.out' },
            onComplete: () => {
              introDone.current = true;
              if (activeRef.current) idle.play();
            },
          })
          .to(lift, { autoAlpha: 0, duration: 1.15, ease: 'power2.inOut' }, 0)
          .to(plate, { scale: 1, duration: 2.3, ease: 'power3.out' }, 0)
          .to(city, { yPercent: 0, duration: 1.9 }, 0.08)
          .to(clouds, { xPercent: 0, autoAlpha: 1, duration: 2.4, ease: 'power2.out' }, 0.2)
          .to(glow, { autoAlpha: 1, duration: 1.2, ease: 'power1.inOut' }, 0.5)
          .to(
            chars,
            {
              scale: 1,
              yPercent: 0,
              autoAlpha: 1,
              duration: 0.5,
              stagger: 0.055,
              ease: 'power3.in',
            },
            0.3,
          )
          .fromTo(
            impact,
            { autoAlpha: 0.55 },
            {
              autoAlpha: 0,
              duration: 0.6,
              ease: 'power2.out',
              immediateRender: false,
            },
            0.8,
          )
          .to(
            word,
            {
              keyframes: { y: [0, 5, -2, 1, 0] },
              duration: 0.32,
              ease: 'none',
            },
            0.8,
          )
          .to(ribbon, { scaleX: 1, duration: 0.7 }, 0.88)
          .to(tagline, { y: 0, autoAlpha: 1, duration: 0.7 }, 0.98)
          .to(bank, { y: 0, autoAlpha: 1, duration: 1 }, 1.0)
          .to(
            ctas,
            {
              y: 0,
              autoAlpha: 1,
              duration: 0.9,
              stagger: 0.08,
              ease: 'back.out(1.4)',
            },
            1.1,
          );
      });
      introFrame.current = requestAnimationFrame(() => {
        introFrame.current = requestAnimationFrame(start);
      });
    },
    { scope: rootRef, dependencies: [revealed, reduceMotion] },
  );

  useEffect(() => {
    const idle = idleRef.current;
    if (!idle || !introDone.current) return;
    if (active) idle.play();
    else idle.pause();
  }, [active]);

  const pressIn = contextSafe((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (reduceMotion || e.button !== 0) return;
    gsap.to(e.currentTarget, {
      scale: 0.955,
      duration: 0.12,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  });

  const pressOut = contextSafe((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (reduceMotion) return;
    gsap.to(e.currentTarget, {
      scale: 1,
      duration: 0.55,
      ease: 'elastic.out(1, 0.45)',
      overwrite: 'auto',
    });
  });

  const playLaunchFx = contextSafe(() => {
    if (reduceMotion || !rootRef.current) return;
    const q = gsap.utils.selector(rootRef);
    gsap
      .timeline()
      .to(q('.rh7-cta--play'), { scale: 1.05, duration: 0.12, ease: 'back.out(3)' }, 0)
      .to(q('.rh7-cta--play'), { scale: 1, duration: 0.18, ease: 'power2.out' }, 0.12)
      .fromTo(
        q('.rh7-flash'),
        { autoAlpha: 0 },
        {
          autoAlpha: 1,
          duration: 0.09,
          yoyo: true,
          repeat: 1,
          ease: 'power1.out',
        },
        0,
      )
      .to(
        q('.rh7-stage'),
        {
          keyframes: {
            x: [0, -7, 6, -5, 4, -2, 0],
            y: [0, 2, -2, 1, -1, 1, 0],
          },
          duration: 0.3,
          ease: 'none',
        },
        0,
      );
  });

  const go = (fn: () => void) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    if (navLockRef.current || playShake) return;
    navLockRef.current = true;
    try {
      resume();
      playTap();
      fn();
    } finally {
      window.setTimeout(() => {
        navLockRef.current = false;
      }, 800);
    }
  };

  /** 0.3s launch hit, then enter Classic. */
  const launchClassic = () => {
    if (playShake || navLockRef.current) return;
    navLockRef.current = true;
    resume();
    playTap();
    setPlayShake(true);
    playLaunchFx();
    if (shakeTimerRef.current != null) window.clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = window.setTimeout(() => {
      shakeTimerRef.current = null;
      setPlayShake(false);
      navLockRef.current = false;
      onPlay();
    }, 300);
  };

  const openSheet = (view: AccountSheetView) => {
    setPromptOpen(false);
    setSheetView(view);
    setSheetOpen(true);
  };

  const continueAsGuest = () => {
    markAccountPromptSeen();
    setPromptOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`tradeup-shell tradeup-shell--home tradeup-shell--hub run-home rh7${
        playShake ? ' is-launching' : ''
      }`}
    >
      <div className="rh7-stage">
        <div className="rh7-bg" aria-hidden>
          <div className="rh7-plate">
            <div className="rh7-plate__sky" />
            <div className="rh7-plate__clouds" />
            <div className="rh7-plate__glow" />
            <div className="rh7-plate__city" />
            <div className="rh7-plate__sheen" />
            {BEACONS.map(([x, y]) => (
              <span key={`${x}-${y}`} className="rh7-plate__beacon" style={{ left: `${x}%`, top: `${y}%` }} />
            ))}
          </div>
          <div className="rh7-bg__shade" />
          <div className="rh7-bg__lift" />
        </div>

        <main className="rh7-main">
          <header className="rh7-brand">
            <h1 className="rh7-logo" aria-label="1B RUN">
              <span className="rh7-logo__word" aria-hidden>
                {WORDMARK.map((ch, i) =>
                  ch === ' ' ? (
                    <span key={i} className="rh7-logo__gap" />
                  ) : (
                    <span key={i} className="rh7-logo__char">
                      {ch}
                    </span>
                  ),
                )}
              </span>
            </h1>
            <p className="rh7-tagline">
              <span className="rh7-tagline__plate" aria-hidden />
              <span className="rh7-tagline__text">
                CHASE <span className="rh7-tagline__amt">$1 BILLION</span>
              </span>
            </p>
          </header>

          <div className="rh7-spacer" aria-hidden />

          <div className="rh7-actions">
            <HomeBankProgress
              revealed={revealed}
              onOpenBoard={onOpenBoard ? go(onOpenBoard) : undefined}
              onOpenWall={go(() => setWallOpen(true))}
              onPressIn={pressIn}
              onPressOut={pressOut}
            />
            <div className="rh7-actions__row">
              <button
                type="button"
                className="rh7-cta rh7-cta--play"
                onPointerDown={pressIn}
                onPointerUp={pressOut}
                onPointerLeave={pressOut}
                onPointerCancel={pressOut}
                onClick={(e) => {
                  if (e.button !== 0) return;
                  launchClassic();
                }}
              >
                <span className="rh7-cta__gloss" aria-hidden />
                <span className="rh7-cta__sheen" aria-hidden />
                <span className="rh7-cta__label">{t('home.playButton')}</span>
              </button>
              <button
                type="button"
                className="rh7-cta rh7-cta--modes"
                onPointerDown={pressIn}
                onPointerUp={pressOut}
                onPointerLeave={pressOut}
                onPointerCancel={pressOut}
                onClick={go(() => setModesOpen(true))}
              >
                <span className="rh7-cta__gloss" aria-hidden />
                <span className="rh7-cta__label">{t('home.modesButton')}</span>
              </button>
            </div>
          </div>
        </main>
      </div>

      <div className="rh7-flash" aria-hidden />
      <div className="rh7-impact" aria-hidden />

      <HomeModesSheet
        open={modesOpen}
        onClose={() => setModesOpen(false)}
        onClassic={launchClassic}
        onHeadToHead={onHeadToHead}
      />

      <AccountProgressPrompt
        open={promptOpen && !sheetOpen}
        onCreateAccount={() => openSheet('signup')}
        onLogIn={() => openSheet('login')}
        onContinueAsGuest={continueAsGuest}
      />

      <AccountAuthSheet
        open={sheetOpen}
        initialView={sheetView}
        state={accountState}
        onStateChange={setAccountState}
        onClose={() => setSheetOpen(false)}
      />

      <WallOfFameScreen
        open={wallOpen}
        preview
        username={wallUsername}
        permanent={isPermanent}
        bankBalance={bankBalance}
        onClose={() => setWallOpen(false)}
        onSignIn={() => {
          setWallOpen(false);
          openSheet('signup');
        }}
      />
    </div>
  );
});
