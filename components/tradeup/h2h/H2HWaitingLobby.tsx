'use client';

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { slotFor, useRoomLobby } from '@/hooks/useRoomLobby';
import { clearActiveRoom, writeActiveRoom } from '@/lib/multiplayer/activeRoom';
import {
  buildH2HInviteWebLink,
  clearPendingH2HJoinCode,
  shareH2HInvite,
} from '@/lib/multiplayer/h2hInvite';
import { leaveRoom } from '@/lib/multiplayer/rooms';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';
import type { H2HGameMode } from '@/lib/multiplayer/gameModes';
import { H2HLobbyShell, H2HLoadingScreen, H2HDisconnectNotice } from './H2HLobbyChrome';

interface H2HWaitingLobbyProps {
  roomId: string;
  userId: string;
  onLeft: () => void;
  onPlaying: () => void;
  preferredMode?: H2HGameMode;
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

export function H2HWaitingLobby({
  roomId,
  userId,
  onLeft,
  onPlaying,
}: H2HWaitingLobbyProps) {
  const { snapshot, loading, error, setReady, readyBusy, startGame, startBusy } = useRoomLobby({
    roomId,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyFlash, setCopyFlash] = useState(false);
  const [inviteFlash, setInviteFlash] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const leaveLock = useRef(false);
  const transitioned = useRef(false);
  const autoStartAttempted = useRef(false);
  const hadOpponentRef = useRef(false);
  const onPlayingRef = useRef(onPlaying);
  onPlayingRef.current = onPlaying;

  const room = snapshot?.room ?? null;
  const players = snapshot?.players ?? [];
  const p1 = slotFor(players, 1);
  const p2 = slotFor(players, 2);
  const me = players.find((p) => p.user_id === userId) ?? null;
  const bothReady = Boolean(p1?.is_ready && p2?.is_ready && p1 && p2);

  useEffect(() => {
    if (players.some((p) => p.user_id !== userId)) {
      hadOpponentRef.current = true;
    }
  }, [players, userId]);

  // Either player leaving should notify whoever remains (host leave abandons;
  // guest leave removes their row — both paths surface the disconnect notice).
  useEffect(() => {
    if (!room || disconnected || leaving) return;
    const abandoned = room.status === 'abandoned';
    const opponentLeft =
      hadOpponentRef.current &&
      Boolean(me) &&
      !players.some((p) => p.user_id !== userId) &&
      (room.status === 'waiting' || room.status === 'playing');
    if (!abandoned && !opponentLeft) return;
    clearActiveRoom();
    clearPendingH2HJoinCode();
    setDisconnected(true);
  }, [disconnected, leaving, me, players, room, userId]);

  useEffect(() => {
    if (!room?.room_code) return;
    writeActiveRoom(room.id, room.room_code);
  }, [room?.id, room?.room_code]);

  useEffect(() => {
    if (!room || room.status !== 'playing' || transitioned.current) return;
    transitioned.current = true;
    onPlayingRef.current();
  }, [room]);

  useEffect(() => {
    if (!room || !bothReady || room.status !== 'waiting') {
      autoStartAttempted.current = false;
      return;
    }
    if (room.host_user_id !== userId || autoStartAttempted.current || startBusy) return;
    autoStartAttempted.current = true;
    void startGame().catch(() => {
      autoStartAttempted.current = false;
    });
  }, [bothReady, room, startBusy, startGame, userId]);

  useEffect(() => {
    if (!copyFlash) return;
    const id = window.setTimeout(() => setCopyFlash(false), 1600);
    return () => window.clearTimeout(id);
  }, [copyFlash]);

  useEffect(() => {
    if (!inviteFlash) return;
    const id = window.setTimeout(() => setInviteFlash(null), 2200);
    return () => window.clearTimeout(id);
  }, [inviteFlash]);

  const press = (fn: () => void, disabled: boolean) => (e: ReactPointerEvent) => {
    e.preventDefault();
    if (disabled) return;
    hapticLight();
    fn();
  };

  const handleCopy = useCallback(async () => {
    if (!room?.room_code || leaving) return;
    const ok = await copyText(buildH2HInviteWebLink(room.room_code));
    if (ok) {
      hapticMedium();
      setCopyFlash(true);
      setActionError(null);
    } else {
      setActionError('Could not copy the invite link.');
    }
  }, [leaving, room?.room_code]);

  const handleInvite = useCallback(async () => {
    if (!room?.room_code || leaving || inviteBusy) return;
    setInviteBusy(true);
    setActionError(null);
    try {
      const result = await shareH2HInvite(room.room_code);
      if (result.ok === false && !result.cancelled) {
        setActionError(result.message);
        return;
      }
      if (result.ok) {
        hapticMedium();
        if (result.method === 'clipboard') {
          setInviteFlash('Copied');
        } else {
          setInviteFlash(null);
        }
      }
    } finally {
      setInviteBusy(false);
    }
  }, [inviteBusy, leaving, room?.room_code]);

  const handleReadyToggle = useCallback(async () => {
    if (!me || readyBusy || leaving || room?.status !== 'waiting') return;
    try {
      setActionError(null);
      await setReady(!me.is_ready);
      hapticMedium();
    } catch {
      /* surfaced via hook error */
    }
  }, [leaving, me, readyBusy, room?.status, setReady]);

  const handleLeave = useCallback(async () => {
    if (leaveLock.current) return;
    leaveLock.current = true;
    setLeaving(true);
    setActionError(null);
    try {
      await leaveRoom(roomId);
    } catch {
      /* still exit locally */
    } finally {
      clearActiveRoom();
      clearPendingH2HJoinCode();
      onLeft();
    }
  }, [onLeft, roomId]);

  if (disconnected) {
    return (
      <H2HDisconnectNotice
        onContinue={() => {
          void leaveRoom(roomId).catch(() => undefined);
          clearActiveRoom();
          clearPendingH2HJoinCode();
          onLeft();
        }}
      />
    );
  }

  if (loading && !room) {
    return <H2HLoadingScreen status="Opening lobby…" />;
  }

  const showError = actionError || error;
  const shareDisabled = !room?.room_code || leaving || inviteBusy;
  const readyDisabled = readyBusy || startBusy || leaving || !p2;

  return (
    <H2HLobbyShell className="h2h-lobby--waiting" ariaLabel="Waiting lobby">
      <header className="h2h-lobby__titles h2h-lobby__titles--code">
        <p className="h2h-lobby__kicker">ROOM CODE</p>
        <h1 className="h2h-lobby__code" aria-live="polite">
          {room?.room_code ?? '————'}
        </h1>
      </header>

      <div className="h2h-lobby__share-row">
        <button
          type="button"
          className="h2h-lobby__text-btn ui-tap"
          aria-disabled={shareDisabled}
          onPointerDown={press(() => void handleCopy(), shareDisabled)}
        >
          {copyFlash ? 'Copied' : 'Copy link'}
        </button>
        <span className="h2h-lobby__share-dot" aria-hidden>
          ·
        </span>
        <button
          type="button"
          className="h2h-lobby__text-btn ui-tap"
          aria-disabled={shareDisabled}
          onPointerDown={press(() => void handleInvite(), shareDisabled)}
        >
          {inviteBusy ? '…' : inviteFlash ?? 'Invite'}
        </button>
      </div>

      <section className="h2h-lobby__players" aria-live="polite">
        <p className="h2h-lobby__section-label">Players</p>
        <div className="h2h-lobby__slots">
          <PlayerSlot
            name={p1?.display_name ?? null}
            ready={Boolean(p1?.is_ready)}
            isHost={Boolean(p1 && room && p1.user_id === room.host_user_id)}
            isYou={Boolean(p1 && p1.user_id === userId)}
            emptyText="Open"
          />
          <PlayerSlot
            name={p2?.display_name ?? null}
            ready={Boolean(p2?.is_ready)}
            isHost={Boolean(p2 && room && p2.user_id === room.host_user_id)}
            isYou={Boolean(p2 && p2.user_id === userId)}
            emptyText="Waiting…"
          />
        </div>
      </section>

      {bothReady && room?.status === 'waiting' ? (
        <p className="h2h-lobby__hint" aria-live="polite">
          Starting…
        </p>
      ) : null}

      {me && room?.status === 'waiting' ? (
        <button
          type="button"
          className={`h2h-lobby__primary ui-tap${me.is_ready ? ' is-armed' : ''}`}
          disabled={readyDisabled}
          onPointerDown={press(() => void handleReadyToggle(), readyDisabled)}
        >
          {readyBusy ? '…' : me.is_ready ? 'Cancel ready' : 'Ready up'}
        </button>
      ) : null}

      {showError ? (
        <p className="h2h-lobby__error" role="alert">
          {showError}
        </p>
      ) : null}

      <button
        type="button"
        className="h2h-lobby__leave ui-tap"
        disabled={leaving}
        onPointerDown={press(() => void handleLeave(), leaving)}
      >
        {leaving ? 'Leaving…' : 'Leave lobby'}
      </button>
    </H2HLobbyShell>
  );
}

function PlayerSlot({
  name,
  ready,
  isHost,
  isYou,
  emptyText,
}: {
  name: string | null;
  ready: boolean;
  isHost: boolean;
  isYou: boolean;
  emptyText: string;
}) {
  const filled = Boolean(name);
  return (
    <div
      className={`h2h-lobby__seat${filled ? ' is-filled' : ''}${
        ready ? ' is-ready' : filled ? ' is-waiting' : ''
      }`}
    >
      <div className="h2h-lobby__seat-meta">
        {isYou ? <span className="h2h-lobby__seat-tag">You</span> : null}
        {isHost ? <span className="h2h-lobby__seat-tag">Host</span> : null}
      </div>
      <p className="h2h-lobby__seat-name">{name ?? emptyText}</p>
      {filled ? (
        <span className={`h2h-lobby__seat-state${ready ? ' is-on' : ''}`}>
          {ready ? 'Ready' : 'Not ready'}
        </span>
      ) : null}
    </div>
  );
}
