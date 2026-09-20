'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnonymousAuth } from '@/hooks/useAnonymousAuth';
import {
  clearActiveRoom,
  readActiveRoom,
  writeActiveRoom,
} from '@/lib/multiplayer/activeRoom';
import {
  clearPendingH2HJoinCode,
  consumePendingH2HJoinCode,
} from '@/lib/multiplayer/h2hInvite';
import { isValidH2HRoomCode, sanitizeH2HRoomCode } from '@/lib/multiplayer/roomCode';
import { joinRoom, fetchRoomLobby, leaveRoom } from '@/lib/multiplayer/rooms';
import { ensureInviteDisplayName, setH2HUsername } from '@/lib/tradeup/h2hUsername';
import type { H2HGameMode } from '@/lib/multiplayer/gameModes';
import { H2HCreateLobby } from './h2h/H2HCreateLobby';
import { H2HEntryScreen } from './h2h/H2HEntryScreen';
import { H2HJoinLobby } from './h2h/H2HJoinLobby';
import { H2HLoadingScreen, H2HLobbyShell } from './h2h/H2HLobbyChrome';
import { H2HMatchScreen } from './h2h/H2HMatchScreen';
import { H2HModeSelectScreen } from './h2h/H2HModeSelectScreen';
import { H2HWaitingLobby } from './h2h/H2HWaitingLobby';

type LobbyScreen = 'entry' | 'modes' | 'create' | 'join' | 'waiting' | 'match';

interface HeadToHeadFlowProps {
  onExit: () => void;
  pendingJoinCode?: string | null;
  onJoinCodeConsumed?: () => void;
}

function readInitialInviteCode(pendingJoinCode: string | null | undefined): string | null {
  if (pendingJoinCode) {
    const code = sanitizeH2HRoomCode(pendingJoinCode);
    if (isValidH2HRoomCode(code)) return code;
  }
  const stored = consumePendingH2HJoinCode();
  return stored && isValidH2HRoomCode(stored) ? stored : null;
}

/**
 * 1V1 shell — entry → create/join → lobby → match.
 * Always clears sticky invite/active-room state so abandoned lobbies never block re-entry.
 */
