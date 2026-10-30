'use client';

import { type CSSProperties, type MouseEvent as ReactMouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useAchievementCloudSync } from '@/hooks/useAchievementCloudSync';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import { useOwnedFranchise } from '@/hooks/useOwnedFranchise';
import { useRank } from '@/hooks/useRank';
import { useSound } from '@/hooks/useSound';
import {
  hasSeenAccountPrompt,
  markAccountPromptSeen,
  resetAccountPromptSeen,
} from '@/lib/account/accountPromptStorage';
import { formatCash, readBankPreview } from '@/lib/tradeup/bank';
import { rankName } from '@/lib/tradeup/rank/config';
import { recordLocalInduction } from '@/lib/tradeup/wallOfFame';
import { hapticLight } from '@/lib/tradeup/haptics';
import {
  AccountAuthSheet,
  type AccountSheetView,
} from './AccountAuthSheet';
import { AccountProgressPrompt } from './AccountProgressPrompt';
import { ArenaIcon } from './ArenaIcon';
import { HomeAccountEntry } from './HomeAccountEntry';
import { LanguageToggle } from './LanguageToggle';
import { MoneyRain } from './MoneyRain';
import { BallionLogo } from './TradeUpLogo';
import { SoundSettings } from './SoundSettings';
import { WallOfFameScreen } from './WallOfFameScreen';
import { TickerNumber } from './onboarding/ticker';
import { CircuitScreen } from './circuit/CircuitScreen';
import { FranchisesScreen } from './ownership/FranchisesScreen';
import { teamTheme } from './ownership/FranchiseParts';
import { RankEmblem } from './rank/RankEmblem';
import type { CircuitRunConfig } from '@/lib/account/circuitCloud';

/** home-v2/arena.jpg: where the net ends (share of the photo's height), and the gap above the title. */
const NET_BOTTOM = 0.303;
const NET_GAP_PX = 18;
/** Highest data-fit step defined in home-v2.css for the Bank bar. */
const BANK_FIT_LEVELS = 5;

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
  const { t, locale } = useLocale();
  const { state: accountState, setState: setAccountState } = useAccountAuth();
  useAchievementCloudSync(accountState);
  const bank = useBankBalance(accountState.status === 'permanent');
  const rank = useRank(accountState.status === 'permanent' ? accountState.user.id : null, bank);
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
  // Fit the Bank bar to the real balance: step down only as far as this figure needs.
  const bankBarRef = useRef<HTMLElement | null>(null);
  const rankKey = `${rank.ready ? rank.rank.id : ''}:${locale}`;
  useLayoutEffect(() => {
    const bar = bankBarRef.current;
    if (!bar) return;
    const fit = () => {
      const amount = bar.querySelector<HTMLElement>('.rh2-bank__amount');
      const value = bar.querySelector<HTMLElement>('.rh2-bank__value');
      const wof = bar.querySelector<HTMLElement>('.rh2-wof');
      if (!amount || !value || !wof) return;
      // Measure the final figure on a hidden twin: the live node belongs to TickerNumber,
      // and replacing its text would detach the count-up from the screen.
      value.style.removeProperty('font-size');
      const probe = document.createElement('strong');
      probe.className = value.className;
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:0;top:0';
      probe.textContent = bank == null ? t('home.bestRunEmpty') : formatCash(bank);
      amount.appendChild(probe);
      const room = () => {
        const inner = bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight);
        return wof.getBoundingClientRect().right <= inner + 0.5;
      };
      const figureFits = () => probe.getBoundingClientRect().width <= amount.clientWidth + 0.5;
      for (let level = 0; level <= BANK_FIT_LEVELS; level++) {
        bar.dataset.fit = String(level);
        if (room() && figureFits()) break;
      }
      // Last resort: shrink the figure itself until every digit shows.
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
  }, [bank, rankKey, t]);

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
            <LanguageToggle />
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
          <span className="rh2-bank__divider" aria-hidden />
          <span
            className="rh2-bank__rank"
            style={bank != null && rank.ready ? ({ '--rank-color': rank.rank.color } as CSSProperties) : undefined}
            aria-label={bank != null && rank.ready ? rankName(rank.rank, locale) : undefined}
          >
            {bank != null && rank.ready ? (
              <>
                <RankEmblem rank={rank.rank} size={22} />
                <span className="rh2-bank__rank-name">{rankName(rank.rank, locale)}</span>
              </>
            ) : null}
          </span>
          <button
            type="button"
            className="rh2-wof"
            aria-label={t('home.wallOfFame')}
            onClick={() => {
              hapticLight();
              setWallOpen(true);
            }}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
              <path
                d="M4.5 2.5h7v3.2a3.5 3.5 0 0 1-7 0V2.5ZM4.5 3.6H2.6v1.1a2 2 0 0 0 2.1 2M11.5 3.6h1.9v1.1a2 2 0 0 1-2.1 2M8 9.2v2.4M5.6 13.5h4.8M6.4 11.6h3.2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="rh2-wof__text">{t('home.wallOfFame')}</span>
            <Chevron />
          </button>
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
            <ArenaIcon className="rh2-dest__icon" tone={ownedTeam ? 'ink' : 'gold'} />
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
            <img className="rh2-dest__icon" src="/images/home-v2/trophy.png" alt="" aria-hidden />
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

      <FranchisesScreen
        open={franchisesOpen}
        permanent={permanent}
        bankBalance={bank}
        onClose={() => setFranchisesOpen(false)}
        onSignIn={() => {
          setFranchisesOpen(false);
          openSheet('signup');
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
