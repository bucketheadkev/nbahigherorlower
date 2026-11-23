'use client';

import { type MouseEvent as ReactMouseEvent, useRef, useState } from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import { hapticLight } from '@/lib/tradeup/haptics';
import { AccountAuthSheet, type AccountSheetView } from '../AccountAuthSheet';
import type { SettingsLink } from '../SoundSettings';
import { HomeHubTopChrome } from './HomeHubTopChrome';

interface HomeHubChromeHostProps {
  onOpenShop?: () => void;
}

/** Sticky top chrome for Leaderboard / Shop — matches Play exactly. */
export function HomeHubChromeHost({ onOpenShop }: HomeHubChromeHostProps) {
  const { t } = useLocale();
  const { state: accountState, setState: setAccountState } = useAccountAuth();
  const permanent = accountState.status === 'permanent';
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<AccountSheetView>('menu');
  const lockRef = useRef(false);

  const username = permanent
    ? accountState.profile.username
    : accountState.status === 'loading'
      ? '…'
      : 'Guest';

  const go = (fn: () => void) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    if (lockRef.current) return;
    lockRef.current = true;
    try {
      // Paint navigation only — no audio unlock/preload (website Coins hitch).
      fn();
      hapticLight();
    } finally {
      window.setTimeout(() => {
        lockRef.current = false;
      }, 800);
    }
  };

  const openSheet = (view: AccountSheetView) => {
    setSheetView(view);
    setSheetOpen(true);
  };

  const menuLinks: SettingsLink[] = [
    {
      id: 'account',
      label: t('home.menuAccount'),
      value: username,
      onSelect: () => openSheet('menu'),
    },
  ];

  return (
    <>
      <HomeHubTopChrome
        profileLabel={t('home.profileLabel')}
        username={username}
        coinsLabel={t('home.coinsLabel')}
        coinPlusLabel={t('home.coinPlus')}
        menuLinks={menuLinks}
        menuLinksLabel={t('home.menuPlayer')}
        onProfile={go(() => openSheet(permanent ? 'menu' : 'signup'))}
        onCoinPlus={onOpenShop ? go(onOpenShop) : undefined}
      />
      <AccountAuthSheet
        open={sheetOpen}
        initialView={sheetView}
        state={accountState}
        onStateChange={setAccountState}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
