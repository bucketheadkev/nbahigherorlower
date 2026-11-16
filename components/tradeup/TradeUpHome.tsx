'use client';

import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useAchievementCloudSync } from '@/hooks/useAchievementCloudSync';
import { useBankBalance } from '@/hooks/useBankBalance';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';
import { useXpProfile } from '@/hooks/useXpProfile';
import {
  hasSeenAccountPrompt,
  markAccountPromptSeen,
  resetAccountPromptSeen,
} from '@/lib/account/accountPromptStorage';
import { readBankPreview } from '@/lib/tradeup/bank';
import { recordLocalInduction } from '@/lib/tradeup/wallOfFame';
import { preloadClassicArena } from '@/lib/tradeup/classicArenaAssets';
import { hapticLight } from '@/lib/tradeup/haptics';
import {
  AccountAuthSheet,
  type AccountSheetView,
} from './AccountAuthSheet';
import { AccountProgressPrompt } from './AccountProgressPrompt';
import { HomeModesSheet } from './HomeModesSheet';
import { HomeCoinChip } from './home/HomeCoinChip';
import { HomeJerseyStage } from './home/HomeJerseyStage';
import { HomePlayButton } from './home/HomePlayButton';
import { HomeProfileMark } from './home/HomeProfileMark';
import { HomeXpModule } from './home/HomeXpModule';
import { SoundSettings, type SettingsLink } from './SoundSettings';
import { WallOfFameScreen } from './WallOfFameScreen';

interface TradeUpHomeProps {
  onPlay: () => void;
  onHeadToHead: () => void;
  onOpenRank: () => void;
  onOpenShop?: () => void;
  /** False while the splash or first-run guide is up, so the account popup waits its turn. */
  allowAccountPrompt?: boolean;
}

/**
 * Official 5-jersey home — fidelity to the approved reference composition.
 * PLAY / MODES / profile / coin+ / menu are live; jersey stage is art.
 */
export function TradeUpHome({
  onPlay,
  onHeadToHead,
  onOpenRank,
  onOpenShop,
  allowAccountPrompt = true,
}: TradeUpHomeProps) {
  const { resume } = useSound();
  const { t } = useLocale();
  const { state: accountState, setState: setAccountState } = useAccountAuth();
  useAchievementCloudSync(accountState);
  const bank = useBankBalance(accountState.status === 'permanent');
  const { progress, coins } = useXpProfile();
  const [promptOpen, setPromptOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<AccountSheetView>('menu');
  const [wallOpen, setWallOpen] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);
  const permanent = accountState.status === 'permanent';
  const navLockRef = useRef(false);

  useEffect(() => {
    if (!permanent && bank != null && readBankPreview() == null) recordLocalInduction(bank);
  }, [bank, permanent]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      preloadClassicArena();
    }, 1500);
    return () => window.clearTimeout(id);
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
    <div className="tradeup-shell tradeup-shell--home tradeup-shell--hub run-home home-screen home-screen--official">
      <div className="home-scene" aria-hidden>
        <div className="home-scene__arena" />
        <div className="home-scene__lights" />
        <div className="home-scene__floor" />
        <div className="home-scene__veil" />
      </div>

      <div className="home-ui home-ui--official">
        <header className="home-top home-top--official">
          <HomeProfileMark
            label={t('home.profileLabel')}
            onClick={go(() => openSheet(permanent ? 'menu' : 'signup'))}
          />
          <div className="home-top__end">
            <HomeCoinChip
              value={coins}
              label={t('home.coinsLabel')}
              plusLabel={t('home.coinPlus')}
              onPlus={onOpenShop ? go(onOpenShop) : undefined}
            />
            <div className="home-top__menu">
              <SoundSettings variant="gear" links={menuLinks} linksLabel={t('home.menuPlayer')} />
            </div>
          </div>
        </header>

        <div className="home-hero">
          <h1 className="home-title">
            <span className="home-title__line">{t('home.draftA')}</span>
            <span className="home-title__line">
              <em className="home-title__billion">{t('home.oneBillion')}</em>{' '}
              <span>{t('home.teamWord')}</span>
            </span>
          </h1>

          <HomeJerseyStage />

          <HomeXpModule progress={progress} />
        </div>

        <div className="home-cta home-cta--official">
          <HomePlayButton label={t('home.playButton')} onClick={go(onPlay)} />
          <button type="button" className="home-modes-btn ui-tap" onClick={go(() => setModesOpen(true))}>
            {t('home.modesButton')}
          </button>
        </div>
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
