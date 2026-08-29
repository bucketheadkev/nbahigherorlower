'use client';

import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useState,
} from 'react';
import { createRoom } from '@/lib/multiplayer/rooms';
import { MultiplayerApiError } from '@/lib/multiplayer/types';
import { modeDef, type H2HGameMode } from '@/lib/multiplayer/gameModes';
import {
  getH2HUsername,
  isValidH2HUsername,
  sanitizeH2HUsername,
  setH2HUsername,
} from '@/lib/tradeup/h2hUsername';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';

interface H2HCreateLobbyProps {
  gameMode: H2HGameMode;
  onCreated: (roomId: string, roomCode: string, gameMode: H2HGameMode) => void;
  onBack: () => void;
}

export function H2HCreateLobby({ gameMode, onCreated, onBack }: H2HCreateLobbyProps) {
  const [displayName, setDisplayName] = useState(() => getH2HUsername() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const def = modeDef(gameMode);

  const pressBack = (e: ReactPointerEvent) => {
    e.preventDefault();
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

  return (
    <div className="h2h-lobby" aria-label="Create lobby">
      <button type="button" className="h2h-lobby__back" disabled={busy} onPointerDown={pressBack}>
        ← Back
      </button>

      <header className="h2h-lobby__header">
        <p className="h2h-lobby__eyebrow">{def.title}</p>
        <h1 className="h2h-lobby__title">Create Lobby</h1>
        <p className="h2h-lobby__subtitle">{def.tagline}</p>
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
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </label>

        {error ? (
          <p className="h2h-lobby__error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="run-btn run-btn--primary h2h-lobby__submit"
          disabled={busy || !sanitizeH2HUsername(displayName)}
        >
          <strong>{busy ? 'CREATING…' : 'CREATE LOBBY'}</strong>
        </button>
      </form>
    </div>
  );
}
