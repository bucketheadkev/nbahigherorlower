'use client';

import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useState,
} from 'react';
import { joinRoom } from '@/lib/multiplayer/rooms';
import {
  H2H_ROOM_CODE_LENGTH,
  isValidH2HRoomCode,
  sanitizeH2HRoomCode,
} from '@/lib/multiplayer/roomCode';
import { MultiplayerApiError } from '@/lib/multiplayer/types';
import {
  getH2HUsername,
  isValidH2HUsername,
  sanitizeH2HUsername,
  setH2HUsername,
} from '@/lib/tradeup/h2hUsername';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';

interface H2HJoinLobbyProps {
  onJoined: (roomId: string, roomCode: string) => void;
  onBack: () => void;
}

export function H2HJoinLobby({ onJoined, onBack }: H2HJoinLobbyProps) {
  const [displayName, setDisplayName] = useState(() => getH2HUsername() ?? '');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    const code = sanitizeH2HRoomCode(roomCode);
    if (!isValidH2HUsername(name)) {
      setError('Use 2–16 letters, numbers, spaces, or . _ -');
      return;
    }
    if (!isValidH2HRoomCode(code)) {
      setError(`Enter a valid ${H2H_ROOM_CODE_LENGTH}-character room code.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setH2HUsername(name);
      const result = await joinRoom(code, name);
      hapticMedium();
      onJoined(result.room_id, result.room_code);
    } catch (err) {
      const message =
        err instanceof MultiplayerApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not join lobby.';
      setError(message);
      setBusy(false);
    }
  };

  const canSubmit =
    sanitizeH2HUsername(displayName).length >= 2 && isValidH2HRoomCode(roomCode);

  return (
    <div className="h2h-lobby" aria-label="Join lobby">
      <button type="button" className="h2h-lobby__back" disabled={busy} onPointerDown={pressBack}>
        ← Back
      </button>

      <header className="h2h-lobby__header">
        <p className="h2h-lobby__eyebrow">1V1</p>
        <h1 className="h2h-lobby__title">Join Lobby</h1>
        <p className="h2h-lobby__subtitle">
          Enter your name and the host’s {H2H_ROOM_CODE_LENGTH}-character code.
        </p>
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

        <label className="h2h-lobby__field">
          <span>Room code</span>
          <input
            className="h2h-lobby__input h2h-lobby__input--code"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={H2H_ROOM_CODE_LENGTH}
            value={roomCode}
            disabled={busy}
            onChange={(e) => setRoomCode(sanitizeH2HRoomCode(e.target.value))}
            placeholder="A2B3"
            aria-describedby={error ? 'join-lobby-error' : undefined}
          />
        </label>

        {error ? (
          <p id="join-lobby-error" className="h2h-lobby__error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="run-btn run-btn--primary h2h-lobby__submit"
          disabled={busy || !canSubmit}
        >
          <strong>{busy ? 'JOINING…' : 'JOIN LOBBY'}</strong>
        </button>
      </form>
    </div>
  );
}
