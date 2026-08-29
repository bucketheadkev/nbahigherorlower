'use client';

import { useCallback, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { hostableH2HModes, type H2HGameMode } from '@/lib/multiplayer/gameModes';
import { hapticLight } from '@/lib/tradeup/haptics';

interface H2HModeSelectScreenProps {
  onHostMode: (mode: H2HGameMode) => void;
  onJoin: () => void;
  onBack: () => void;
  authError?: string | null;
  authLoading?: boolean;
}

export function H2HModeSelectScreen({
  onHostMode,
  onJoin,
  onBack,
  authError = null,
  authLoading = false,
}: H2HModeSelectScreenProps) {
  const modes = useMemo(() => hostableH2HModes(), []);

  const press = (fn: () => void, disabled: boolean) => (e: ReactPointerEvent) => {
    e.preventDefault();
    if (disabled) return;
    hapticLight();
    fn();
  };

  const locked = authLoading || Boolean(authError);

  const handleSelect = useCallback(
    (mode: H2HGameMode) => {
      onHostMode(mode);
    },
    [onHostMode],
  );

  return (
    <div className="h2h-modes" aria-label="1V1 mode select">
      <button type="button" className="h2h-modes__back ui-tap" onPointerDown={press(onBack, false)}>
        ← Back
      </button>

      <header className="h2h-modes__header">
        <p className="h2h-modes__eyebrow">1V1</p>
        <h1 className="h2h-modes__title">Classic</h1>
        <p className="h2h-modes__subtitle">Host a game. Friends join free with your room code.</p>
      </header>

      {authLoading ? <p className="h2h-modes__subtitle">Signing in…</p> : null}
      {authError ? (
        <p className="h2h-modes__error" role="alert">
          {authError}
        </p>
      ) : null}

      <div className={`h2h-modes__grid${modes.length === 1 ? ' h2h-modes__grid--solo' : ''}`}>
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`h2h-mode-card ui-tap${mode.free ? ' is-free' : ''}`}
            style={{ ['--mode-accent' as string]: mode.accent }}
            disabled={locked}
            aria-disabled={locked}
            onPointerDown={press(() => handleSelect(mode.id), locked)}
          >
            <div className="h2h-mode-card__top">
              <strong className="h2h-mode-card__title">{mode.title}</strong>
              <span className="h2h-mode-card__price is-free">FREE</span>
            </div>
            <p className="h2h-mode-card__tagline">{mode.tagline}</p>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="run-btn run-btn--secondary h2h-modes__join ui-tap"
        disabled={locked}
        onPointerDown={press(onJoin, locked)}
      >
        <strong>JOIN GAME</strong>
        <span>enter a friend’s room code</span>
      </button>
    </div>
  );
}
