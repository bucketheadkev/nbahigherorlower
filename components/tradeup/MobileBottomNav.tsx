'use client';

import { useCallback, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';
import { hapticLight } from '@/lib/tradeup/haptics';

export type HubTab = 'home' | 'runs' | 'challenges';

interface MobileBottomNavProps {
  active: HubTab;
  onChange: (tab: HubTab) => void;
}

export function MobileBottomNav({ active, onChange }: MobileBottomNavProps) {
  const { playTap, resume } = useSound();
  const { t } = useLocale();

  const go = useCallback(
    (tab: HubTab) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (tab === active) return;
      onChange(tab);
      queueMicrotask(() => {
        resume();
        playTap();
        hapticLight();
      });
    },
    [active, onChange, playTap, resume],
  );

  return (
    <nav className="oneb-tabbar" aria-label={t('nav.main')}>
      <button
        type="button"
        className={`oneb-tabbar__item ui-tap${active === 'runs' ? ' is-active' : ''}`}
        aria-current={active === 'runs' ? 'page' : undefined}
        onPointerDown={go('runs')}
      >
        <span className="oneb-tabbar__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path
              d="M5 7.5h14M5 12h14M5 16.5h9"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="18.5" cy="16.5" r="1.6" fill="currentColor" />
          </svg>
        </span>
        <span className="oneb-tabbar__label">{t('nav.myRuns')}</span>
      </button>

      <button
        type="button"
        className={`oneb-tabbar__item ui-tap${active === 'home' ? ' is-active is-play' : ''}`}
        aria-current={active === 'home' ? 'page' : undefined}
        aria-label={t('nav.play')}
        onPointerDown={go('home')}
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
        className={`oneb-tabbar__item ui-tap${active === 'challenges' ? ' is-active' : ''}`}
        aria-current={active === 'challenges' ? 'page' : undefined}
        onPointerDown={go('challenges')}
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
    </nav>
  );
}
