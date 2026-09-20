'use client';

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useAchievementCloudSync } from '@/hooks/useAchievementCloudSync';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';
import { USER_DATA_CLEARED_EVENT } from '@/lib/account/clearLocalUserData';
import {
  hasSeenAccountPrompt,
  markAccountPromptSeen,
  resetAccountPromptSeen,
} from '@/lib/account/accountPromptStorage';
import {
  BILLION_GOAL,
  formatDollarsExact,
} from '@/lib/tradeup/billionDollar';
import { hapticLight } from '@/lib/tradeup/haptics';
import { getBestRosterValue, CLASSIC_PROGRESS_EVENT } from '@/lib/tradeup/storage';
import {
  AccountAuthSheet,
  type AccountSheetView,
} from './AccountAuthSheet';
import { AccountProgressPrompt } from './AccountProgressPrompt';
import { ArenaAtmosphere } from './ArenaAtmosphere';
import { HomeAccountEntry } from './HomeAccountEntry';
import { LanguageToggle } from './LanguageToggle';
import { MoneyRain } from './MoneyRain';
import { BallionLogo } from './TradeUpLogo';
import { SoundSettings } from './SoundSettings';

interface TradeUpHomeProps {
  onPlay: () => void;
  onHeadToHead: () => void;
}

/** $1B RUN home — premium sports composition. */
export function TradeUpHome({ onPlay, onHeadToHead }: TradeUpHomeProps) {
  const { resume } = useSound();
  const { t } = useLocale();
  const { state: accountState, setState: setAccountState } = useAccountAuth();
  useAchievementCloudSync(accountState);
  // localStorage only on client — avoid SSR/client text hydration mismatch
  const [bestRun, setBestRun] = useState(0);
  const [promptOpen, setPromptOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<AccountSheetView>('menu');
  const navLockRef = useRef(false);

  useEffect(() => {
    const refreshBest = () => setBestRun(getBestRosterValue());
    refreshBest();
    window.addEventListener(USER_DATA_CLEARED_EVENT, refreshBest);
    window.addEventListener('storage', refreshBest);
    window.addEventListener(CLASSIC_PROGRESS_EVENT, refreshBest);
    return () => {
      window.removeEventListener(USER_DATA_CLEARED_EVENT, refreshBest);
      window.removeEventListener('storage', refreshBest);
      window.removeEventListener(CLASSIC_PROGRESS_EVENT, refreshBest);
    };
  }, []);

  // Dev-only: ?resetAccountPrompt=1 clears the first-run flag (no Auth/profile delete).
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

  // Show first-run prompt after home is up and auth has resolved — never for permanent accounts.
  useEffect(() => {
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
  }, [accountState.status]);

  const bestIsBillion = bestRun >= BILLION_GOAL;

  const go = (fn: () => void) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    // Primary pointer only — ignore multi-touch / trailing events.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (navLockRef.current) return;
    navLockRef.current = true;
    try {
      resume();
      hapticLight();
      fn();
    } finally {
      window.setTimeout(() => {
        navLockRef.current = false;
      }, 800);
    }
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
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub run-home run-home--tabbed">
      <ArenaAtmosphere intensity="hub" />
      <MoneyRain />

      <div className="run-home__ui">
        <header className="run-home__top">
          <div className="run-home__brand">
            <BallionLogo size="sm" priority className="run-home__logo" />
            <p className="run-home__wordmark" aria-label="1B Run">
              <span className="run-home__wordmark-green">1B</span>
              <span className="run-home__wordmark-white"> RUN</span>
            </p>
          </div>
          <div className="run-home__toolbar">
            <HomeAccountEntry
              state={accountState}
              onOpen={() => openSheet(accountState.status === 'permanent' ? 'menu' : 'menu')}
            />
            <LanguageToggle />
            <SoundSettings variant="gear" />
          </div>
        </header>

        {/* Space for gym hoop between brand bar and BUILD YOUR FIVE */}
        <div className="run-home__hoop-gap" aria-hidden />

        <div className="run-home__main">
          <section className="run-home__hero" aria-label={t('home.challengeLabel')}>
            <h1 className="run-home__title">{t('home.heroTitle')}</h1>
            <p className="run-home__subtitle">{t('home.heroSubtitle')}</p>
          </section>

          <div className="run-home__stage">
            <div
              className="run-home__modes run-home__modes--tiles"
              role="group"
              aria-label={t('home.modesLabel')}
            >
              <div className="home-tile home-tile--classic">
                <div className="home-tile__frame">
                  <span className="home-tile__edge" aria-hidden />
                  <span className="home-tile__accent" aria-hidden />
                  <strong className="home-tile__title">{t('home.classicTitle')}</strong>
                  <span className="home-tile__desc">{t('home.classicDesc')}</span>
                  <span className="home-tile__mark" aria-hidden>
                    $1B
                  </span>
                  <button
                    type="button"
                    className="home-tile__play"
                    aria-label={`${t('home.playButton')} — ${t('home.classicTitle')}`}
                    onPointerDown={go(onPlay)}
                    onClick={go(onPlay)}
                  >
                    {t('home.playButton')}
                  </button>
                </div>
              </div>

              <div className="home-tile home-tile--h2h">
                <div className="home-tile__frame">
                  <span className="home-tile__edge" aria-hidden />
                  <span className="home-tile__accent" aria-hidden />
                  <strong className="home-tile__title">{t('home.h2hTitle')}</strong>
                  <span className="home-tile__desc">{t('home.h2hDesc')}</span>
                  <span className="home-tile__mark home-tile__mark--dual" aria-hidden>
                    <svg
                      className="home-tile__dual"
                      viewBox="0 0 64 64"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle cx="22" cy="18" r="9" />
                      <path d="M6.5 52.5c0-10.2 6.9-16.5 15.5-16.5S37.5 42.3 37.5 52.5V56H6.5v-3.5Z" />
                      <circle cx="42" cy="18" r="9" />
                      <path d="M26.5 52.5c0-10.2 6.9-16.5 15.5-16.5S57.5 42.3 57.5 52.5V56H26.5v-3.5Z" />
                    </svg>
                  </span>
                  <button
                    type="button"
                    className="home-tile__play"
                    aria-label={`${t('home.playButton')} — ${t('home.h2hTitle')}`}
                    onPointerDown={go(onHeadToHead)}
                    onClick={go(onHeadToHead)}
                  >
                    {t('home.playButton')}
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`run-home__best${bestIsBillion ? ' is-billion' : ''}`}
              aria-label={t('home.bestRunLabel')}
            >
              <span className="run-home__best-label">{t('home.bestRunLabel')}</span>
              <strong className="run-home__best-value">
                {bestRun > 0 ? formatDollarsExact(bestRun) : t('home.bestRunEmpty')}
              </strong>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}
