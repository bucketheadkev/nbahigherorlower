'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnonymousAuth } from '@/hooks/useAnonymousAuth';
import {
  clearActiveRoom,
  readActiveRoom,
  writeActiveRoom,
} from '@/lib/multiplayer/activeRoom';
import { fetchRoomLobby } from '@/lib/multiplayer/rooms';
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
}

/**
 * 1V1 shell — entry (create/join) → host mode select → lobby → match → rematch.
 * Guests join by code and inherit the host’s mode (no purchase gate).
 * Classic single-player remains a separate TradeUpApp path.
 */
export function HeadToHeadFlow({ onExit }: HeadToHeadFlowProps) {
  const auth = useAnonymousAuth();
  const [screen, setScreen] = useState<LobbyScreen>('entry');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<H2HGameMode>('classic');
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
          (snap.room.status === 'waiting' ||
            snap.room.status === 'playing' ||
            snap.room.status === 'finished');

        if (!usable) {
          clearActiveRoom();
          setRestoring(false);
          return;
        }

        writeActiveRoom(snap.room.id, snap.room.room_code);
        setRoomId(snap.room.id);
        setSelectedMode(snap.room.game_mode ?? 'classic');

        if (snap.room.status === 'finished') {
          clearActiveRoom();
          setRoomId(null);
          setRestoring(false);
          return;
        }

        if (snap.room.status === 'waiting') {
          setScreen('waiting');
        } else {
          setScreen('match');
        }
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
        gameMode={selectedMode}
        onCreated={handleCreated}
        onBack={() => setScreen('modes')}
      />
    );
  }

  if (screen === 'join') {
    return (
      <H2HJoinLobby onJoined={handleJoined} onBack={() => setScreen('entry')} />
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
      onCreate={() => setScreen('modes')}
      onJoin={() => setScreen('join')}
      onBack={onExit}
      authLoading={false}
      authError={auth.status === 'error' ? auth.message : null}
    />
  );
}
