'use client';

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { useLocale } from '@/hooks/useLocale';
import { playUiTapSound, warmUiTapSound } from '@/lib/tradeup/gameAudio';
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
  const handledAt = useRef(0);

  useEffect(() => {
    warmUiTapSound();
  }, []);

  const username = permanent
    ? accountState.profile.username
    : accountState.status === 'loading'
      ? '…'
      : 'Guest';

  const fire = (fn: () => void) => {
    if (lockRef.current) return;
    lockRef.current = true;
    try {
      playUiTapSound();
      hapticLight();
      // Defer navigation paint so the tap sound always starts in-gesture.
      requestAnimationFrame(() => fn());
    } finally {
      window.setTimeout(() => {
        lockRef.current = false;
      }, 220);
    }
  };

  const go = (fn: () => void) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    if (performance.now() - handledAt.current < 450) return;
    fire(fn);
  };

  const goPointer = (fn: () => void) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    handledAt.current = performance.now();
    fire(fn);
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
        onProfilePointerDown={goPointer(() => openSheet(permanent ? 'menu' : 'signup'))}
        onCoinPlus={onOpenShop ? go(onOpenShop) : undefined}
        onCoinPlusPointerDown={onOpenShop ? goPointer(onOpenShop) : undefined}
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
