'use client';

import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useState } from 'react';
import { clearActiveRoom } from '@/lib/multiplayer/activeRoom';
import { leaveRoom } from '@/lib/multiplayer/rooms';
import { useH2HMatch } from '@/hooks/useH2HMatch';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { hapticLight } from '@/lib/tradeup/haptics';
import {
  playH2HDefeatSound,
  playH2HVictorySound,
  prepareH2HEmojiAudio,
} from '@/lib/tradeup/h2hEmojiSound';
import {
  isH2HGameMode,
  modeDef,
  type H2HGameMode,
} from '@/lib/multiplayer/gameModes';
import { bountyAdjustedTotal, resolveBountyPosition } from '@/lib/multiplayer/modeConfig';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import { H2HTradeUpMatch } from './H2HTradeUpMatch';
import { H2HKnockoutMatch } from './H2HKnockoutMatch';
import { H2HSoloStyleDraft } from './H2HSoloStyleDraft';
import { H2HRevealSequence } from './H2HRevealSequence';
import { getTeamColors, contrastOnPrimary } from '@/lib/tradeup/teamColors';
import type { H2HPickSelection } from '@/lib/multiplayer/h2hState';

interface H2HMatchScreenProps {
  roomId: string;
  userId: string;
  onLeft: () => void;
}

export function H2HMatchScreen({ roomId, userId, onLeft }: H2HMatchScreenProps) {
  const {
    state,
    loading,
    error,
    lockBusy,
    continueBusy,
    rematchBusy,
    lobby,
    myName,
    opponentName,
    lockPick,
    movePick,
    ackContinue,
    ackRematch,
  } = useH2HMatch({ roomId, userId });

  const [revealDone, setRevealDone] = useState(false);

  useEffect(() => {
    if (state?.phase !== 'finished') setRevealDone(false);
  }, [state?.phase]);

  const p1Name = state?.my_player_number === 1 ? myName : opponentName;
  const p2Name = state?.my_player_number === 2 ? myName : opponentName;

  const handleLeave = async () => {
    try {
      await leaveRoom(roomId);
    } catch {
      /* still exit */
    } finally {
      clearActiveRoom();
      onLeft();
    }
  };

  if (loading || !state) {
    return (
      <div className="h2h-lobby" aria-label="Loading match">
        <p className="h2h-lobby__status">{error ?? 'Loading match…'}</p>
      </div>
    );
  }

  // Prefer lobby room mode (source of truth). If state still defaults to classic
  // while the lobby has a paid mode, keep the lobby mode.
  const lobbyMode = isH2HGameMode(lobby?.room.game_mode) ? lobby!.room.game_mode : null;
  const stateMode = isH2HGameMode(state.game_mode) ? state.game_mode : null;
  const gameMode: H2HGameMode =
    (lobbyMode && lobbyMode !== 'classic' ? lobbyMode : null) ??
    (stateMode && stateMode !== 'classic' ? stateMode : null) ??
    lobbyMode ??
    stateMode ??
    'classic';
  if (gameMode === 'tradeUp') {
    return (
      <H2HTradeUpMatch
        roomId={roomId}
        userId={userId}
        myPlayerNumber={state.my_player_number}
        myName={myName}
        opponentName={opponentName}
        modeSeed={state.mode_seed}
        modeConfig={state.mode_config}
        phase={state.phase}
        isHost={lobby?.room.host_user_id === userId}
        rematchBusy={rematchBusy}
        error={error}
        onRematch={() => void ackRematch()}
        onExit={() => void handleLeave()}
      />
    );
  }

  if (gameMode === 'knockout') {
    return (
      <H2HKnockoutMatch
        roomId={roomId}
        state={state}
        myName={myName}
        opponentName={opponentName}
        lockBusy={lockBusy}
        continueBusy={continueBusy}
        rematchBusy={rematchBusy}
        isHost={lobby?.room.host_user_id === userId}
        error={error}
        onLock={(position, selection, rawValue) => lockPick(position, selection, rawValue)}
        onMove={(from, to, selection, rawValue) => movePick(from, to, selection, rawValue)}
        onContinue={() => { if (lobby?.room.host_user_id === userId) void ackContinue(); }}
        onRematch={() => void ackRematch()}
        onExit={() => void handleLeave()}
      />
    );
  }

  const isHost = lobby?.room.host_user_id === userId;
  const modeMeta = modeDef(gameMode);
  const bountyPosition: H2HPosition = resolveBountyPosition(state.mode_config, roomId, state.mode_seed);
  const bountyTotals =
    gameMode === 'bounty'
      ? bountyAdjustedTotal(state.resolved_rounds, bountyPosition, 2)
      : { p1: state.p1_total, p2: state.p2_total };

  if (state.phase === 'finished' && !revealDone && state.resolved_rounds.length > 0) {
    return (
      <H2HRevealSequence
        roomId={roomId}
        rounds={state.resolved_rounds}
        p1Name={p1Name}
        p2Name={p2Name}
        myPlayerNumber={state.my_player_number}
        isHost={isHost}
        scoreFormatter={
          gameMode === 'bounty'
            ? (rounds) => bountyAdjustedTotal(rounds, bountyPosition, 2)
            : undefined
        }
        onComplete={() => setRevealDone(true)}
      />
    );
  }

  if (state.phase === 'finished') {
    const scoreP1 = gameMode === 'bounty' ? bountyTotals.p1 : state.p1_total;
    const scoreP2 = gameMode === 'bounty' ? bountyTotals.p2 : state.p2_total;
    const p1Wins = scoreP1 > scoreP2;
    const p2Wins = scoreP2 > scoreP1;
    const iAmP1 = state.my_player_number === 1;
    const myNameFinal = iAmP1 ? p1Name : p2Name;
    const oppNameFinal = iAmP1 ? p2Name : p1Name;
    const myScore = iAmP1 ? scoreP1 : scoreP2;
    const oppScore = iAmP1 ? scoreP2 : scoreP1;
    const myWins = iAmP1 ? p1Wins : p2Wins;
    const oppWins = iAmP1 ? p2Wins : p1Wins;
    const headline = myWins
      ? 'You win'
      : oppWins
        ? `${oppNameFinal.split(/\s+/)[0] ?? oppNameFinal} wins`
        : 'Tie';

    const myRounds = state.resolved_rounds.map((round) => ({
      position: round.position,
      selection: iAmP1 ? round.p1_selection : round.p2_selection,
      value: iAmP1
        ? round.p1_raw_value ?? round.p1_adjusted_value ?? 0
        : round.p2_raw_value ?? round.p2_adjusted_value ?? 0,
    }));
    const oppRounds = state.resolved_rounds.map((round) => ({
      position: round.position,
      selection: iAmP1 ? round.p2_selection : round.p1_selection,
      value: iAmP1
        ? round.p2_raw_value ?? round.p2_adjusted_value ?? 0
        : round.p1_raw_value ?? round.p1_adjusted_value ?? 0,
    }));

    return (
      <H2HFinalScreen myWins={myWins} oppWins={oppWins}>
      <div className="h2h-lobby h2h-lobby--results h2h-final" aria-label="Final results">
        <header className="h2h-final__head">
          <h1 className={`h2h-final__title${myWins ? ' is-win' : oppWins ? ' is-loss' : ''}`}>
            {headline}
          </h1>
        </header>

        <div className="h2h-final__boards">
          <FinalBoard
            label="You"
            name={myNameFinal}
            total={myScore}
            rounds={myRounds}
            winner={myWins}
          />
          <FinalBoard
            label={oppNameFinal.split(/\s+/)[0] ?? 'Opp'}
            name={oppNameFinal}
            total={oppScore}
            rounds={oppRounds}
            winner={oppWins}
          />
        </div>
        {error ? (
          <p className="h2h-lobby__error" role="alert">
            {error}
          </p>
        ) : null}
        {isHost ? (
          <button
            type="button"
            className="run-btn run-btn--primary h2h-lobby__submit"
            disabled={rematchBusy}
            onPointerDown={(e: ReactPointerEvent) => {
              e.preventDefault();
              hapticLight();
              void ackRematch();
            }}
          >
            <strong>{rematchBusy ? '…' : 'Run it back'}</strong>
          </button>
        ) : (
          <p className="h2h-lobby__waiting h2h-lobby__waiting--ready" role="status">
            Waiting…
          </p>
        )}
        <button
          type="button"
          className="run-btn run-btn--secondary h2h-lobby__submit"
          onPointerDown={(e: ReactPointerEvent) => {
            e.preventDefault();
            hapticLight();
            void handleLeave();
          }}
        >
          <strong>Leave</strong>
        </button>
      </div>
      </H2HFinalScreen>
    );
  }

  // Classic / Bounty: solo-style spin draft for all five, then results.
  return (
    <H2HSoloStyleDraft
      modeTitle={modeMeta.title}
      myName={myName}
      opponentName={opponentName}
      myPicks={state.my_picks ?? []}
      opponentPickCount={state.opponent_pick_count ?? 0}
      lockBusy={lockBusy}
      error={error}
      onLock={(position, selection, raw) => lockPick(position, selection, raw)}
      onMove={(from, to, selection, raw) => movePick(from, to, selection, raw)}
      onExit={() => void handleLeave()}
    />
  );
}

