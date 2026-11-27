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
import { playBallBounceSound } from '@/lib/tradeup/gameAudio';
import { AccountAuthSheet, type AccountSheetView } from './AccountAuthSheet';
import { AccountProgressPrompt } from './AccountProgressPrompt';
import { HomeModesSheet } from './HomeModesSheet';
import { HomeVault } from './home/HomeVault';
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

/** Center-circle centre in the stage art (fractions of plate width / height). */
const PLATE_SPOT = { x: 0.503, y: 0.482 };
const PLATE_RATIO = 9 / 16;

/**
 * Premium home body — "Center Stage": cobalt arena floor, the game ball on the spotlit centre
 * circle (tap = dribble, flick up = tip off a run), Bank readout, live wordmark, slanted CTAs.
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

  /* Lock the court's centre circle under the hero dial at any viewport size. */
  useEffect(() => {
    const stage = rootRef.current?.querySelector<HTMLElement>('.rh9-stage');
    const dial = rootRef.current?.querySelector<HTMLElement>('.rh9-vault__dial');
    const plate = rootRef.current?.querySelector<HTMLElement>('.rh9-plate');
    if (!stage || !dial || !plate) return;
    const apply = () => {
      const s = stage.getBoundingClientRect();
      const d = dial.getBoundingClientRect();
      if (!s.width || !s.height) return;
      const h = Math.max(s.height * 1.12, (s.width * 1.06) / PLATE_RATIO);
      const w = h * PLATE_RATIO;
      const cx = d.left - s.left + d.width / 2;
      const cy = d.top - s.top + d.height * 0.9;
      const left = Math.min(0, Math.max(s.width - w, cx - w * PLATE_SPOT.x));
      const top = Math.min(0, Math.max(s.height - h, cy - h * PLATE_SPOT.y));
      plate.style.width = `${w.toFixed(1)}px`;
      plate.style.height = `${h.toFixed(1)}px`;
      plate.style.left = `${left.toFixed(1)}px`;
      plate.style.top = `${top.toFixed(1)}px`;
      plate.classList.add('is-placed');
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(stage);
    observer.observe(dial);
    return () => observer.disconnect();
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
      const plate = q('.rh9-plate');
      const spot = q('.rh9-plate__spot');
      const cone = q('.rh9-cone');
      const sweep = q('.rh9-plate__sweep');
      const lift = q('.rh9-bg__lift');
      const impact = q('.rh9-impact');
      const word = q('.rh9-logo__word');
      const chars = q('.rh9-logo__char');
      const tagline = q('.rh9-tagline__word');
      const orb = q('.rh9-vault__orb');
      const ball = q('.rh9-vault__ball');
      const shadow = q('.rh9-vault__shadow');
      const readout = q('.rh9-vault__readout');
      const wof = q('.rh9-vault__wof-wrap');
      const ctas = q('.rh9-cta');
      const all = [
        plate,
        spot,
        cone,
        sweep,
        lift,
        impact,
        word,
        chars,
        tagline,
        orb,
        ball,
        shadow,
        readout,
        wof,
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

      gsap.set(lift, { autoAlpha: 1 });
      gsap.set(plate, { scale: 1.14, transformOrigin: '50% 47%' });
      gsap.set(spot, { autoAlpha: 0 });
      gsap.set(cone, { autoAlpha: 0 });
      gsap.set(chars, { yPercent: 150 });
      gsap.set(tagline, { y: 10, autoAlpha: 0 });
      gsap.set(orb, { y: -260, autoAlpha: 0 });
      gsap.set(ball, { rotation: -120 });
      gsap.set(shadow, { scale: 0.3, autoAlpha: 0 });
      gsap.set(readout, { y: 18, autoAlpha: 0 });
      gsap.set(wof, { y: 14, autoAlpha: 0 });
      gsap.set(ctas, { y: 44, autoAlpha: 0 });

      cancelAnimationFrame(introFrame.current);
      if (!revealed || !safe) return;

      /* App flips showSplash on in a layout effect after first render — wait a frame and re-check. */
      const start = safe(() => {
        if (!revealedRef.current || introPlayed.current) return;
        introPlayed.current = true;

        const idle = gsap.timeline({ paused: true });
        idle
          .to(plate, { scale: 1.03, duration: 16, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 0)
          .to(spot, { autoAlpha: 0.78, duration: 3.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 0)
          .to(cone, { autoAlpha: 0.7, duration: 4.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 0.6)
          .to(orb, { y: -7, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 0)
          .to(shadow, { scale: 0.9, autoAlpha: 0.75, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 0)
          .fromTo(
            sweep,
            { xPercent: -120 },
            { xPercent: 220, duration: 4.2, ease: 'sine.inOut', repeat: -1, repeatDelay: 6 },
            2,
          )
          .fromTo(
            q('.rh9-cta__sheen'),
            { xPercent: 0 },
            { xPercent: 520, duration: 1.1, ease: 'power2.inOut', repeat: -1, repeatDelay: 4.2 },
            1.4,
          );
        idleRef.current = idle;

        gsap
          .timeline({
            defaults: { ease: 'expo.out' },
            onComplete: () => {
              introDone.current = true;
              if (activeRef.current) idle.play();
            },
          })
          .to(lift, { autoAlpha: 0, duration: 1.1, ease: 'power2.inOut' }, 0)
          .to(plate, { scale: 1, duration: 2.4, ease: 'power3.out' }, 0)
          /* Arena light hits the centre circle: two-stage flicker, then settles. */
          .to(spot, { keyframes: { autoAlpha: [0, 0.7, 0.25, 1] }, duration: 0.42, ease: 'none' }, 0.22)
          .to(cone, { keyframes: { autoAlpha: [0, 0.6, 0.2, 1] }, duration: 0.42, ease: 'none' }, 0.24)
          .to(orb, { autoAlpha: 1, duration: 0.12, ease: 'none' }, 0.5)
          .to(orb, { y: 0, duration: 0.95, ease: 'bounce.out' }, 0.5)
          .to(ball, { rotation: 0, duration: 1.3, ease: 'power3.out' }, 0.5)
          .to(shadow, { scale: 1, autoAlpha: 1, duration: 0.95, ease: 'bounce.out' }, 0.5)
          .to(chars, { yPercent: 0, duration: 0.75, stagger: 0.05 }, 0.7)
          .fromTo(impact, { autoAlpha: 0.5 }, { autoAlpha: 0, duration: 0.6, ease: 'power2.out', immediateRender: false }, 0.84)
          .to(word, { keyframes: { y: [0, 3, -1, 0] }, duration: 0.28, ease: 'none' }, 0.95)
          .to(tagline, { y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.12 }, 1.0)
          .to(readout, { y: 0, autoAlpha: 1, duration: 0.85 }, 1.15)
          .to(wof, { y: 0, autoAlpha: 1, duration: 0.85 }, 1.25)
          .to(ctas, { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.08, ease: 'back.out(1.4)' }, 1.3);
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
      .to(q('.rh9-cta--play'), { scale: 1.05, duration: 0.12, ease: 'back.out(3)' }, 0)
      .to(q('.rh9-cta--play'), { scale: 1, duration: 0.18, ease: 'power2.out' }, 0.12)
      .fromTo(
        q('.rh9-flash'),
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
        q('.rh9-stage'),
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

  const ballTap = (gain: number) => {
    resume();
    playBallBounceSound(gain);
  };

  return (
    <div
      ref={rootRef}
      className={`tradeup-shell tradeup-shell--home tradeup-shell--hub run-home rh7 rh9${
        playShake ? ' is-launching' : ''
      }`}
    >
      <div className="rh9-stage">
        <div className="rh9-bg" aria-hidden>
          <div className="rh9-plate">
            <div className="rh9-plate__floor" />
            <div className="rh9-plate__spot" />
            <div className="rh9-plate__sweep" />
          </div>
          <div className="rh9-cone" />
          <div className="rh9-bg__shade" />
          <div className="rh9-bg__lift" />
        </div>

        <main className="rh9-main">
          <header className="rh9-brand">
            <h1 className="rh9-logo" aria-label="1B RUN">
              <span className="rh9-logo__word" aria-hidden>
                {WORDMARK.map((ch, i) =>
                  ch === ' ' ? (
                    <span key={i} className="rh9-logo__gap" />
                  ) : (
                    <span key={i} className="rh9-logo__mask">
                      <span className="rh9-logo__char">{ch}</span>
                    </span>
                  ),
                )}
              </span>
            </h1>
            <p className="rh9-tagline">
              <span className="rh9-tagline__word rh9-tagline__chase">CHASE</span>
              <span className="rh9-tagline__word rh9-tagline__amt">$1 BILLION</span>
            </p>
          </header>

          <HomeVault
            revealed={revealed}
            onOpenBoard={onOpenBoard ? go(onOpenBoard) : undefined}
            onOpenWall={go(() => setWallOpen(true))}
            locked={playShake}
            onTipOff={launchClassic}
            onDribble={ballTap}
            onPressIn={pressIn}
            onPressOut={pressOut}
          />

          <div className="rh9-actions">
            <button
              type="button"
              className="rh9-cta rh9-cta--play"
              onPointerDown={pressIn}
              onPointerUp={pressOut}
              onPointerLeave={pressOut}
              onPointerCancel={pressOut}
              onClick={(e) => {
                if (e.button !== 0) return;
                launchClassic();
              }}
            >
              <span className="rh9-cta__body" aria-hidden>
                <span className="rh9-cta__sheen" />
              </span>
              <span className="rh9-cta__label">{t('home.playButton')}</span>
            </button>
            <button
              type="button"
              className="rh9-cta rh9-cta--modes"
              onPointerDown={pressIn}
              onPointerUp={pressOut}
              onPointerLeave={pressOut}
              onPointerCancel={pressOut}
              onClick={go(() => setModesOpen(true))}
            >
              <span className="rh9-cta__body" aria-hidden />
              <span className="rh9-cta__label">{t('home.modesButton')}</span>
            </button>
          </div>
        </main>
      </div>

      <div className="rh9-flash" aria-hidden />
      <div className="rh9-impact" aria-hidden />

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
