'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { MessageKey } from '@/lib/i18n/messages';
import { isNativeApp } from '@/lib/platform/isNativeApp';
import { playUiTapSound } from '@/lib/tradeup/gameAudio';
import { hapticLight } from '@/lib/tradeup/haptics';

/** Official hub nav: Leaderboard · Home · Shop. */
export type HubTab = 'home' | 'board' | 'shop' | 'rank' | 'runs' | 'challenges';

interface MobileBottomNavProps {
  active: HubTab;
  onChange: (tab: HubTab) => void;
}

const TABS: { id: HubTab; label: MessageKey; icon: ReactNode }[] = [
  {
    id: 'board',
    label: 'nav.leaderboard',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
        <rect x="4" y="13.5" width="4" height="6.5" rx="1" />
        <rect x="10" y="9.5" width="4" height="10.5" rx="1" />
        <rect x="16" y="5" width="4" height="15" rx="1" />
      </svg>
    ),
  },
  {
    id: 'home',
    label: 'nav.home',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
        <path d="M4.2 11.2 12 4.6l7.8 6.6v8.2a1.2 1.2 0 0 1-1.2 1.2h-4.1v-5.1h-5v5.1H5.4a1.2 1.2 0 0 1-1.2-1.2v-8.2Z" />
      </svg>
    ),
  },
  {
    id: 'shop',
    label: 'nav.shop',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
        <path
          d="M3.2 5.2h2.1l.55 2.2h13.4l-1.55 7.4H7.35L5.9 7.4"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9.1" cy="17.8" r="1.45" fill="currentColor" />
        <circle cx="16.2" cy="17.8" r="1.45" fill="currentColor" />
      </svg>
    ),
  },
];

const TAB_INDEX: Partial<Record<HubTab, number>> = {
  board: 0,
  home: 1,
  shop: 2,
};

/**
 * Hub bottom nav.
 * - Web: floating midnight pill
 * - iOS: flush bar + sliding orange glider; optimistic local select for zero lag
 */
export function MobileBottomNav({ active, onChange }: MobileBottomNavProps) {
  const { t } = useLocale();
  const native = isNativeApp();
  /** Ignore the synthetic click that follows an already-handled pointerdown. */
  const handledAt = useRef(0);
  /** Instant highlight / glider — updates before hub content catches up. */
  const [visual, setVisual] = useState(active);

  useEffect(() => {
    setVisual(active);
  }, [active]);

  const activate = useCallback(
    (tab: HubTab) => {
      if (tab === visual) return;
      // Sound + optimistic glider first; defer hub pane swap so Shop paint
      // never eats the tap gesture (silent / delayed Shop opens).
      playUiTapSound();
      hapticLight();
      setVisual(tab);
      requestAnimationFrame(() => onChange(tab));
    },
    [visual, onChange],
  );

  const onPointerDown = useCallback(
    (tab: HubTab) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      if (!native && e.pointerType === 'mouse') return;
      handledAt.current = performance.now();
      activate(tab);
    },
    [activate, native],
  );

  const onClick = useCallback(
    (tab: HubTab) => () => {
      if (performance.now() - handledAt.current < 450) return;
      activate(tab);
    },
    [activate],
  );

  const tabIndex = TAB_INDEX[visual] ?? 1;

  return (
    <nav
      className={`oneb-tabbar oneb-tabbar--tri ${native ? 'oneb-tabbar--ios' : 'oneb-tabbar--pill'}`}
      aria-label={t('nav.main')}
      style={{ ['--tab-index' as string]: tabIndex } as CSSProperties}
    >
      {native ? <span className="oneb-tabbar__glider" aria-hidden /> : null}
      {TABS.map((tab) => {
        const on = tab.id === visual;
        return (
          <button
            key={tab.id}
            type="button"
            className={`oneb-tabbar__item oneb-tabbar__item--${tab.id}${on ? ' is-active' : ''}`}
            aria-current={on ? 'page' : undefined}
            aria-label={t(tab.label)}
            onPointerDown={onPointerDown(tab.id)}
            onClick={onClick(tab.id)}
          >
            <span className="oneb-tabbar__icon" aria-hidden>
              {tab.icon}
            </span>
            <span className="oneb-tabbar__label">{t(tab.label)}</span>
          </button>
        );
      })}
    </nav>
  );
}
