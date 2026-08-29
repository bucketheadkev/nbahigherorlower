'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnonymousAuth } from '@/hooks/useAnonymousAuth';
import {
  clearActiveRoom,
  readActiveRoom,
  writeActiveRoom,
} from '@/lib/multiplayer/activeRoom';
import { isValidH2HRoomCode, sanitizeH2HRoomCode } from '@/lib/multiplayer/roomCode';
import { joinRoom, fetchRoomLobby } from '@/lib/multiplayer/rooms';
import { getH2HUsername, isValidH2HUsername, setH2HUsername } from '@/lib/tradeup/h2hUsername';
import type { H2HGameMode } from '@/lib/multiplayer/gameModes';
import { H2HCreateLobby } from './h2h/H2HCreateLobby';
import { H2HEntryScreen } from './h2h/H2HEntryScreen';
import { H2HJoinLobby } from './h2h/H2HJoinLobby';
import { H2HMatchScreen } from './h2h/H2HMatchScreen';
import { H2HModeSelectScreen } from './h2h/H2HModeSelectScreen';
import { H2HWaitingLobby } from './h2h/H2HWaitingLobby';

type LobbyScreen = 'entry' | 'modes' | 'create' | 'join' | 'waiting' | 'match';

interface HeadToHeadFlowProps {
  onExit: () => void;
  /** Room code from invite deep link — auto-join when possible. */
  pendingJoinCode?: string | null;
  onJoinCodeConsumed?: () => void;
}

/**
 * 1V1 shell — entry (create/join) → host mode select → lobby → match → rematch.
 * Guests join by code and inherit the host’s mode (no purchase gate).
 * Classic single-player remains a separate TradeUpApp path.
 */
