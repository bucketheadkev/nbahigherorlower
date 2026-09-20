'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AccountAuthState } from '@/lib/account/accountAuth';
import { hapticTap } from '@/lib/tradeup/haptics';

interface HomeAccountEntryProps {
  state: AccountAuthState;
  onOpen: () => void;
}

/** Compact home toolbar chip — Guest or signed-in username. */
export function HomeAccountEntry({ state, onOpen }: HomeAccountEntryProps) {
  const press = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    hapticTap();
    onOpen();
  };

  const label =
    state.status === 'permanent'
      ? state.profile.username
      : state.status === 'loading'
        ? '…'
        : 'Guest';

  const aria =
    state.status === 'permanent'
      ? `Account: ${state.profile.username}`
      : 'Account — Guest';

  return (
    <button
      type="button"
      className={`home-account-chip${state.status === 'permanent' ? ' is-signed-in' : ''}`}
      aria-label={aria}
      title={aria}
      onPointerDown={press}
    >
      <span className="home-account-chip__icon" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M5.5 19.2c1.4-3.1 3.7-4.6 6.5-4.6s5.1 1.5 6.5 4.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="home-account-chip__label">{label}</span>
    </button>
  );
}
