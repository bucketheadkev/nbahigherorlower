'use client';

import type { ReactNode } from 'react';

interface H2HLobbyShellProps {
  children: ReactNode;
  className?: string;
  ariaLabel: string;
  onBack?: () => void;
  backDisabled?: boolean;
  backLabel?: string;
}

/** Quiet full-screen shell for pre-gameplay 1v1 — matches settings guides. */
export function H2HLobbyShell({
  children,
  className = '',
  ariaLabel,
  onBack,
  backDisabled = false,
  backLabel = 'Back',
}: H2HLobbyShellProps) {
  return (
    <div
      className={`h2h-lobby h2h-lobby--guide${className ? ` ${className}` : ''}`}
      aria-label={ariaLabel}
    >
      {onBack ? (
        <button
          type="button"
          className="h2h-lobby__back ui-tap"
          disabled={backDisabled}
          onClick={onBack}
        >
          ← {backLabel}
        </button>
      ) : null}
      {children}
    </div>
  );
}

interface H2HLoadingScreenProps {
  status: string;
  onBack?: () => void;
}

/** Connecting state — typographic 1v1 mark, no image. */
export function H2HLoadingScreen({ status, onBack }: H2HLoadingScreenProps) {
  return (
    <H2HLobbyShell
      className="h2h-lobby--loading"
      ariaLabel="1v1"
      onBack={onBack}
    >
      <div className="h2h-lobby__loading-center">
        <p className="h2h-lobby__kicker">HEAD TO HEAD</p>
        <h1 className="h2h-lobby__wordmark">1v1</h1>
        <p className="h2h-lobby__status" role="status">
          {status}
        </p>
      </div>
    </H2HLobbyShell>
  );
}

interface H2HDisconnectNoticeProps {
  onContinue: () => void;
}

/** Full-screen notice when the other player leaves mid-session. */
export function H2HDisconnectNotice({ onContinue }: H2HDisconnectNoticeProps) {
  return (
    <div className="h2h-disconnect" role="alertdialog" aria-labelledby="h2h-disconnect-title" aria-describedby="h2h-disconnect-body">
      <div className="h2h-disconnect__card">
        <p className="h2h-disconnect__kicker">1V1</p>
        <h1 id="h2h-disconnect-title" className="h2h-disconnect__title">
          Opponent disconnected
        </h1>
        <p id="h2h-disconnect-body" className="h2h-disconnect__body">
          Create or join a lobby to get started.
        </p>
        <button type="button" className="h2h-lobby__primary ui-tap" onClick={onContinue}>
          Back to 1v1
        </button>
      </div>
    </div>
  );
}
