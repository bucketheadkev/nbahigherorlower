'use client';

import { type MouseEvent as ReactMouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { recordLocalInduction } from '@/lib/tradeup/wallOfFame';
import { hapticLight } from '@/lib/tradeup/haptics';
import {
  AccountAuthSheet,
  type AccountSheetView,
} from './AccountAuthSheet';
import { AccountProgressPrompt } from './AccountProgressPrompt';
import { HomeModesSheet } from './HomeModesSheet';
import { MoneyRain } from './MoneyRain';
import { BallionLogo } from './TradeUpLogo';
import { SoundSettings, type SettingsLink } from './SoundSettings';
import { WallOfFameScreen } from './WallOfFameScreen';
import { TickerNumber, money } from './onboarding/ticker';
import { FranchiseMode } from './franchise/FranchiseMode';

/** home-v2/arena.jpg: the backboard top and net bottom, as shares of the photo's height. */
const HOOP_TOP = 0.205;
const HOOP_BOTTOM = 0.303;
/** Where the hoop's middle sits between the header and PLAY (0 = header, 1 = PLAY). */
const HOOP_AT = 0.47;

/** Header pill: whole dollars under $1M, then $12.5M / $500B. Rounds down so $999,999,999 never reads $1000M. */
function pillCash(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v < 1e6) return money(v);
  const [unit, suffix] = v >= 1e9 ? [1e9, 'B'] : [1e6, 'M'];
  const scaled = Math.floor((v / unit) * 100) / 100;
  return `$${scaled.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`;
}

interface TradeUpHomeProps {
  onPlay: () => void;
  onHeadToHead: () => void;
  onOpenRank: () => void;
  /** False while the splash or first-run guide is up, so the account popup waits its turn. */
  allowAccountPrompt?: boolean;
}

