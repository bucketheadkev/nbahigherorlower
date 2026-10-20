'use client';

import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useAchievementCloudSync } from '@/hooks/useAchievementCloudSync';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';
import {
  hasSeenAccountPrompt,
  markAccountPromptSeen,
  resetAccountPromptSeen,
} from '@/lib/account/accountPromptStorage';
import { formatCash, readBankPreview } from '@/lib/tradeup/bank';
import { nextMilestone, recordLocalInduction } from '@/lib/tradeup/wallOfFame';
import { hapticLight } from '@/lib/tradeup/haptics';
import { settlePendingServerSlips } from '@/lib/tradeup/wagerSlip';
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
import { WallOfFameScreen } from './WallOfFameScreen';
import { TickerNumber } from './onboarding/ticker';
import { CircuitScreen } from './circuit/CircuitScreen';
import type { CircuitRunConfig } from '@/lib/account/circuitCloud';

interface TradeUpHomeProps {
  onPlay: () => void;
  /** Launch a Circuit league entry run. */
  onPlayCircuit: (config: CircuitRunConfig) => void;
  onHeadToHead: () => void;
  /** False while the splash or first-run guide is up, so the account popup waits its turn. */
  allowAccountPrompt?: boolean;
}

/** $1B RUN home — premium sports composition. */
export function TradeUpHome({
  onPlay,
  onPlayCircuit,
  onHeadToHead,
  allowAccountPrompt = true,
}: TradeUpHomeProps) {
  const { resume } = useSound();
  const { t } = useLocale();
  const { state: accountState, setState: setAccountState } = useAccountAuth();
  useAchievementCloudSync(accountState);
  const bank = useBankBalance(accountState.status === 'permanent');
  const [promptOpen, setPromptOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<AccountSheetView>('menu');
  const [wallOpen, setWallOpen] = useState(false);
  const [circuitOpen, setCircuitOpen] = useState(false);
  const milestone = bank == null ? null : nextMilestone(bank);
  const permanent = accountState.status === 'permanent';

  useEffect(() => {
    if (!permanent && bank != null && readBankPreview() == null) recordLocalInduction(bank);
  }, [bank, permanent]);

  useEffect(() => {
    if (permanent) void settlePendingServerSlips();
  }, [permanent]);

  // Bank card centers between the tiles and the tab bar; the bar's height varies by device.
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.oneb-tabbar');
    if (!bar) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty('--home-tabbar-h', `${Math.round(bar.getBoundingClientRect().height)}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  const navLockRef = useRef(false);


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

  // Account popup waits until splash and the first-run guide are finished.
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
    // Primary pointer only — ignore multi-touch / trailing events.
    if (e.button !== 0) return;
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
                    onClick={go(onHeadToHead)}
                  >
                    {t('home.playButton')}
                  </button>
                </div>
              </div>
            </div>

            <div className={`run-home__best run-home__best--bank${milestone ? '' : ' is-wall'}`}>
            <button
              type="button"
              className="bank-chip__main"
              aria-label={`${t('home.bankLabel')}: ${formatCash(bank ?? 0)}. ${
                milestone ? t('home.nextMilestone', { amount: formatCash(milestone.next) }) : ''
              } ${t('home.wallOfFame')}`}
              onClick={() => {
                hapticLight();
                setWallOpen(true);
              }}
            >
              <span className="bank-chip__top" aria-hidden>
                <span className="run-home__best-label">{t('home.bankLabel')}</span>
              </span>
              <strong className="run-home__best-value" aria-hidden>
                {bank == null ? t('home.bestRunEmpty') : <TickerNumber value={bank} duration={900} />}
              </strong>
              {bank != null ? (
                <span className="bank-chip__progress" aria-hidden>
                  <span className="bank-chip__meter">
                    <i style={{ transform: `scaleX(${milestone ? Math.max(milestone.pct, 0.015) : 1})` }} />
                  </span>
                  <span className="bank-chip__next">
                    {milestone
                      ? t('home.nextMilestone', { amount: formatCash(milestone.next) })
                      : t('home.wallReached')}
                  </span>
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="bank-chip__circuit"
              aria-label={t('home.circuit')}
              onClick={() => {
                hapticLight();
                setCircuitOpen(true);
              }}
            >
              <span className="bank-chip__circuit-name">
                <i aria-hidden />
                {t('home.circuit')}
              </span>
              <span className="bank-chip__circuit-cta" aria-hidden>
                ›
              </span>
            </button>
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

      <CircuitScreen
        open={circuitOpen}
        permanent={permanent}
        bankBalance={bank}
        onClose={() => setCircuitOpen(false)}
        onPlay={(config) => {
          setCircuitOpen(false);
          onPlayCircuit(config);
        }}
        onSignIn={() => {
          setCircuitOpen(false);
          openSheet('signup');
        }}
      />

      <WallOfFameScreen
        open={wallOpen}
        bankBalance={bank ?? 0}
        username={accountState.status === 'permanent' ? accountState.profile.username : null}
        permanent={permanent}
        onClose={() => setWallOpen(false)}
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
