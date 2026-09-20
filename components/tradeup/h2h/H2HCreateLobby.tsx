'use client';

import { type FormEvent, useState } from 'react';
import { createRoom } from '@/lib/multiplayer/rooms';
import { MultiplayerApiError } from '@/lib/multiplayer/types';
import type { H2HGameMode } from '@/lib/multiplayer/gameModes';
import {
  getH2HUsername,
  isValidH2HUsername,
  sanitizeH2HUsername,
  setH2HUsername,
} from '@/lib/tradeup/h2hUsername';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';
import { H2HLobbyShell } from './H2HLobbyChrome';

interface H2HCreateLobbyProps {
  gameMode: H2HGameMode;
  onCreated: (roomId: string, roomCode: string, gameMode: H2HGameMode) => void;
  onBack: () => void;
}

export function H2HCreateLobby({ gameMode, onCreated, onBack }: H2HCreateLobbyProps) {
  const [displayName, setDisplayName] = useState(() => getH2HUsername() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleBack = () => {
    if (busy) return;
    hapticLight();
    onBack();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const name = sanitizeH2HUsername(displayName);
    if (!isValidH2HUsername(name)) {
      setError('Use 2–16 letters, numbers, spaces, or . _ -');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setH2HUsername(name);
      const result = await createRoom(name, gameMode);
      hapticMedium();
      onCreated(result.room_id, result.room_code, result.game_mode ?? gameMode);
    } catch (err) {
      const message =
        err instanceof MultiplayerApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not create lobby.';
      setError(message);
      setBusy(false);
    }
  };

  const nameOk = sanitizeH2HUsername(displayName).length >= 2;

  return (
    <H2HLobbyShell
      className="h2h-lobby--form"
      ariaLabel="Create lobby"
      onBack={handleBack}
      backDisabled={busy}
    >
      <header className="h2h-lobby__titles">
        <p className="h2h-lobby__kicker">CREATE LOBBY</p>
        <h1 className="h2h-lobby__title">Your name</h1>
        <p className="h2h-lobby__tagline">What your opponent will see.</p>
      </header>

      <form className="h2h-lobby__form" onSubmit={onSubmit}>
        <label className="h2h-lobby__field">
          <span>Display name</span>
          <input
            className="h2h-lobby__input"
            type="text"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            maxLength={16}
            value={displayName}
            disabled={busy}
            autoFocus
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter a name"
          />
        </label>

        {error ? (
          <p className="h2h-lobby__error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="h2h-lobby__primary ui-tap"
          disabled={busy || !nameOk}
        >
          {busy ? 'Creating…' : 'Create lobby'}
        </button>
      </form>
    </H2HLobbyShell>
  );
}
