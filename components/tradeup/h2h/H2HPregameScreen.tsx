'use client';

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { slotFor, useRoomLobby } from '@/hooks/useRoomLobby';
import { clearActiveRoom, writeActiveRoom } from '@/lib/multiplayer/activeRoom';
import { leaveRoom } from '@/lib/multiplayer/rooms';
import { hapticLight } from '@/lib/tradeup/haptics';

interface H2HPregameScreenProps {
  roomId: string;
  userId: string;
  onLeft: () => void;
}

/**
 * Temporary Phase 2 pregame — both devices land here when room.status is playing.
 * No spinner / draft / values yet.
 */
export function H2HPregameScreen({ roomId, userId, onLeft }: H2HPregameScreenProps) {
  const { snapshot, loading, error } = useRoomLobby({ roomId });
  const [leaving, setLeaving] = useState(false);
  const leaveLock = useRef(false);

  const room = snapshot?.room ?? null;
  const players = snapshot?.players ?? [];
  const p1 = slotFor(players, 1);
  const p2 = slotFor(players, 2);
  const host = players.find((p) => p.user_id === room?.host_user_id) ?? null;
  const opponent =
    players.find((p) => room && p.user_id !== room.host_user_id) ?? null;
  const meIsHost = Boolean(room && room.host_user_id === userId);

  useEffect(() => {
    if (!room?.room_code) return;
    writeActiveRoom(room.id, room.room_code);
  }, [room?.id, room?.room_code]);

  const press = (fn: () => void, disabled: boolean) => (e: ReactPointerEvent) => {
    e.preventDefault();
    if (disabled) return;
    hapticLight();
    fn();
  };

  const handleLeave = async () => {
    if (leaveLock.current) return;
    leaveLock.current = true;
    setLeaving(true);
    try {
      await leaveRoom(roomId);
    } catch {
      /* still exit */
    } finally {
      clearActiveRoom();
      onLeft();
    }
  };

  return (
    <div className="h2h-lobby h2h-lobby--pregame" aria-label="1V1 match pregame">
      <header className="h2h-lobby__header">
        <p className="h2h-lobby__eyebrow">1V1 MATCH</p>
        <h1 className="h2h-lobby__title">Both players connected</h1>
        <p className="h2h-lobby__subtitle">
          Room code{' '}
          <span className="h2h-lobby__inline-code">
            {room?.room_code ?? (loading ? '······' : '————')}
          </span>
        </p>
      </header>

      <div className="h2h-lobby__slots">
        <div className="h2h-lobby__slot is-filled">
          <div className="h2h-lobby__slot-top">
            <span className="h2h-lobby__slot-label">Host</span>
            {meIsHost ? <span className="h2h-lobby__you-pill">YOU</span> : null}
          </div>
          <p className="h2h-lobby__slot-name">
            {host?.display_name ?? p1?.display_name ?? (loading ? '…' : '—')}
          </p>
        </div>
        <div className="h2h-lobby__slot is-filled">
          <div className="h2h-lobby__slot-top">
            <span className="h2h-lobby__slot-label">Opponent</span>
            {!meIsHost ? <span className="h2h-lobby__you-pill">YOU</span> : null}
          </div>
          <p className="h2h-lobby__slot-name">
            {opponent?.display_name ?? p2?.display_name ?? (loading ? '…' : '—')}
          </p>
        </div>
      </div>

      <p className="h2h-lobby__phase-note" role="status">
        Match gameplay coming in Phase 3
      </p>

      {error ? (
        <p className="h2h-lobby__error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="h2h-lobby__leave"
        disabled={leaving}
        onPointerDown={press(() => void handleLeave(), leaving)}
      >
        {leaving ? 'Leaving…' : 'Leave Match'}
      </button>
    </div>
  );
}
