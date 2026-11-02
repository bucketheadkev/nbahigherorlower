'use client';

import { type MouseEvent as ReactMouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useAchievementCloudSync } from '@/hooks/useAchievementCloudSync';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import { useOwnedFranchise } from '@/hooks/useOwnedFranchise';
import { useSound } from '@/hooks/useSound';
import {
  hasSeenAccountPrompt,
  markAccountPromptSeen,
  resetAccountPromptSeen,
} from '@/lib/account/accountPromptStorage';
import { formatCash, readBankPreview } from '@/lib/tradeup/bank';
import { recordLocalInduction } from '@/lib/tradeup/wallOfFame';
import { hapticLight } from '@/lib/tradeup/haptics';
import {
  AccountAuthSheet,
  type AccountSheetView,
} from './AccountAuthSheet';
import { AccountProgressPrompt } from './AccountProgressPrompt';
import { HomeAccountEntry } from './HomeAccountEntry';
import { MoneyRain } from './MoneyRain';
import { BallionLogo } from './TradeUpLogo';
import { SoundSettings } from './SoundSettings';
import { WallOfFameScreen } from './WallOfFameScreen';
import { TickerNumber } from './onboarding/ticker';
import { CircuitScreen } from './circuit/CircuitScreen';
import { FranchiseMode } from './franchise/FranchiseMode';
import { teamTheme } from './ownership/FranchiseParts';
import type { CircuitRunConfig } from '@/lib/account/circuitCloud';

/** home-v2/arena.jpg: where the net ends (share of the photo's height), and the gap above the title. */
const NET_BOTTOM = 0.303;
const NET_GAP_PX = 18;

