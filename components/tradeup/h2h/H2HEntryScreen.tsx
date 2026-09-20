'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { hapticLight } from '@/lib/tradeup/haptics';
import { H2HLobbyShell } from './H2HLobbyChrome';

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
    <H2HLobbyShell className="h2h-lobby--entry" ariaLabel="1v1 entry" onBack={onBack}>
      <header className="h2h-lobby__titles">
        <p className="h2h-lobby__kicker">HEAD TO HEAD</p>
        <h1 className="h2h-lobby__wordmark">1v1</h1>
        <p className="h2h-lobby__tagline">Draft against a friend. Highest roster wins.</p>
      </header>

      {authError ? (
        <p className="h2h-lobby__error" role="alert">
          {authError}
        </p>
      ) : null}

      <div className="h2h-lobby__actions">
        <button
          type="button"
          className="h2h-lobby__action ui-tap"
          disabled={locked}
          onPointerDown={press(onCreate, locked)}
        >
          <strong>Create lobby</strong>
          <span>Host a room and share the code</span>
        </button>
        <button
          type="button"
          className="h2h-lobby__action ui-tap"
          disabled={locked}
          onPointerDown={press(onJoin, locked)}
        >
          <strong>Join lobby</strong>
          <span>Enter a friend’s room code</span>
        </button>
      </div>
    </H2HLobbyShell>
  );
}
