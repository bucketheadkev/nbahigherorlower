'use client';

import { useSound } from '@/hooks/useSound';
import { hapticLight } from '@/lib/tradeup/haptics';

export type HubTab = 'home' | 'runs' | 'challenges';

interface MobileBottomNavProps {
  active: HubTab;
  onChange: (tab: HubTab) => void;
}

export function MobileBottomNav({ active, onChange }: MobileBottomNavProps) {
  const { playTap, resume } = useSound();

  const go = (tab: HubTab) => {
    resume();
    playTap();
    hapticLight();
    onChange(tab);
  };

  return (
    <nav className="oneb-tabbar" aria-label="Main">
      <button
        type="button"
        className={`oneb-tabbar__item${active === 'runs' ? ' is-active' : ''}`}
        aria-current={active === 'runs' ? 'page' : undefined}
        onClick={() => go('runs')}
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
        <span className="oneb-tabbar__label">My Runs</span>
      </button>

      <button
        type="button"
        className={`oneb-tabbar__item${active === 'home' ? ' is-active is-play' : ''}`}
        aria-current={active === 'home' ? 'page' : undefined}
        aria-label="Play"
        onClick={() => go('home')}
      >
        <span className="oneb-tabbar__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M8.4 6.2v11.6L18.2 12 8.4 6.2z" />
          </svg>
        </span>
        <span className="oneb-tabbar__label">Play</span>
      </button>

      <button
        type="button"
        className={`oneb-tabbar__item${active === 'challenges' ? ' is-active' : ''}`}
        aria-current={active === 'challenges' ? 'page' : undefined}
        onClick={() => go('challenges')}
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
        <span className="oneb-tabbar__label">Challenges</span>
      </button>
    </nav>
  );
}