function H2HFinalScreen({
  myWins,
  oppWins,
  children,
}: {
  myWins: boolean;
  oppWins: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    prepareH2HEmojiAudio();
    if (myWins) playH2HVictorySound();
    else if (oppWins) playH2HDefeatSound();
  }, [myWins, oppWins]);
  return children;
}

function FinalBoard({
  label,
  name,
  total,
  rounds,
  winner,
}: {
  label: string;
  name: string;
  total: number;
  rounds: Array<{ position: H2HPosition; selection: H2HPickSelection | null | undefined; value: number }>;
  winner: boolean;
}) {
  return (
    <div className={`h2h-final__board${winner ? ' is-winner' : ''}`}>
      <p className="h2h-final__board-label">{label}</p>
      <p className="h2h-final__total">{formatDollarsExact(total)}</p>
      <ul className="h2h-final__list">
        {rounds.map((row) => {
          const colors = row.selection
            ? getTeamColors(row.selection.teamId)
            : { primary: '#10202b' };
          const ink = contrastOnPrimary(colors.primary);
          return (
            <li
              key={row.position}
              style={{ background: colors.primary, color: ink }}
            >
              <span style={{ color: ink, opacity: 0.78 }}>{row.position}</span>
              <strong style={{ color: ink }}>{row.selection?.name ?? '—'}</strong>
              <em style={{ color: ink }}>{formatDollarsExact(row.value)}</em>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
