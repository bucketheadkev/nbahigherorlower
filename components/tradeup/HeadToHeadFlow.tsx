'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnonymousAuth } from '@/hooks/useAnonymousAuth';
import {
  clearActiveRoom,
  readActiveRoom,
  writeActiveRoom,
} from '@/lib/multiplayer/activeRoom';
import { fetchRoomLobby } from '@/lib/multiplayer/rooms';
import { H2HCreateLobby } from './h2h/H2HCreateLobby';
import { H2HEntryScreen } from './h2h/H2HEntryScreen';
import { H2HJoinLobby } from './h2h/H2HJoinLobby';
import { H2HPregameScreen } from './h2h/H2HPregameScreen';
import { H2HWaitingLobby } from './h2h/H2HWaitingLobby';

type LobbyScreen = 'entry' | 'create' | 'join' | 'waiting' | 'pregame';

interface HeadToHeadFlowProps {
  onExit: () => void;
}

/**
 * 1V1 shell — Phase 2: lobby + host start → synchronized pregame.
 * Classic mode and match spinner are untouched.
 */
export function HeadToHeadFlow({ onExit }: HeadToHeadFlowProps) {
  const auth = useAnonymousAuth();
  const [screen, setScreen] = useState<LobbyScreen>('entry');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const restoreAttempted = useRef(false);

  useEffect(() => {
    if (auth.status === 'loading') return;
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;

    if (auth.status !== 'ready') {
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
          (snap.room.status === 'waiting' || snap.room.status === 'playing');

        if (!usable) {
          clearActiveRoom();
          setRestoring(false);
          return;
        }

        writeActiveRoom(snap.room.id, snap.room.room_code);
        setRoomId(snap.room.id);
        setScreen(snap.room.status === 'playing' ? 'pregame' : 'waiting');
      } catch {
        if (!cancelled) clearActiveRoom();
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth]);

  const enterRoom = useCallback((nextRoomId: string, nextCode: string) => {
    writeActiveRoom(nextRoomId, nextCode);
    setRoomId(nextRoomId);
    setScreen('waiting');
  }, []);

  const handleCreated = useCallback(
    (nextRoomId: string, nextCode: string) => {
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
    setScreen('pregame');
  }, []);

  if (restoring || auth.status === 'loading') {
    return (
      <div className="h2h-lobby" aria-label="Loading 1V1">
        <p className="h2h-lobby__status">Loading…</p>
      </div>
    );
  }

  if (screen === 'create') {
    return (
      <H2HCreateLobby
        onCreated={handleCreated}
        onBack={() => setScreen('entry')}
      />
    );
  }

  if (screen === 'join') {
    return (
      <H2HJoinLobby
        onJoined={handleJoined}
        onBack={() => setScreen('entry')}
      />
    );
  }

  if (screen === 'pregame' && roomId && auth.status === 'ready') {
    return (
      <H2HPregameScreen
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
      onCreate={() => setScreen('create')}
      onJoin={() => setScreen('join')}
      onBack={onExit}
      authLoading={false}
      authError={auth.status === 'error' ? auth.message : null}
    />
  );
}
