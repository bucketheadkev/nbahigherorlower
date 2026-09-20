'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { hapticTap } from '@/lib/tradeup/haptics';

interface AccountProgressPromptProps {
  open: boolean;
  onCreateAccount: () => void;
  onLogIn: () => void;
  onContinueAsGuest: () => void;
}

/** First-run home overlay — optional account, never a hard wall. */
export function AccountProgressPrompt({
  open,
  onCreateAccount,
  onLogIn,
  onContinueAsGuest,
}: AccountProgressPromptProps) {
  if (!open) return null;

  const press =
    (fn: () => void) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      hapticTap();
      fn();
    };

  return (
    <div
      className="settings-name-modal account-progress-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-progress-title"
      aria-describedby="account-progress-desc"
    >
      <div
        className="settings-ctrl settings-name-modal__scrim account-progress-prompt__scrim"
        aria-hidden
      />
      <div className="settings-name-modal__card account-progress-prompt__card">
        <h3
          id="account-progress-title"
          className="settings-name-modal__title account-progress-prompt__title"
        >
          Save your progress
        </h3>
        <p id="account-progress-desc" className="settings-name-modal__copy account-progress-prompt__copy">
          Create an account to save your achievements, runs, and compete on the leaderboard.
        </p>
        <div className="account-sheet__stack account-progress-prompt__actions">
          <button
            type="button"
            className="settings-ctrl settings-name-modal__save account-sheet__full account-progress-prompt__primary"
            onPointerDown={press(onCreateAccount)}
          >
            Create Account
          </button>
          <button
            type="button"
            className="settings-ctrl settings-name-modal__cancel account-sheet__full account-progress-prompt__secondary"
            onPointerDown={press(onLogIn)}
          >
            Log In
          </button>
          <div className="account-progress-prompt__guest-block">
            <button
              type="button"
              className="settings-ctrl account-progress-prompt__guest"
              onPointerDown={press(onContinueAsGuest)}
            >
              Continue as Guest →
            </button>
            <p className="account-progress-prompt__footnote">
              Progress stays on this device.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