export function HeadToHeadFlow({
  onExit,
  pendingJoinCode = null,
  onJoinCodeConsumed,
}: HeadToHeadFlowProps) {
  const auth = useAnonymousAuth();
  const [screen, setScreen] = useState<LobbyScreen>(() => {
    if (pendingJoinCode && isValidH2HRoomCode(sanitizeH2HRoomCode(pendingJoinCode))) {
      return 'join';
    }
    return 'entry';
  });
  const [roomId, setRoomId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<H2HGameMode>('classic');
  const [restoring, setRestoring] = useState(true);
  const [inviteJoinCode, setInviteJoinCode] = useState<string | null>(() => {
    if (pendingJoinCode && isValidH2HRoomCode(sanitizeH2HRoomCode(pendingJoinCode))) {
      return sanitizeH2HRoomCode(pendingJoinCode);
    }
    return null;
  });
  const [inviteJoinBusy, setInviteJoinBusy] = useState(false);
  const [inviteJoinError, setInviteJoinError] = useState<string | null>(null);
  const restoreAttempted = useRef(false);
  const inviteJoinAttempted = useRef(false);
  const onJoinCodeConsumedRef = useRef(onJoinCodeConsumed);
  onJoinCodeConsumedRef.current = onJoinCodeConsumed;

  const enterRoom = useCallback((nextRoomId: string, nextCode: string) => {
    writeActiveRoom(nextRoomId, nextCode);
    setRoomId(nextRoomId);
    setInviteJoinCode(null);
    setScreen('waiting');
  }, []);

  useEffect(() => {
    if (!pendingJoinCode) return;
    const code = sanitizeH2HRoomCode(pendingJoinCode);
    if (!isValidH2HRoomCode(code)) return;
    setInviteJoinCode(code);
    onJoinCodeConsumedRef.current?.();
  }, [pendingJoinCode]);

  useEffect(() => {
    if (auth.status === 'loading') return;
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;

    if (auth.status !== 'ready') {
      setRestoring(false);
      return;
    }

    if (inviteJoinCode) {
      setRestoring(false);
      return;
    }

    const saved = readActiveRoom();
    if (!saved) {
      setRestoring(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const snap = await fetchRoomLobby(saved.roomId);
        if (cancelled) return;

        const member = snap.players.some((p) => p.user_id === auth.user.id);
        const expired = new Date(snap.room.expires_at).getTime() <= Date.now();
        const usable =
          member &&
          !expired &&
          snap.room.status === 'waiting';

        if (!usable) {
          clearActiveRoom();
          setRestoring(false);
          return;
        }

        writeActiveRoom(snap.room.id, snap.room.room_code);
        setRoomId(snap.room.id);
        setSelectedMode(snap.room.game_mode ?? 'classic');
        setScreen('waiting');
      } catch {
        if (!cancelled) clearActiveRoom();
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth, inviteJoinCode]);

  useEffect(() => {
    if (!inviteJoinCode || inviteJoinAttempted.current) return;
    if (auth.status !== 'ready' || restoring) return;

    const savedName = getH2HUsername();
    if (!savedName || !isValidH2HUsername(savedName)) {
      setScreen('join');
      return;
    }

    inviteJoinAttempted.current = true;
    setInviteJoinBusy(true);
    setInviteJoinError(null);

    void (async () => {
      try {
        setH2HUsername(savedName);
        const result = await joinRoom(inviteJoinCode, savedName);
        enterRoom(result.room_id, result.room_code);
      } catch (err) {
        inviteJoinAttempted.current = false;
        const message =
          err instanceof Error ? err.message : 'Could not join from invite link.';
        setInviteJoinError(message);
        setScreen('join');
      } finally {
        setInviteJoinBusy(false);
      }
    })();
  }, [auth.status, enterRoom, inviteJoinCode, restoring]);

  const handleHostMode = useCallback((mode: H2HGameMode) => {
    setSelectedMode(mode);
    setScreen('create');
  }, []);

  const handleCreated = useCallback(
    (nextRoomId: string, nextCode: string, mode: H2HGameMode) => {
      setSelectedMode(mode);
      enterRoom(nextRoomId, nextCode);
    },
    [enterRoom],
  );

  const handleJoined = useCallback(
    (nextRoomId: string, nextCode: string) => {
      enterRoom(nextRoomId, nextCode);
    },
    [enterRoom],
  );

  const handleLeftLobby = useCallback(() => {
    clearActiveRoom();
    setRoomId(null);
    setScreen('entry');
  }, []);

  const handlePlaying = useCallback(() => {
    setScreen('match');
  }, []);

  if (restoring || auth.status === 'loading' || inviteJoinBusy) {
    return (
      <div className="h2h-lobby" aria-label="Loading 1V1">
        <p className="h2h-lobby__status">
          {inviteJoinBusy ? 'Joining from invite…' : 'Loading…'}
        </p>
      </div>
    );
  }

  if (screen === 'create') {
    return (
      <H2HCreateLobby
        gameMode={selectedMode}
        onCreated={handleCreated}
        onBack={() => setScreen('entry')}
      />
    );
  }

  if (screen === 'join') {
    return (
      <H2HJoinLobby
        initialRoomCode={inviteJoinCode ?? undefined}
        inviteFromLink={Boolean(inviteJoinCode)}
        initialError={inviteJoinError}
        onJoined={handleJoined}
        onBack={() => {
          setInviteJoinCode(null);
          setInviteJoinError(null);
          inviteJoinAttempted.current = false;
          setScreen('entry');
        }}
      />
    );
  }

  if (screen === 'modes') {
    return (
      <H2HModeSelectScreen
        onHostMode={handleHostMode}
        onJoin={() => setScreen('join')}
        onBack={() => setScreen('entry')}
        authLoading={false}
        authError={auth.status === 'error' ? auth.message : null}
      />
    );
  }

  if (screen === 'match' && roomId && auth.status === 'ready') {
    return (
      <H2HMatchScreen
        roomId={roomId}
        userId={auth.user.id}
        onLeft={handleLeftLobby}
      />
    );
  }

  if (screen === 'waiting' && roomId) {
    if (auth.status === 'ready') {
      return (
        <H2HWaitingLobby
          roomId={roomId}
          userId={auth.user.id}
          preferredMode={selectedMode}
          onLeft={handleLeftLobby}
          onPlaying={handlePlaying}
        />
      );
    }

    return (
      <div className="h2h-lobby" aria-label="Connecting to lobby">
        <p className="h2h-lobby__status">
          {auth.status === 'error' ? auth.message : 'Connecting…'}
        </p>
        {auth.status === 'error' ? (
          <button type="button" className="h2h-lobby__leave" onClick={handleLeftLobby}>
            Back
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <H2HEntryScreen
      onCreate={() => {
        setSelectedMode('classic');
        setScreen('create');
      }}
      onJoin={() => setScreen('join')}
      onBack={onExit}
      authLoading={false}
      authError={auth.status === 'error' ? auth.message : null}
    />
  );
}
