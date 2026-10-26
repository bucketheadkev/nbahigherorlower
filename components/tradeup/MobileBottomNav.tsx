'use client';

import { startTransition, useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';
import { hapticLight } from '@/lib/tradeup/haptics';

export type HubTab = 'home' | 'runs' | 'board' | 'challenges' | 'rank';

interface MobileBottomNavProps {
  active: HubTab;
  onChange: (tab: HubTab) => void;
}

export function MobileBottomNav({ active, onChange }: MobileBottomNavProps) {
  const { playTap, resume } = useSound();
  const { t } = useLocale();

  /** The tapped tab lights up on this frame; the screen swap renders right after as a transition. */
  const [pending, setPending] = useState<HubTab | null>(null);
  useEffect(() => setPending(null), [active]);
  const current = pending ?? active;

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
    <nav className="oneb-tabbar" aria-label={t('nav.main')}>
      <button
        type="button"
        className={`oneb-tabbar__item oneb-tabbar__item--runs ui-tap${current === 'runs' ? ' is-active' : ''}`}
        aria-current={current === 'runs' ? 'page' : undefined}
        onClick={go('runs')}
      >
        <span className="oneb-tabbar__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path d="M9 6.5h11M9 12h11M9 17.5h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="4.5" cy="6.5" r="1.6" fill="currentColor" />
            <circle cx="4.5" cy="12" r="1.6" fill="currentColor" />
            <circle cx="4.5" cy="17.5" r="1.6" fill="currentColor" />
          </svg>
        </span>
        <span className="oneb-tabbar__label">{t('nav.myRuns')}</span>
      </button>

      <button
        type="button"
        className={`oneb-tabbar__item oneb-tabbar__item--board ui-tap${current === 'board' ? ' is-active' : ''}`}
        aria-current={current === 'board' ? 'page' : undefined}
        onClick={go('board')}
      >
        <span className="oneb-tabbar__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <rect x="4" y="13.5" width="4" height="6.5" rx="1" />
            <rect x="10" y="9.5" width="4" height="10.5" rx="1" />
            <rect x="16" y="5" width="4" height="15" rx="1" />
          </svg>
        </span>
        <span className="oneb-tabbar__label">{t('nav.leaderboard')}</span>
      </button>

      <button
        type="button"
        className={`oneb-tabbar__item ui-tap${current === 'home' ? ' is-active is-play' : ''}`}
        aria-current={current === 'home' ? 'page' : undefined}
        aria-label={t('nav.play')}
        onClick={go('home')}
      >
        <span className="oneb-tabbar__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M8.4 6.2v11.6L18.2 12 8.4 6.2z" />
          </svg>
        </span>
        <span className="oneb-tabbar__label">{t('nav.play')}</span>
      </button>

      <button
        type="button"
        className={`oneb-tabbar__item oneb-tabbar__item--challenges ui-tap${current === 'challenges' ? ' is-active' : ''}`}
        aria-current={current === 'challenges' ? 'page' : undefined}
        onClick={go('challenges')}
      >
        <span className="oneb-tabbar__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path
              d="M12 3.8l2.1 4.3 4.7.7-3.4 3.3.8 4.7L12 14.6 7.8 16.8l.8-4.7-3.4-3.3 4.7-.7L12 3.8z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="oneb-tabbar__label">{t('nav.challenges')}</span>
      </button>

      <button
        type="button"
        className={`oneb-tabbar__item oneb-tabbar__item--rank ui-tap${current === 'rank' ? ' is-active' : ''}`}
        aria-current={current === 'rank' ? 'page' : undefined}
        onClick={go('rank')}
      >
        <span className="oneb-tabbar__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path
              d="M12 3.2 19 5.9v5.5c0 4.2-3 7-7 8.4-4-1.4-7-4.2-7-8.4V5.9l7-2.7Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M8.6 13.4 12 11.2l3.4 2.2M8.6 10.1 12 7.9l3.4 2.2"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="oneb-tabbar__label">{t('nav.rank')}</span>
      </button>
    </nav>
  );
}
