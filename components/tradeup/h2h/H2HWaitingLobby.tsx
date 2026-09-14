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
  shareH2HInvite,
} from '@/lib/multiplayer/h2hInvite';
import { leaveRoom } from '@/lib/multiplayer/rooms';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';
import { modeDef, type H2HGameMode } from '@/lib/multiplayer/gameModes';

interface H2HWaitingLobbyProps {
  roomId: string;
  userId: string;
  onLeft: () => void;
  /** Fired when Supabase room.status becomes playing (host + guest). */
  onPlaying: () => void;
  /** Host-selected mode while lobby row catches up. */
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
  preferredMode,
}: H2HWaitingLobbyProps) {
  const { snapshot, loading, error, setReady, readyBusy, startGame, startBusy } = useRoomLobby({
    roomId,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyFlash, setCopyFlash] = useState(false);
  const [inviteFlash, setInviteFlash] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const leaveLock = useRef(false);
  const transitioned = useRef(false);
  const autoStartAttempted = useRef(false);
  const onPlayingRef = useRef(onPlaying);
  onPlayingRef.current = onPlaying;

  const room = snapshot?.room ?? null;
  const players = snapshot?.players ?? [];
  const p1 = slotFor(players, 1);
  const p2 = slotFor(players, 2);
  const me = players.find((p) => p.user_id === userId) ?? null;
  const bothReady = Boolean(p1?.is_ready && p2?.is_ready && p1 && p2);
  const modeLabel = modeDef(
    (room?.game_mode && room.game_mode !== 'classic'
      ? room.game_mode
      : null) ??
      (preferredMode && preferredMode !== 'classic' ? preferredMode : null) ??
      room?.game_mode ??
      preferredMode ??
      'classic',
  );

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
          setInviteFlash('Invite link copied');
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
      onLeft();
    }
  }, [onLeft, roomId]);

  const showError = actionError || error;
  const shareDisabled = !room?.room_code || leaving || inviteBusy;

  return (
    <div className="h2h-lobby h2h-lobby--waiting" aria-label="Waiting lobby">
      <header className="h2h-lobby__header">
        <p className="h2h-lobby__eyebrow">{modeLabel.title}</p>
        <h1 className="h2h-lobby__code" aria-live="polite">
          {room?.room_code ?? (loading ? '····' : '————')}
        </h1>
      </header>

      <div className="h2h-lobby__share-row">
        <button
          type="button"
          className="h2h-lobby__chip-btn ui-tap"
          aria-disabled={shareDisabled}
          onPointerDown={press(() => void handleCopy(), shareDisabled)}
        >
          {copyFlash ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          className="h2h-lobby__chip-btn h2h-lobby__chip-btn--accent ui-tap"
          aria-disabled={shareDisabled}
          onPointerDown={press(() => void handleInvite(), shareDisabled)}
        >
          {inviteBusy ? '…' : inviteFlash ?? 'Invite'}
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

      {me && room?.status === 'waiting' ? (
        <button
          type="button"
          className={`run-btn ${me.is_ready ? 'run-btn--secondary' : 'run-btn--primary'} h2h-lobby__submit ui-tap`}
          disabled={readyBusy || startBusy || leaving || !p2}
          onPointerDown={press(
            () => void handleReadyToggle(),
            readyBusy || startBusy || leaving || !p2,
          )}
        >
          <strong>
            {readyBusy ? '…' : me.is_ready ? 'Unready' : 'Ready'}
          </strong>
        </button>
      ) : null}

      {bothReady && room?.status === 'waiting' ? (
        <p className="h2h-lobby__waiting h2h-lobby__waiting--ready" aria-live="polite">
          Starting match…
        </p>
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
