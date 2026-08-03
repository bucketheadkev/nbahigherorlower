'use client';

import { useSound } from '@/hooks/useSound';

export type HubTab = 'home' | 'challenges' | 'leaderboard';

interface MobileBottomNavProps {
  active: HubTab;
  onChange: (tab: HubTab) => void;
}

export function MobileBottomNav({ active, onChange }: MobileBottomNavProps) {
  const { playTap, resume } = useSound();

  const go = (tab: HubTab) => {
    resume();
    playTap();
    onChange(tab);
  };

  return (
    <nav className="mobile-tab-bar mobile-tab-bar--trio" aria-label="Main">
      <button
        type="button"
        className={`mobile-tab-bar__item${active === 'home' ? ' is-active' : ''}`}
        aria-current={active === 'home' ? 'page' : undefined}
        onClick={() => go('home')}
      >
        <span className="mobile-tab-bar__icon" aria-hidden>
          ⌂
        </span>
        <span className="mobile-tab-bar__label">Home</span>
      </button>

      <button
        type="button"
        className={`mobile-tab-bar__item${active === 'leaderboard' ? ' is-active' : ''}`}
        aria-current={active === 'leaderboard' ? 'page' : undefined}
        onClick={() => go('leaderboard')}
      >
        <span className="mobile-tab-bar__icon" aria-hidden>
          ▲
        </span>
        <span className="mobile-tab-bar__label">Leaderboard</span>
      </button>

      <button
        type="button"
        className={`mobile-tab-bar__item${active === 'challenges' ? ' is-active' : ''}`}
        aria-current={active === 'challenges' ? 'page' : undefined}
        onClick={() => go('challenges')}
      >
        <span className="mobile-tab-bar__icon" aria-hidden>
          ★
        </span>
        <span className="mobile-tab-bar__label">Challenges</span>
      </button>
    </nav>
  );
}
