'use client';

import { useCallback, useState } from 'react';
import { useAnonymousAuth } from '@/hooks/useAnonymousAuth';
import { H2HCreateLobby } from './h2h/H2HCreateLobby';
import { H2HEntryScreen } from './h2h/H2HEntryScreen';
import { H2HJoinLobby } from './h2h/H2HJoinLobby';
import { H2HWaitingLobby } from './h2h/H2HWaitingLobby';

type LobbyScreen = 'entry' | 'create' | 'join' | 'waiting';

interface HeadToHeadFlowProps {
  onExit: () => void;
}

/**
 * 1V1 shell — Phase 1 private lobby entry (create / join / wait).
 * Does not start a multiplayer match yet; Classic mode is untouched.
 */
export function HeadToHeadFlow({ onExit }: HeadToHeadFlowProps) {
  const auth = useAnonymousAuth();
  const [screen, setScreen] = useState<LobbyScreen>('entry');
  const [roomId, setRoomId] = useState<string | null>(null);

  const handleCreated = useCallback((nextRoomId: string) => {
    setRoomId(nextRoomId);
    setScreen('waiting');
  }, []);

  const handleJoined = useCallback((nextRoomId: string) => {
    setRoomId(nextRoomId);
    setScreen('waiting');
  }, []);

  const handleLeftLobby = useCallback(() => {
    setRoomId(null);
    setScreen('entry');
  }, []);

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

  if (screen === 'waiting' && roomId) {
    if (auth.status === 'ready') {
      return (
        <H2HWaitingLobby
          roomId={roomId}
          userId={auth.user.id}
          onLeft={handleLeftLobby}
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
      authLoading={auth.status === 'loading'}
      authError={auth.status === 'error' ? auth.message : null}
    />
  );
}
