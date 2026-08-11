'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { hapticLight } from '@/lib/tradeup/haptics';

interface H2HEntryScreenProps {
  onCreate: () => void;
  onJoin: () => void;
  onBack: () => void;
  authError?: string | null;
  authLoading?: boolean;
}

export function H2HEntryScreen({
  onCreate,
  onJoin,
  onBack,
  authError = null,
  authLoading = false,
}: H2HEntryScreenProps) {
  const press = (fn: () => void, disabled: boolean) => (e: ReactPointerEvent) => {
    e.preventDefault();
    if (disabled) return;
    hapticLight();
    fn();
  };

  const locked = authLoading || Boolean(authError);

  return (
    <div className="h2h-lobby" aria-label="1V1 entry">
      <button type="button" className="h2h-lobby__back" onPointerDown={press(onBack, false)}>
        ← Back
      </button>

      <header className="h2h-lobby__header">
        <p className="h2h-lobby__eyebrow">1V1</p>
        <h1 className="h2h-lobby__title">Private Match</h1>
        <p className="h2h-lobby__subtitle">Create a lobby or join a friend with a room code.</p>
      </header>

      {authLoading ? <p className="h2h-lobby__status">Signing in…</p> : null}
      {authError ? <p className="h2h-lobby__error" role="alert">{authError}</p> : null}

      <div className="h2h-lobby__actions">
        <button
          type="button"
          className="run-btn run-btn--primary h2h-lobby__mode-btn"
          disabled={locked}
          onPointerDown={press(onCreate, locked)}
        >
          <strong>CREATE LOBBY</strong>
          <span>Host a private room and invite a friend</span>
        </button>

        <button
          type="button"
          className="run-btn run-btn--secondary h2h-lobby__mode-btn"
          disabled={locked}
          onPointerDown={press(onJoin, locked)}
        >
          <strong>JOIN LOBBY</strong>
          <span>Enter a six-character room code</span>
        </button>
      </div>
    </div>
  );
}