function Chevron() {
  return (
    <svg className="rh2-chev" viewBox="0 0 8 12" width="8" height="12" fill="none" aria-hidden>
      <path d="M2 1.75 6.25 6 2 10.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  const [franchisesOpen, setFranchisesOpen] = useState(false);
  const permanent = accountState.status === 'permanent';
  const ownedTeam = useOwnedFranchise(permanent ? accountState.user.id : null, franchisesOpen);

  useEffect(() => {
    if (!permanent && bank != null && readBankPreview() == null) recordLocalInduction(bank);
  }, [bank, permanent]);

  // Franchise arena art, warmed up so the mode opens on a ready background.
  useEffect(() => {
    const id = window.setTimeout(() => {
      new Image().src = '/images/pack/arena-bg.jpg';
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);

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
  // Slide the arena photo so its hoop net sits just above the title on every screen size.
  useLayoutEffect(() => {
    const place = () => {
      const photo = document.querySelector<HTMLImageElement>('.rh2-bg__photo');
      const title = document.querySelector<HTMLElement>('.rh2-hero__title');
      const ui = document.querySelector<HTMLElement>('.rh2-ui');
      if (!photo || !title || !ui) return;
      const titleTop = title.getBoundingClientRect().top + ui.scrollTop;
      const height = photo.getBoundingClientRect().height;
      photo.style.top = `${Math.round(titleTop - NET_GAP_PX - NET_BOTTOM * height)}px`;
    };
    place();
    void document.fonts?.ready.then(place);
    const photo = document.querySelector<HTMLImageElement>('.rh2-bg__photo');
    photo?.addEventListener('load', place);
    window.addEventListener('resize', place);
    return () => {
      photo?.removeEventListener('load', place);
      window.removeEventListener('resize', place);
    };
  }, []);
  // Shrink the balance only when a very long figure would not fit the bar.
  const bankBarRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const bar = bankBarRef.current;
    if (!bar) return;
    const fit = () => {
      const amount = bar.querySelector<HTMLElement>('.rh2-bank__amount');
      const value = bar.querySelector<HTMLElement>('.rh2-bank__value');
      if (!amount || !value) return;
      // Measure the final figure on a hidden twin: the live node belongs to TickerNumber,
      // and replacing its text would detach the count-up from the screen.
      value.style.removeProperty('font-size');
      const probe = document.createElement('strong');
      probe.className = value.className;
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:0;top:0';
      probe.textContent = bank == null ? t('home.bestRunEmpty') : formatCash(bank);
      amount.appendChild(probe);
      const width = probe.getBoundingClientRect().width;
      if (width > amount.clientWidth + 0.5) {
        const size = parseFloat(getComputedStyle(probe).fontSize);
        value.style.fontSize = `${Math.floor(size * (amount.clientWidth / width) * 10) / 10}px`;
      }
      probe.remove();
    };
    fit();
    void document.fonts?.ready.then(fit);
    const observer = new ResizeObserver(() => fit());
    observer.observe(bar);
    return () => observer.disconnect();
  }, [bank, t]);

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
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub run-home rh2">
      <div className="rh2-bg" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rh2-bg__photo" src="/images/home-v2/arena.jpg" alt="" decoding="async" />
        <span className="rh2-bg__shade" />
      </div>
      <MoneyRain />

      <div className="rh2-ui">
        <header className="rh2-top">
          <div className="rh2-brand">
            <BallionLogo size="sm" priority className="rh2-logo" />
            <p className="rh2-wordmark" aria-label="1B Run">
              1B RUN
            </p>
          </div>
          <div className="rh2-toolbar">
            <HomeAccountEntry state={accountState} onOpen={() => openSheet('menu')} />
            <button
              type="button"
              className="rh2-wof"
              aria-label={t('home.wallOfFame')}
              title={t('home.wallOfFame')}
              onClick={() => {
                hapticLight();
                setWallOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden>
                <defs>
                  <linearGradient id="rh2-wof-gold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fff1b8" />
                    <stop offset="0.45" stopColor="#ffc93d" />
                    <stop offset="1" stopColor="#c47a0c" />
                  </linearGradient>
                </defs>
                <path
                  fill="url(#rh2-wof-gold)"
                  d="M7 3h10v1.2h3.3v2.3a4.3 4.3 0 0 1-4.1 4.3A5.2 5.2 0 0 1 13 13.9V16h2.6a1.4 1.4 0 0 1 1.4 1.4V19H7v-1.6A1.4 1.4 0 0 1 8.4 16H11v-2.1a5.2 5.2 0 0 1-3.2-3.1 4.3 4.3 0 0 1-4.1-4.3V4.2H7V3Zm0 3H5.5v.5a2.5 2.5 0 0 0 1.8 2.4A5.4 5.4 0 0 1 7 7.2V6Zm10 0v1.2c0 .6-.1 1.2-.3 1.7a2.5 2.5 0 0 0 1.8-2.4V6H17ZM6 20h12v1.4H6V20Z"
                />
              </svg>
            </button>
            <SoundSettings variant="gear" />
          </div>
        </header>

        <div className="rh2-spacer" aria-hidden />

        <section className="rh2-hero" aria-label={t('home.challengeLabel')}>
          <h1 className="rh2-hero__title">{t('home.heroTitle')}</h1>
          <p className="rh2-hero__sub">{t('home.heroSubtitle')}</p>
        </section>

        <div className="rh2-modes" role="group" aria-label={t('home.modesLabel')}>
          <article className="rh2-card rh2-card--classic">
            <h2 className="rh2-card__title">{t('home.classicTitle')}</h2>
            <p className="rh2-card__desc">{t('home.classicDesc')}</p>
            <div className="rh2-card__art" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/home-v2/classic.jpg" alt="" decoding="async" />
            </div>
            <button
              type="button"
              className="rh2-play"
              aria-label={`${t('home.playButton')} — ${t('home.classicTitle')}`}
              onClick={go(onPlay)}
            >
              <span>{t('home.playButton')}</span>
              <Chevron />
            </button>
          </article>

          <article className="rh2-card rh2-card--h2h">
            <h2 className="rh2-card__title">{t('home.h2hTitle')}</h2>
            <p className="rh2-card__desc">{t('home.h2hDesc')}</p>
            <div className="rh2-card__art" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/home-v2/1v1.jpg" alt="" decoding="async" />
              <span className="rh2-vs">VS</span>
            </div>
            <button
              type="button"
              className="rh2-play"
              aria-label={`${t('home.playButton')} — ${t('home.h2hTitle')}`}
              onClick={go(onHeadToHead)}
            >
              <span>{t('home.playButton')}</span>
              <Chevron />
            </button>
          </article>
        </div>

        <section
          ref={bankBarRef}
          className="rh2-bank"
          aria-label={`${t('home.bankLabel')}: ${formatCash(bank ?? 0)}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rh2-bank__icon" src="/images/home-v2/money.png" alt="" aria-hidden />
          <div className="rh2-bank__amount">
            <span className="rh2-bank__label">{t('home.bankLabel')}</span>
            <strong className="rh2-bank__value">
              {bank == null ? t('home.bestRunEmpty') : <TickerNumber value={bank} duration={900} />}
            </strong>
          </div>
        </section>

        <div className="rh2-dest" role="group">
          <button
            type="button"
            className={`rh2-dest__card rh2-dest__card--franchises${ownedTeam ? ' is-owned' : ''}`}
            style={ownedTeam ? teamTheme(ownedTeam) : undefined}
            onClick={() => {
              hapticLight();
              setFranchisesOpen(true);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="rh2-dest__icon rh2-dest__icon--arena" src="/images/home-v2/arena-exterior.png" alt="" aria-hidden />
            <span className="rh2-dest__text">
              <strong>{ownedTeam ? t('home.myFranchise') : t('home.franchises')}</strong>
              {ownedTeam ? null : <em>{t('home.franchisesDesc')}</em>}
            </span>
            <Chevron />
          </button>
          <button
            type="button"
            className="rh2-dest__card rh2-dest__card--cups"
            onClick={() => {
              hapticLight();
              setCircuitOpen(true);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="rh2-dest__icon" src="/images/home-v2/trophy-gold.png" alt="" aria-hidden />
            <span className="rh2-dest__text">
              <strong>{t('home.circuit')}</strong>
              <em>{t('home.circuitDesc')}</em>
            </span>
            <Chevron />
          </button>
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

      <FranchiseMode
        open={franchisesOpen}
        permanent={permanent}
        userId={permanent ? accountState.user.id : null}
        guestBank={bank ?? 0}
        onClose={() => setFranchisesOpen(false)}
        onSignIn={() => {
          setFranchisesOpen(false);
          openSheet('signup');
        }}
        onPlayClassic={() => {
          setFranchisesOpen(false);
          onPlay();
        }}
      />

      <WallOfFameScreen
        open={wallOpen}
        bankBalance={bank ?? 0}
        username={accountState.status === 'permanent' ? accountState.profile.username : null}
        permanent={permanent}
        onClose={() => setWallOpen(false)}
        onSignIn={() => {
          setWallOpen(false);
          openSheet('signup');
        }}
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
