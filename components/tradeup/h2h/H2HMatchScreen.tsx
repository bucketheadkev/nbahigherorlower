'use client';

import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useState } from 'react';
import { clearActiveRoom } from '@/lib/multiplayer/activeRoom';
import { leaveRoom } from '@/lib/multiplayer/rooms';
import { useH2HMatch } from '@/hooks/useH2HMatch';
import { formatDollars } from '@/lib/tradeup/billionDollar';
import { hapticLight } from '@/lib/tradeup/haptics';
import {
  playH2HDefeatSound,
  prepareH2HEmojiAudio,
} from '@/lib/tradeup/h2hEmojiSound';
import {
  isH2HGameMode,
  modeDef,
  type H2HGameMode,
} from '@/lib/multiplayer/gameModes';
import {
  displayedRoundValue,
  resolveBountyPosition,
  sumDisplayedRoster,
} from '@/lib/multiplayer/modeConfig';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import { H2HTradeUpMatch } from './H2HTradeUpMatch';
import { H2HKnockoutMatch } from './H2HKnockoutMatch';
import { H2HSoloStyleDraft } from './H2HSoloStyleDraft';
import { H2HShowdownSequence } from './H2HShowdownSequence';
import { H2HEmojiReactions, H2H_FINAL_EMOJIS } from './H2HEmojiReactions';
import { MoneyRain, RESULTS_POUR_TOTAL_MS } from '../MoneyRain';
import { GameBackground } from '../game/GameBackground';
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
    refetch,
  } = useH2HMatch({ roomId, userId });

  const [revealDone, setRevealDone] = useState(false);

  useEffect(() => {
    if (state?.phase !== 'finished') {
      setRevealDone(false);
    }
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
        onSynced={refetch}
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
  const scoreBounty = gameMode === 'bounty' ? bountyPosition : null;
  const rosterTotals = sumDisplayedRoster(state.resolved_rounds, scoreBounty, 2);

  if (
    state.phase === 'finished' &&
    !revealDone &&
    !state.showdown.finished &&
    state.resolved_rounds.length > 0
  ) {
    return (
      <H2HShowdownSequence
        roomId={roomId}
        rounds={state.resolved_rounds}
        p1Name={p1Name}
        p2Name={p2Name}
        myPlayerNumber={state.my_player_number}
        isHost={isHost}
        showdown={state.showdown}
        onSynced={refetch}
        bountyPosition={scoreBounty}
        onComplete={() => setRevealDone(true)}
      />
    );
  }

  if (state.phase === 'finished') {
    const scoreP1 = rosterTotals.p1;
    const scoreP2 = rosterTotals.p2;
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
        ? `${oppNameFinal} wins`
        : 'Tie';

    const myRounds = state.resolved_rounds.map((round) => ({
      position: round.position,
      selection: iAmP1 ? round.p1_selection : round.p2_selection,
      value: displayedRoundValue(round, iAmP1 ? 'p1' : 'p2', scoreBounty, 2),
    }));
    const oppRounds = state.resolved_rounds.map((round) => ({
      position: round.position,
      selection: iAmP1 ? round.p2_selection : round.p1_selection,
      value: displayedRoundValue(round, iAmP1 ? 'p2' : 'p1', scoreBounty, 2),
    }));

    return (
      <H2HFinalScreen
        myWins={myWins}
        oppWins={oppWins}
        roomId={roomId}
        myPlayerNumber={state.my_player_number}
      >
        <div className="h2h-shell h2h-shell--arena">
          <GameBackground />
          <div
            className={`h2h-lobby h2h-lobby--results h2h-final${
              myWins ? ' is-win' : oppWins ? ' is-loss' : ''
            }`}
            aria-label="Final results"
          >
            <header className="h2h-final__head">
              <div className="h2h-final__totals">
                <div className={`h2h-final__total-pill${myWins ? ' is-win' : oppWins ? ' is-loss' : ''}`}>
                  <span>{myNameFinal}</span>
                  <strong>{formatDollars(myScore)}</strong>
                </div>
                <div className={`h2h-final__total-pill${oppWins ? ' is-win' : myWins ? ' is-loss' : ''}`}>
                  <span>{oppNameFinal}</span>
                  <strong>{formatDollars(oppScore)}</strong>
                </div>
              </div>
            </header>

            <div className="h2h-final__boards">
              <FinalBoard
                label={myNameFinal}
                rounds={myRounds}
                winner={myWins}
                loser={oppWins}
              />
              <FinalBoard
                label={oppNameFinal}
                rounds={oppRounds}
                winner={oppWins}
                loser={myWins}
              />
            </div>

            <div className="h2h-final__verdict">
              <h1 className={`h2h-final__title${myWins ? ' is-win' : oppWins ? ' is-loss' : ''}`}>
                {headline}
              </h1>
              <p className="h2h-final__margin">
                {myWins || oppWins
                  ? `by ${formatDollars(Math.abs(myScore - oppScore))}`
                  : 'Same total'}
              </p>
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
  roomId,
  myPlayerNumber,
  children,
}: {
  myWins: boolean;
  oppWins: boolean;
  roomId: string;
  myPlayerNumber: 1 | 2;
  children: ReactNode;
}) {
  const [emojiReady, setEmojiReady] = useState(false);

  useEffect(() => {
    prepareH2HEmojiAudio();
    if (oppWins) {
      playH2HDefeatSound();
    }
    // After money rain / brief win-loss beat, reveal spam-able emojis.
    const delay = myWins ? RESULTS_POUR_TOTAL_MS + 350 : 900;
    const t = window.setTimeout(() => setEmojiReady(true), delay);
    return () => window.clearTimeout(t);
  }, [myWins, oppWins]);

  return (
    <>
      {myWins ? (
        <div className="h2h-win-celebration" aria-hidden>
          <MoneyRain intense mega durationMs={4200} />
        </div>
      ) : null}
      {children}
      {emojiReady ? (
        <div className="h2h-final__emoji-dock">
          <H2HEmojiReactions
            roomId={roomId}
            myPlayerNumber={myPlayerNumber}
            emojis={H2H_FINAL_EMOJIS}
            channelSuffix="final"
            enabled
            className="h2h-emoji--final"
          />
        </div>
      ) : null}
    </>
  );
}

function FinalBoard({
  label,
  rounds,
  winner,
  loser,
}: {
  label: string;
  rounds: Array<{ position: H2HPosition; selection: H2HPickSelection | null | undefined; value: number }>;
  winner: boolean;
  loser: boolean;
}) {
  return (
    <div
      className={`h2h-final__board${winner ? ' is-winner' : ''}${loser ? ' is-loser' : ''}`}
    >
      <p className="h2h-final__board-label">{label}</p>
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
              <em style={{ color: ink }}>{formatDollars(row.value)}</em>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
