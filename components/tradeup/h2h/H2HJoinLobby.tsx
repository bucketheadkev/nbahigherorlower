'use client';

import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useState,
} from 'react';
import { joinRoom } from '@/lib/multiplayer/rooms';
import { MultiplayerApiError } from '@/lib/multiplayer/types';
import {
  getH2HUsername,
  isValidH2HUsername,
  sanitizeH2HUsername,
  setH2HUsername,
} from '@/lib/tradeup/h2hUsername';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface H2HJoinLobbyProps {
  onJoined: (roomId: string, roomCode: string) => void;
  onBack: () => void;
}

function sanitizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .split('')
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, 6);
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
    const code = sanitizeRoomCode(roomCode);
    if (!isValidH2HUsername(name)) {
      setError('Use 2–16 letters, numbers, spaces, or . _ -');
      return;
    }
    if (code.length !== 6) {
      setError('Enter a valid six-character room code.');
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
    sanitizeH2HUsername(displayName).length >= 2 && sanitizeRoomCode(roomCode).length === 6;

  return (
    <div className="h2h-lobby" aria-label="Join lobby">
      <button type="button" className="h2h-lobby__back" disabled={busy} onPointerDown={pressBack}>
        ← Back
      </button>

      <header className="h2h-lobby__header">
        <p className="h2h-lobby__eyebrow">1V1</p>
        <h1 className="h2h-lobby__title">Join Lobby</h1>
        <p className="h2h-lobby__subtitle">Enter your name and the host’s six-character code.</p>
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
            maxLength={6}
            value={roomCode}
            disabled={busy}
            onChange={(e) => setRoomCode(sanitizeRoomCode(e.target.value))}
            placeholder="ABC234"
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
