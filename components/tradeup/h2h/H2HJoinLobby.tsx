'use client';

import { type FormEvent, useEffect, useState } from 'react';
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
import { H2HLobbyShell } from './H2HLobbyChrome';

interface H2HJoinLobbyProps {
  onJoined: (roomId: string, roomCode: string) => void;
  onBack: () => void;
  initialRoomCode?: string;
  inviteFromLink?: boolean;
  initialError?: string | null;
}

export function H2HJoinLobby({
  onJoined,
  onBack,
  initialRoomCode = '',
  inviteFromLink = false,
  initialError = null,
}: H2HJoinLobbyProps) {
  const [displayName, setDisplayName] = useState(() => getH2HUsername() ?? '');
  const [roomCode, setRoomCode] = useState(() =>
    initialRoomCode ? sanitizeH2HRoomCode(initialRoomCode) : '',
  );
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialRoomCode) {
      setRoomCode(sanitizeH2HRoomCode(initialRoomCode));
    }
  }, [initialRoomCode]);

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  const handleBack = () => {
    if (busy) return;
    hapticLight();
    onBack();
  };

  const attemptJoin = async (name: string, code: string) => {
    setBusy(true);
    setError(null);
    try {
      setH2HUsername(name);
      const result = await joinRoom(code, name);
      hapticMedium();
      onJoined(result.room_id, result.room_code);
    } catch (err) {
      let message =
        err instanceof MultiplayerApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not join lobby.';
      // Never trap on an "abandoned" dead-end — keep join usable.
      if (
        (err instanceof MultiplayerApiError && err.code === 'ROOM_ABANDONED') ||
        /abandon/i.test(message)
      ) {
        message = 'That lobby is no longer available. Create or join a new one.';
      }
      setError(message);
      setBusy(false);
    }
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

    await attemptJoin(name, code);
  };

  const canSubmit =
    sanitizeH2HUsername(displayName).length >= 2 && isValidH2HRoomCode(roomCode);

  return (
    <H2HLobbyShell
      className="h2h-lobby--form"
      ariaLabel="Join lobby"
      onBack={handleBack}
      backDisabled={busy}
    >
      <header className="h2h-lobby__titles">
        <p className="h2h-lobby__kicker">JOIN LOBBY</p>
        <h1 className="h2h-lobby__title">
          {inviteFromLink ? 'You’re invited' : 'Enter code'}
        </h1>
        <p className="h2h-lobby__tagline">
          {inviteFromLink
            ? 'Confirm your name to join.'
            : `Your name and the host’s ${H2H_ROOM_CODE_LENGTH}-letter code.`}
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
            autoFocus
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter a name"
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
            disabled={busy || inviteFromLink}
            readOnly={inviteFromLink}
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
          className="h2h-lobby__primary ui-tap"
          disabled={busy || !canSubmit}
        >
          {busy ? 'Joining…' : 'Join lobby'}
        </button>
      </form>
    </H2HLobbyShell>
  );
}
