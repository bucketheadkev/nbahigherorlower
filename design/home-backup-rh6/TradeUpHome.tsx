'use client';

import { memo, type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
import {
  AccountAuthSheet,
  type AccountSheetView,
} from './AccountAuthSheet';
import { AccountProgressPrompt } from './AccountProgressPrompt';
import { HomeModesSheet } from './HomeModesSheet';
import { HomeArenaStage } from './home/HomeArenaStage';
import { HomeBankProgress } from './home/HomeBankProgress';
import { WallOfFameScreen } from './WallOfFameScreen';
import { useBankBalance } from '@/hooks/useBankBalance';
import { COINS_WELCOME, ensureWelcomeCoins } from '@/lib/tradeup/xp';

interface TradeUpHomeProps {
  onPlay: () => void;
  onHeadToHead: () => void;
  onOpenShop?: () => void;
  onOpenBoard?: () => void;
  allowAccountPrompt?: boolean;
}

const enterEase = [0.22, 1, 0.36, 1] as const;

/**
 * rh6 Arena Command home — ground-up visual redesign.
 * Previous rh5 implementation: design/home-backup-rh5/
 * Top chrome stays in HomeHubChromeHost (shared); home-scoped polish via data-hub-tab.
 */
export const TradeUpHome = memo(function TradeUpHome({
  onPlay,
  onHeadToHead,
  onOpenBoard,
  allowAccountPrompt = true,
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

  const launchClassic = () => {
    if (playShake || navLockRef.current) return;
    navLockRef.current = true;
    resume();
    playTap();
    setPlayShake(true);
    if (shakeTimerRef.current != null) window.clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = window.setTimeout(() => {
      shakeTimerRef.current = null;
      setPlayShake(false);
      navLockRef.current = false;
      onPlay();
    }, 320);
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

  const motionOff = reduceMotion || playShake;

  return (
    <div
      className={`tradeup-shell tradeup-shell--home tradeup-shell--hub run-home rh6${
        playShake ? ' is-play-shake' : ''
      }`}
    >
      <div className="rh6-bg" aria-hidden>
        <div className="rh6-bg__void" />
        <div className="rh6-bg__spot rh6-bg__spot--a" />
        <div className="rh6-bg__spot rh6-bg__spot--b" />
        <div className="rh6-bg__spot rh6-bg__spot--c" />
        <div className="rh6-bg__grid" />
        <div className="rh6-bg__vignette" />
      </div>

      <main className="rh6-main">
        <motion.header
          className="rh6-brand"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: enterEase }}
        >
          <h1 className="rh6-brand__mark">1B RUN</h1>
          <p className="rh6-brand__tag">
            CHASE <span className="rh6-brand__tag-amt">$1 BILLION</span>
          </p>
        </motion.header>

        <motion.div
          className="rh6-hero"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: enterEase, delay: 0.08 }}
        >
          <HomeArenaStage />
        </motion.div>

        <motion.div
          className="rh6-dock"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: enterEase, delay: 0.14 }}
        >
          <HomeBankProgress
            onOpenBoard={onOpenBoard ? go(onOpenBoard) : undefined}
            onOpenWall={go(() => setWallOpen(true))}
          />

          <div className="rh6-actions">
            <motion.button
              type="button"
              className="rh6-play"
              whileTap={motionOff ? undefined : { scale: 0.975 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              onClick={(e) => {
                if (e.button !== 0) return;
                launchClassic();
              }}
            >
              <span className="rh6-play__sheen" aria-hidden />
              <span className="rh6-play__label">{t('home.playButton')}</span>
            </motion.button>

            <motion.button
              type="button"
              className="rh6-modes ui-tap"
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              onClick={go(() => setModesOpen(true))}
            >
              <span className="rh6-modes__label">{t('home.modesButton')}</span>
            </motion.button>
          </div>
        </motion.div>
      </main>

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