/** $1B RUN home — PLAY first, My Franchise second, everything else one tap away. */
export function TradeUpHome({
  onPlay,
  onHeadToHead,
  onOpenRank,
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
  const [modesOpen, setModesOpen] = useState(false);
  const [franchisesOpen, setFranchisesOpen] = useState(false);
  const permanent = accountState.status === 'permanent';

  useEffect(() => {
    if (!permanent && bank != null && readBankPreview() == null) recordLocalInduction(bank);
  }, [bank, permanent]);

  // Franchise arena art, warmed up so the mode opens on a ready background.
  useEffect(() => {
    const id = window.setTimeout(() => {
      new Image().src = '/images/pack/arena-bg.jpg';
      new Image().src = '/images/home-v2/classic.jpg';
      new Image().src = '/images/home-v2/1v1.jpg';
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);

  // The column clears the floating tab bar, whose height and inset vary by device.
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.oneb-tabbar');
    if (!bar) return;
    const root = document.documentElement;
    const apply = () =>
      root.style.setProperty('--home-tabbar-h', `${Math.max(0, Math.round(window.innerHeight - bar.getBoundingClientRect().top))}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    window.addEventListener('resize', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, []);

  // Slide the arena photo so the hoop sits in the open space between the header and PLAY.
  useLayoutEffect(() => {
    const place = () => {
      const frame = document.querySelector<HTMLElement>('.rh2-bg__frame');
      const top = document.querySelector<HTMLElement>('.rh2-top');
      const play = document.querySelector<HTMLElement>('.rh3-play');
      if (!frame || !top || !play) return;
      const height = frame.getBoundingClientRect().height;
      if (!height) return;
      const from = top.getBoundingClientRect().bottom;
      const to = play.getBoundingClientRect().top;
      const hoopMid = from + (to - from) * HOOP_AT;
      const hoopHalf = ((HOOP_BOTTOM - HOOP_TOP) * height) / 2;
      frame.style.top = `${Math.round(hoopMid - hoopHalf - HOOP_TOP * height)}px`;
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

  // Shrink the balance only when a very long figure would not fit the pill.
  const cashRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const pill = cashRef.current;
    if (!pill) return;
    const fit = () => {
      const slot = pill.querySelector<HTMLElement>('.rh3-cash__slot');
      const value = pill.querySelector<HTMLElement>('.rh3-cash__value');
      if (!slot || !value) return;
      // Measure the final figure on a hidden twin: the live node belongs to TickerNumber,
      // and replacing its text would detach the count-up from the screen.
      value.style.removeProperty('font-size');
      const probe = document.createElement('strong');
      probe.className = value.className;
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:0;top:0';
      probe.textContent = pillCash(bank ?? 0);
      slot.appendChild(probe);
      const width = probe.getBoundingClientRect().width;
      if (width > slot.clientWidth + 0.5) {
        const size = parseFloat(getComputedStyle(probe).fontSize);
        value.style.fontSize = `${Math.floor(size * (slot.clientWidth / width) * 10) / 10}px`;
      }
      probe.remove();
    };
    fit();
    void document.fonts?.ready.then(fit);
    const observer = new ResizeObserver(() => fit());
    observer.observe(pill);
    return () => observer.disconnect();
  }, [bank]);

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

  const menuLinks: SettingsLink[] = [
    {
      id: 'account',
      label: t('home.menuAccount'),
      value:
        accountState.status === 'permanent'
          ? accountState.profile.username
          : accountState.status === 'loading'
            ? '…'
            : t('home.menuGuest'),
      onSelect: () => openSheet('menu'),
    },
    { id: 'rank', label: t('home.menuProgress'), value: t('nav.rank'), onSelect: onOpenRank },
    { id: 'wall', label: t('home.menuLegends'), value: t('home.wallOfFame'), onSelect: () => setWallOpen(true) },
  ];

  return (
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub run-home rh2 rh3">
      <div className="rh2-bg" aria-hidden>
        <div className="rh2-bg__frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rh2-bg__photo" src="/images/home-v2/arena.jpg" alt="" decoding="async" />
          <span className="rh3-ribbon rh3-ribbon--left" />
          <span className="rh3-ribbon rh3-ribbon--right" />
        </div>
        <span className="rh2-bg__shade" />
        <span className="rh3-floor-glow" />
        <span className="rh3-arc" />
      </div>
      <MoneyRain calm />

      <div className="rh2-ui">
        <header className="rh2-top">
          <div className="rh2-brand">
            <BallionLogo size="sm" priority className="rh2-logo" />
            <span className="rh3-brand-rule" aria-hidden />
            <p className="rh2-wordmark" aria-label="1B Run">
              1B RUN
            </p>
          </div>
          <div className="rh2-toolbar">
            <div ref={cashRef} className="rh3-cash" role="status" aria-label={`${t('home.bankLabel')}: ${formatCash(bank ?? 0)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="rh3-cash__icon" src="/images/home-v2/money.png" alt="" aria-hidden />
              <span className="rh3-cash__slot">
                <strong className="rh3-cash__value">
                  <TickerNumber value={bank ?? 0} duration={900} format={pillCash} />
                </strong>
              </span>
            </div>
            <SoundSettings variant="gear" links={menuLinks} linksLabel={t('home.menuPlayer')} />
          </div>
        </header>

        <div className="rh3-stage" aria-hidden />

        <nav className="rh3-actions" aria-label={t('home.modesLabel')}>
          <button type="button" className="rh3-play" onClick={go(onPlay)}>
            <span className="rh3-play__icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path
                  fill="currentColor"
                  d="M7.2 4.9c0-1 1.1-1.6 1.9-1.1l11 7.1c.8.5.8 1.7 0 2.2l-11 7.1c-.8.5-1.9-.1-1.9-1.1V4.9Z"
                />
              </svg>
            </span>
            <span className="rh3-play__rule" aria-hidden />
            <span className="rh3-play__label">{t('home.playButton')}</span>
          </button>

          <button
            type="button"
            className="rh3-franchise"
            onClick={go(() => setFranchisesOpen(true))}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="rh3-franchise__icon" src="/images/home-v2/arena-exterior.png" alt="" aria-hidden />
            <span className="rh3-franchise__rule" aria-hidden />
            <span className="rh3-franchise__label">{t('home.myFranchise').toLocaleUpperCase()}</span>
          </button>

          <button type="button" className="rh3-modes" onClick={go(() => setModesOpen(true))}>
            <span className="rh3-modes__icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path d="m12 3.5 8.5 4.3L12 12 3.5 7.8 12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="m3.5 12 8.5 4.2 8.5-4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m3.5 16.2 8.5 4.3 8.5-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="rh3-modes__rule" aria-hidden />
            <span className="rh3-modes__label">{t('home.modes')}</span>
          </button>
        </nav>

        <div className="rh3-foot" aria-hidden />
      </div>

      <HomeModesSheet
        open={modesOpen}
        onClose={() => setModesOpen(false)}
        onClassic={onPlay}
        onHeadToHead={onHeadToHead}
      />

      <AccountProgressPrompt
        open={promptOpen && !sheetOpen}
        onCreateAccount={() => openSheet('signup')}
        onLogIn={() => openSheet('login')}
        onContinueAsGuest={continueAsGuest}
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
