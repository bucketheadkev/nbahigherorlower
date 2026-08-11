'use client';

import { Share } from '@capacitor/share';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { slotFor, useRoomLobby } from '@/hooks/useRoomLobby';
import { leaveRoom } from '@/lib/multiplayer/rooms';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';

interface H2HWaitingLobbyProps {
  roomId: string;
  userId: string;
  onLeft: () => void;
}

function inviteText(code: string): string {
  return `I challenged you to a 1B Run matchup. Open 1B Run and enter room code: ${code}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function H2HWaitingLobby({ roomId, userId, onLeft }: H2HWaitingLobbyProps) {
  const { snapshot, loading, error, setReady, readyBusy } = useRoomLobby({ roomId });
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyFlash, setCopyFlash] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leaveLock = useRef(false);

  const room = snapshot?.room ?? null;
  const players = snapshot?.players ?? [];
  const p1 = slotFor(players, 1);
  const p2 = slotFor(players, 2);
  const me = players.find((p) => p.user_id === userId) ?? null;
  const isHost = Boolean(room && me && room.host_user_id === me.user_id);

  useEffect(() => {
    if (!copyFlash) return;
    const id = window.setTimeout(() => setCopyFlash(false), 1600);
    return () => window.clearTimeout(id);
  }, [copyFlash]);

  const press = (fn: () => void, disabled: boolean) => (e: ReactPointerEvent) => {
    e.preventDefault();
    if (disabled) return;
    hapticLight();
    fn();
  };

  const handleCopy = useCallback(async () => {
    if (!room?.room_code || leaving) return;
    const ok = await copyText(room.room_code);
    if (ok) {
      hapticMedium();
      setCopyFlash(true);
      setActionError(null);
    } else {
      setActionError('Could not copy the room code.');
    }
  }, [leaving, room?.room_code]);

  const handleInvite = useCallback(async () => {
    if (!room?.room_code || leaving) return;
    try {
      await Share.share({
        title: '1B Run',
        text: inviteText(room.room_code),
        dialogTitle: 'Invite a friend',
      });
      hapticMedium();
      setActionError(null);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message ?? '')
          : '';
      if (/cancel|dismiss/i.test(message)) return;
      setActionError('Could not open the share sheet.');
    }
  }, [leaving, room?.room_code]);

  const handleReadyToggle = useCallback(async () => {
    if (!me || readyBusy || leaving) return;
    try {
      setActionError(null);
      await setReady(!me.is_ready);
      hapticMedium();
    } catch {
      /* error surfaced by hook / local */
    }
  }, [leaving, me, readyBusy, setReady]);

  const handleLeave = useCallback(async () => {
    if (leaveLock.current) return;
    leaveLock.current = true;
    setLeaving(true);
    setActionError(null);
    try {
      await leaveRoom(roomId);
    } catch {
      /* still exit locally so the user is never stuck */
    } finally {
      onLeft();
    }
  }, [onLeft, roomId]);

  const showError = actionError || error;

  return (
    <div className="h2h-lobby h2h-lobby--waiting" aria-label="Waiting lobby">
      <header className="h2h-lobby__header">
        <p className="h2h-lobby__eyebrow">1V1 LOBBY</p>
        <h1 className="h2h-lobby__code" aria-live="polite">
          {room?.room_code ?? (loading ? '······' : '————')}
        </h1>
        <p className="h2h-lobby__subtitle">Share this code with your opponent.</p>
      </header>

      <div className="h2h-lobby__share-row">
        <button
          type="button"
          className="h2h-lobby__chip-btn"
          disabled={!room?.room_code || leaving}
          onPointerDown={press(() => void handleCopy(), !room?.room_code || leaving)}
        >
          {copyFlash ? 'COPIED' : 'COPY CODE'}
        </button>
        <button
          type="button"
          className="h2h-lobby__chip-btn h2h-lobby__chip-btn--accent"
          disabled={!room?.room_code || leaving}
          onPointerDown={press(() => void handleInvite(), !room?.room_code || leaving)}
        >
          INVITE FRIEND
        </button>
      </div>

      <div className="h2h-lobby__slots" aria-live="polite">
        <PlayerSlot
          label="Player 1"
          name={p1?.display_name ?? null}
          ready={Boolean(p1?.is_ready)}
          isHost={Boolean(p1 && room && p1.user_id === room.host_user_id)}
          isYou={Boolean(p1 && p1.user_id === userId)}
          emptyText="Waiting…"
        />
        <PlayerSlot
          label="Player 2"
          name={p2?.display_name ?? null}
          ready={Boolean(p2?.is_ready)}
          isHost={Boolean(p2 && room && p2.user_id === room.host_user_id)}
          isYou={Boolean(p2 && p2.user_id === userId)}
          emptyText="Waiting for opponent…"
        />
      </div>

      {!p2 ? (
        <p className="h2h-lobby__waiting">Waiting for opponent…</p>
      ) : (
        <p className="h2h-lobby__waiting h2h-lobby__waiting--ready">Opponent joined</p>
      )}

      {me ? (
        <button
          type="button"
          className={`run-btn ${me.is_ready ? 'run-btn--secondary' : 'run-btn--primary'} h2h-lobby__submit`}
          disabled={readyBusy || leaving || !p2}
          onPointerDown={press(() => void handleReadyToggle(), readyBusy || leaving || !p2)}
        >
          <strong>
            {readyBusy ? 'UPDATING…' : me.is_ready ? 'UNREADY' : 'READY'}
          </strong>
          <span>
            {!p2
              ? 'Wait for an opponent before ready up'
              : me.is_ready
                ? 'You’re marked ready'
                : 'Tap when you’re ready to play'}
          </span>
        </button>
      ) : null}

      {showError ? (
        <p className="h2h-lobby__error" role="alert">
          {showError}
        </p>
      ) : null}

      {isHost ? <p className="h2h-lobby__host-note">You are the host</p> : null}

      <button
        type="button"
        className="h2h-lobby__leave"
        disabled={leaving}
        onPointerDown={press(() => void handleLeave(), leaving)}
      >
        {leaving ? 'Leaving…' : 'Leave Lobby'}
      </button>
    </div>
  );
}

function PlayerSlot({
  label,
  name,
  ready,
  isHost,
  isYou,
  emptyText,
}: {
  label: string;
  name: string | null;
  ready: boolean;
  isHost: boolean;
  isYou: boolean;
  emptyText: string;
}) {
  return (
    <div className={`h2h-lobby__slot${name ? ' is-filled' : ''}${ready ? ' is-ready' : ''}`}>
      <div className="h2h-lobby__slot-top">
        <span className="h2h-lobby__slot-label">{label}</span>
        {isHost ? <span className="h2h-lobby__host-pill">HOST</span> : null}
        {isYou ? <span className="h2h-lobby__you-pill">YOU</span> : null}
      </div>
      <p className="h2h-lobby__slot-name">{name ?? emptyText}</p>
      {name ? (
        <p className={`h2h-lobby__slot-ready${ready ? ' is-on' : ''}`}>
          {ready ? 'Ready' : 'Not ready'}
        </p>
      ) : null}
    </div>
  );
}
