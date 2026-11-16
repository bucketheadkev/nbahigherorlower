'use client';

import { startTransition, useCallback, useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';
import type { MessageKey } from '@/lib/i18n/messages';
import { hapticLight } from '@/lib/tradeup/haptics';

/** Official home nav: Leaderboard · Play · Shop. `rank` stays menu-only (no tab). */
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
    label: 'nav.play',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 3.8c2.2 2.4 3.4 5.2 3.4 8.2S14.2 17.8 12 20.2M12 3.8C9.8 6.2 8.6 9 8.6 12s1.2 5.8 3.4 8.2M4.2 12h15.6M5.4 8.2h13.2M5.4 15.8h13.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'shop',
    label: 'nav.shop',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
        <path
          d="M7 8.2V7a5 5 0 0 1 10 0v1.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6.2 8.2h11.6l-.7 11.2a1.8 1.8 0 0 1-1.8 1.6H8.7a1.8 1.8 0 0 1-1.8-1.6L6.2 8.2Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function MobileBottomNav({ active, onChange }: MobileBottomNavProps) {
  const { playTap, resume } = useSound();
  const { t } = useLocale();

  const [pending, setPending] = useState<HubTab | null>(null);
  useEffect(() => setPending(null), [active]);
  const current = pending ?? active;
  const index = TABS.findIndex((tab) => tab.id === current);

  const go = useCallback(
    (tab: HubTab) => (e: ReactMouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (tab === current) return;
      hapticLight();
      resume();
      playTap();
      setPending(tab);
      startTransition(() => onChange(tab));
    },
    [current, onChange, playTap, resume],
  );

  return (
    <nav
      className={`oneb-tabbar oneb-tabbar--tri${index < 0 ? ' is-idle' : ''}`}
      aria-label={t('nav.main')}
      style={{ '--tab-index': Math.max(0, index) } as CSSProperties}
    >
      <span className="oneb-tabbar__glider" aria-hidden />
      {TABS.map((tab) => {
        const on = tab.id === current;
        return (
          <button
            key={tab.id}
            type="button"
            className={`oneb-tabbar__item oneb-tabbar__item--${tab.id} ui-tap${on ? ' is-active' : ''}`}
            aria-current={on ? 'page' : undefined}
            onClick={go(tab.id)}
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
