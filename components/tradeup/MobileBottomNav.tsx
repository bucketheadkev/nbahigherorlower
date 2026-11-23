'use client';

import { useCallback, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useLocale } from '@/hooks/useLocale';
import type { MessageKey } from '@/lib/i18n/messages';
import { hapticLight } from '@/lib/tradeup/haptics';

/** Official hub nav: Leaderboard · Play · Shop. */
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
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
        <path d="M8 5.6c0-.8.9-1.3 1.6-.9l9.3 6.4c.6.4.6 1.3 0 1.7l-9.3 6.4c-.7.5-1.6 0-1.6-.9V5.6Z" />
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

export function MobileBottomNav({ active, onChange }: MobileBottomNavProps) {
  const { t } = useLocale();
  const index = TABS.findIndex((tab) => tab.id === active);

  const go = useCallback(
    (tab: HubTab) => (e: ReactMouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (tab === active) return;
      // Nav is paint-only — never unlock/preload audio here (website Shop hitch).
      onChange(tab);
      hapticLight();
    },
    [active, onChange],
  );

  return (
    <nav
      className={`oneb-tabbar oneb-tabbar--tri${index < 0 ? ' is-idle' : ''}`}
      aria-label={t('nav.main')}
      style={{ '--tab-index': Math.max(0, index) } as CSSProperties}
    >
      <span className="oneb-tabbar__glider" aria-hidden />
      {TABS.map((tab) => {
        const on = tab.id === active;
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
            {/* Raised center Play is icon-only in the reference; keep labels for side tabs. */}
            {tab.id === 'home' ? null : (
              <span className="oneb-tabbar__label">{t(tab.label)}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