export function HeadToHeadFlow({
  onExit,
  pendingJoinCode = null,
  onJoinCodeConsumed,
}: HeadToHeadFlowProps) {
  const auth = useAnonymousAuth();
  const initialInvite = useRef(readInitialInviteCode(pendingJoinCode));
  const [screen, setScreen] = useState<LobbyScreen>(() =>
    initialInvite.current ? 'join' : 'entry',
  );
  const [roomId, setRoomId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<H2HGameMode>('classic');
  const [restoring, setRestoring] = useState(true);
  const [inviteJoinCode, setInviteJoinCode] = useState<string | null>(
    () => initialInvite.current,
  );
  const [inviteJoinBusy, setInviteJoinBusy] = useState(false);
  const [inviteJoinError, setInviteJoinError] = useState<string | null>(null);
  const restoreAttempted = useRef(false);
  const inviteJoinAttempted = useRef(false);
  const onJoinCodeConsumedRef = useRef(onJoinCodeConsumed);
  onJoinCodeConsumedRef.current = onJoinCodeConsumed;

  const resetInviteState = useCallback(() => {
    clearPendingH2HJoinCode();
    setInviteJoinCode(null);
    setInviteJoinError(null);
    setInviteJoinBusy(false);
    inviteJoinAttempted.current = false;
  }, []);

  const enterRoom = useCallback((nextRoomId: string, nextCode: string) => {
    clearPendingH2HJoinCode();
    writeActiveRoom(nextRoomId, nextCode);
    setRoomId(nextRoomId);
    setInviteJoinCode(null);
    setInviteJoinError(null);
    setScreen('waiting');
  }, []);

  const exitToHome = useCallback(() => {
    const leavingId = roomId;
    clearActiveRoom();
    clearPendingH2HJoinCode();
    resetInviteState();
    setRoomId(null);
    if (leavingId) {
      void leaveRoom(leavingId).catch(() => undefined);
    }
    onExit();
  }, [onExit, resetInviteState, roomId]);

  useEffect(() => {
    if (!pendingJoinCode) return;
    const code = sanitizeH2HRoomCode(pendingJoinCode);
    if (!isValidH2HRoomCode(code)) return;
    setInviteJoinCode(code);
    setInviteJoinError(null);
    inviteJoinAttempted.current = false;
    setScreen('join');
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
        const status = snap.room.status;
        const usable = member && !expired && status === 'waiting';

        if (!usable) {
          // Drop any dead/stale membership so create/join is never blocked.
          if (member) {
            try {
              await leaveRoom(saved.roomId);
            } catch {
              /* already gone */
            }
          }
          clearActiveRoom();
          clearPendingH2HJoinCode();
          setRestoring(false);
          return;
        }

        writeActiveRoom(snap.room.id, snap.room.room_code);
        setRoomId(snap.room.id);
        setSelectedMode(snap.room.game_mode ?? 'classic');
        setScreen('waiting');
      } catch {
        if (!cancelled) {
          clearActiveRoom();
          clearPendingH2HJoinCode();
        }
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

    const savedName = ensureInviteDisplayName();
    inviteJoinAttempted.current = true;
    setInviteJoinBusy(true);
    setInviteJoinError(null);

    void (async () => {
      try {
        setH2HUsername(savedName);
        const result = await joinRoom(inviteJoinCode, savedName);
        enterRoom(result.room_id, result.room_code);
      } catch (err) {
        clearPendingH2HJoinCode();
        inviteJoinAttempted.current = false;
        const message =
          err instanceof Error ? err.message : 'Could not join from invite link.';
        setInviteJoinError(message);
        setInviteJoinCode(null);
      } finally {
        setInviteJoinBusy(false);
      }
    })();
  }, [auth.status, enterRoom, inviteJoinCode, restoring]);

  const handleHostMode = useCallback((mode: H2HGameMode) => {
    clearPendingH2HJoinCode();
    setInviteJoinCode(null);
    setInviteJoinError(null);
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
    clearPendingH2HJoinCode();
    resetInviteState();
    setRoomId(null);
    setScreen('entry');
  }, [resetInviteState]);

  const handlePlaying = useCallback(() => {
    setScreen('match');
  }, []);

  const dismissInviteError = useCallback(() => {
    resetInviteState();
    setScreen('entry');
  }, [resetInviteState]);

  // Dead/abandoned invites must never trap on a sticky abandoned screen.
  useEffect(() => {
    if (!inviteJoinError) return;
    const deadLobby =
      /abandon/i.test(inviteJoinError) ||
      /no longer available/i.test(inviteJoinError) ||
      inviteJoinError.toUpperCase().includes('ROOM_ABANDONED');
    if (!deadLobby) return;
    clearActiveRoom();
    clearPendingH2HJoinCode();
    resetInviteState();
    setScreen('entry');
  }, [inviteJoinError, resetInviteState]);

  if (inviteJoinCode && auth.status === 'error') {
    return (
      <InviteJoinNotice message={auth.message} onBack={exitToHome} onDismiss={dismissInviteError} />
    );
  }

  if (inviteJoinError) {
    const deadLobby =
      /abandon/i.test(inviteJoinError) ||
      /no longer available/i.test(inviteJoinError) ||
      inviteJoinError.toUpperCase().includes('ROOM_ABANDONED');
    if (deadLobby) {
      // Effect clears state; keep entry usable while that runs.
      return (
        <H2HEntryScreen
          onCreate={() => {
            clearPendingH2HJoinCode();
            resetInviteState();
            setSelectedMode('classic');
            setScreen('create');
          }}
          onJoin={() => {
            resetInviteState();
            setScreen('join');
          }}
          onBack={exitToHome}
          authLoading={false}
          authError={null}
        />
      );
    }
    return (
      <InviteJoinNotice
        message={inviteJoinError}
        onBack={exitToHome}
        onDismiss={dismissInviteError}
      />
    );
  }

  if (restoring || auth.status === 'loading' || inviteJoinBusy) {
    return (
      <H2HLoadingScreen
        status={
          inviteJoinBusy
            ? 'Joining your invite…'
            : restoring
              ? 'Restoring your lobby…'
              : 'Connecting…'
        }
        onBack={exitToHome}
      />
    );
  }

  if (screen === 'create') {
    return (
      <H2HCreateLobby
        gameMode={selectedMode}
        onCreated={handleCreated}
        onBack={() => {
          resetInviteState();
          setScreen('entry');
        }}
      />
    );
  }

  if (screen === 'join') {
    return (
      <H2HJoinLobby
        initialRoomCode={inviteJoinCode ?? undefined}
        inviteFromLink={Boolean(inviteJoinCode)}
        initialError={null}
        onJoined={handleJoined}
        onBack={() => {
          resetInviteState();
          setScreen('entry');
        }}
      />
    );
  }

  if (screen === 'modes') {
    return (
      <H2HModeSelectScreen
        onHostMode={handleHostMode}
        onJoin={() => {
          resetInviteState();
          setScreen('join');
        }}
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
      <H2HLoadingScreen
        status={auth.status === 'error' ? auth.message : 'Connecting to lobby…'}
        onBack={auth.status === 'error' ? handleLeftLobby : undefined}
      />
    );
  }

  return (
    <H2HEntryScreen
      onCreate={() => {
        clearPendingH2HJoinCode();
        resetInviteState();
        setSelectedMode('classic');
        setScreen('create');
      }}
      onJoin={() => {
        resetInviteState();
        setScreen('join');
      }}
      onBack={exitToHome}
      authLoading={false}
      authError={auth.status === 'error' ? auth.message : null}
    />
  );
}

function InviteJoinNotice({
  message,
  onBack,
  onDismiss,
}: {
  message: string;
  onBack: () => void;
  onDismiss: () => void;
}) {
  return (
    <H2HLobbyShell className="h2h-lobby--form" ariaLabel="Invite unavailable" onBack={onDismiss}>
      <header className="h2h-lobby__titles">
        <p className="h2h-lobby__kicker">1V1</p>
        <h1 className="h2h-lobby__title">Can’t join</h1>
        <p className="h2h-lobby__tagline">{message}</p>
      </header>
      <button type="button" className="h2h-lobby__primary ui-tap" onClick={onDismiss}>
        Back to 1v1
      </button>
      <button type="button" className="h2h-lobby__leave ui-tap" onClick={onBack}>
        Home
      </button>
    </H2HLobbyShell>
  );
}
