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
    <div className="h2h-lobby h2h-lobby--entry" aria-label="1V1 entry">
      <button type="button" className="h2h-lobby__back" onPointerDown={press(onBack, false)}>
        ← Back
      </button>

      <div className="h2h-lobby__entry-center">
        <header className="h2h-lobby__header">
          <h1 className="h2h-lobby__title">1v1</h1>
        </header>

        {authLoading ? <p className="h2h-lobby__status">…</p> : null}
        {authError ? <p className="h2h-lobby__error" role="alert">{authError}</p> : null}

        <div className="h2h-lobby__actions">
          <button
            type="button"
            className="run-btn run-btn--primary h2h-lobby__mode-btn ui-tap"
            disabled={locked}
            onPointerDown={press(onCreate, locked)}
          >
            <strong>Create lobby</strong>
          </button>

          <button
            type="button"
            className="run-btn run-btn--secondary h2h-lobby__mode-btn ui-tap"
            disabled={locked}
            onPointerDown={press(onJoin, locked)}
          >
            <strong>Join lobby</strong>
          </button>
        </div>
      </div>
    </div>
  );
}
