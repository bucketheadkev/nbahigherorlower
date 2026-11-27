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
import { HomeArenaLiveFx } from './home/HomeArenaLiveFx';
import { HomeRisingBubbles } from './home/HomeRisingBubbles';
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

/**
 * Premium home body — arena bg + CTAs. Top chrome lives in HomeHubChromeHost (shared).
 * Memoized so hub Shop taps don't rebuild the home tree on website.
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

  /** Dramatic 0.3s home shake, then enter Classic. */
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
      className={`tradeup-shell tradeup-shell--home tradeup-shell--hub run-home rh5${
        playShake ? ' is-play-shake' : ''
      }`}
    >
      <div className="rh5-bg" aria-hidden>
        <div className="rh5-bg__photo" />
        <div className="rh5-bg__bloom" />
        <div className="rh5-bg__grain" />
        <HomeRisingBubbles />
        <HomeArenaLiveFx />
        <div className="rh5-bg__veil" />
        <div className="rh5-bg__rim" />
      </div>

      <main className="rh5-main">
        <motion.div
          className="rh5-actions"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
        >
          <HomeBankProgress
            onOpenBoard={onOpenBoard ? go(onOpenBoard) : undefined}
            onOpenWall={go(() => setWallOpen(true))}
          />
          <div className="rh5-actions__row">
            <motion.button
              type="button"
              className="rh5-cta rh5-cta--play"
              whileTap={reduceMotion || playShake ? undefined : { scale: 0.978 }}
              transition={{ type: 'spring', stiffness: 520, damping: 32 }}
              onClick={(e) => {
                if (e.button !== 0) return;
                launchClassic();
              }}
            >
              <span className="rh5-cta__glow" aria-hidden />
              <span className="rh5-cta__sheen" aria-hidden />
              <span className="rh5-cta__edge" aria-hidden />
              <span className="rh5-cta__label">{t('home.playButton')}</span>
            </motion.button>
            <motion.button
              type="button"
              className="rh5-cta rh5-cta--modes ui-tap"
              whileTap={reduceMotion ? undefined : { scale: 0.978 }}
              transition={{ type: 'spring', stiffness: 520, damping: 32 }}
              onClick={go(() => setModesOpen(true))}
            >
              <span className="rh5-cta__modes-sheen" aria-hidden />
              <span className="rh5-cta__label">{t('home.modesButton')}</span>
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
