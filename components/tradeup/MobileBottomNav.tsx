'use client';

import { startTransition, useCallback, useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';
import type { MessageKey } from '@/lib/i18n/messages';
import { hapticLight } from '@/lib/tradeup/haptics';

/** `rank` has no tab of its own (it opens from the home menu), so no tab lights up there. */
export type HubTab = 'home' | 'runs' | 'board' | 'challenges' | 'rank';

interface MobileBottomNavProps {
  active: HubTab;
  onChange: (tab: HubTab) => void;
}

const TABS: { id: HubTab; label: MessageKey; icon: ReactNode }[] = [
  {
    id: 'runs',
    label: 'nav.myRuns',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <path d="M9 6.5h11M9 12h11M9 17.5h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="4.5" cy="6.5" r="1.6" fill="currentColor" />
        <circle cx="4.5" cy="12" r="1.6" fill="currentColor" />
        <circle cx="4.5" cy="17.5" r="1.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'board',
    label: 'nav.leaderboard',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
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
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M8 5.6c0-.8.9-1.3 1.6-.9l9.3 6.4c.6.4.6 1.3 0 1.7l-9.3 6.4c-.7.5-1.6 0-1.6-.9V5.6Z" />
      </svg>
    ),
  },
  {
    id: 'challenges',
    label: 'nav.challenges',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <path
          d="M7.5 4h9v4.6a4.5 4.5 0 0 1-9 0V4Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M7.5 6H4.8v1.3A3 3 0 0 0 7.8 10.3M16.5 6h2.7v1.3a3 3 0 0 1-3 3M12 13.1v3.4M8.6 20h6.8M9.6 20l.6-3.5h3.6l.6 3.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="m12 5.6.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2.7-1.4Z" fill="currentColor" />
      </svg>
    ),
  },
];

export function MobileBottomNav({ active, onChange }: MobileBottomNavProps) {
  const { playTap, resume } = useSound();
  const { t } = useLocale();

  /** The tapped tab lights up on this frame; the screen swap renders right after as a transition. */
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
      className={`oneb-tabbar${index < 0 ? ' is-idle' : ''}`}
      aria-label={t('nav.main')}
      style={{ '--tab-index': Math.max(0, index) } as CSSProperties}
    >
      <span className="oneb-tabbar__divider" aria-hidden />
      <span className="oneb-tabbar__divider" aria-hidden />
      <span className="oneb-tabbar__divider" aria-hidden />
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
