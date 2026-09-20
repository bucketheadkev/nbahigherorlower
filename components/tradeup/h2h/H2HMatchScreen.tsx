'use client';

import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clearActiveRoom } from '@/lib/multiplayer/activeRoom';
import { clearPendingH2HJoinCode } from '@/lib/multiplayer/h2hInvite';
import { leaveRoom } from '@/lib/multiplayer/rooms';
import { useH2HMatch } from '@/hooks/useH2HMatch';
import { IDLE_SHOWDOWN } from '@/lib/multiplayer/showdownCursor';
import { formatDollars } from '@/lib/tradeup/billionDollar';
import { hapticLight } from '@/lib/tradeup/haptics';
import {
  playH2HDefeatSound,
  playH2HVictorySound,
  prepareH2HEmojiAudio,
  warmH2HReactionSounds,
} from '@/lib/tradeup/h2hEmojiSound';
import {
  getAchievementSummary,
  notifyAchievementsUnlocked,
  processH2HMatchChallenges,
} from '@/lib/tradeup/challenges';
import { ChallengeCompleteToast } from '../ChallengeCompleteToast';
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
import { H2HLoadingScreen, H2HDisconnectNotice } from './H2HLobbyChrome';
import { H2HTradeUpMatch } from './H2HTradeUpMatch';
import { H2HKnockoutMatch } from './H2HKnockoutMatch';
import { H2HSoloStyleDraft } from './H2HSoloStyleDraft';
import { H2HShowdownSequence } from './H2HShowdownSequence';
import { H2HEmojiReactions, H2H_FINAL_EMOJIS } from './H2HEmojiReactions';
import { MoneyRain, RESULTS_POUR_TOTAL_MS } from '../MoneyRain';
import { GameBackground } from '../game/GameBackground';
import { getTeamColors, contrastOnPrimary } from '@/lib/tradeup/teamColors';
import type { H2HPickSelection, H2HRoundPublic } from '@/lib/multiplayer/h2hState';

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
  /** Previous match left showdown.finished set. Ignore it until this match starts one. */
  const [staleShowdown, setStaleShowdown] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const hadOpponentRef = useRef(false);

  useEffect(() => {
    if (!state) return;
    if (state.phase !== 'finished') {
      setRevealDone(false);
      if (state.showdown.finished) setStaleShowdown(true);
    } else if (!state.showdown.finished) {
      setStaleShowdown(false);
    }
  }, [state]);

  useEffect(() => {
    if (!lobby) return;
    if (lobby.players.length >= 2) hadOpponentRef.current = true;
  }, [lobby]);

  // Whoever remains sees the notice when the other player leaves (host or guest).
  useEffect(() => {
    if (!lobby || !state || disconnected) return;
    if (state.phase === 'finished' && revealDone) return;
    const abandoned = lobby.room.status === 'abandoned';
    const stillHere = lobby.players.some((p) => p.user_id === userId);
    const opponentGone =
      hadOpponentRef.current &&
      stillHere &&
      !lobby.players.some((p) => p.user_id !== userId) &&
      (lobby.room.status === 'playing' ||
        lobby.room.status === 'waiting' ||
        lobby.room.status === 'abandoned');
    if (!abandoned && !opponentGone) return;
    clearActiveRoom();
    clearPendingH2HJoinCode();
    setDisconnected(true);
  }, [disconnected, lobby, revealDone, state, userId]);

  const p1Name = state?.my_player_number === 1 ? myName : opponentName;
  const p2Name = state?.my_player_number === 2 ? myName : opponentName;

  const handleLeave = async () => {
    try {
      await leaveRoom(roomId);
    } catch {
      /* still exit */
    } finally {
      clearActiveRoom();
      clearPendingH2HJoinCode();
      onLeft();
    }
  };

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

  if (loading || !state) {
    return (
      <H2HLoadingScreen status={error ?? 'Preparing match…'} />
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
  const showdown =
    staleShowdown && state.showdown.finished ? IDLE_SHOWDOWN : state.showdown;

  if (
    state.phase === 'finished' &&
    !revealDone &&
    !showdown.finished &&
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
        showdown={showdown}
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
        myScore={myScore}
        iAmP1={iAmP1}
        rounds={state.resolved_rounds}
        bountyPosition={scoreBounty}
      >
        <div className="h2h-shell h2h-shell--arena">
          <GameBackground />
          <div
            className={`h2h-lobby h2h-lobby--guide h2h-lobby--results h2h-final${
              myWins ? ' is-win' : oppWins ? ' is-loss' : ''
            }`}
            aria-label="Final results"
          >
            <header className="h2h-final__verdict">
              <p className="h2h-final__kicker">FINAL</p>
              <h1 className={`h2h-final__title${myWins ? ' is-win' : oppWins ? ' is-loss' : ''}`}>
                {headline}
              </h1>
              <p className="h2h-final__margin">
                {myWins || oppWins
                  ? `by ${formatDollars(Math.abs(myScore - oppScore))}`
                  : 'Same total'}
              </p>
            </header>

            <div className="h2h-final__totals" aria-label="Team values">
              <div className={`h2h-final__total-pill${myWins ? ' is-win' : oppWins ? ' is-loss' : ''}`}>
                <span>{myNameFinal}</span>
                <strong>{formatDollars(myScore)}</strong>
              </div>
              <div className={`h2h-final__total-pill${oppWins ? ' is-win' : myWins ? ' is-loss' : ''}`}>
                <span>{oppNameFinal}</span>
                <strong>{formatDollars(oppScore)}</strong>
              </div>
            </div>

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

            {error ? (
              <p className="h2h-lobby__error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="h2h-final__actions">
              {isHost ? (
                <button
                  type="button"
                  className="h2h-lobby__primary ui-tap"
                  disabled={rematchBusy}
                  onPointerDown={(e: ReactPointerEvent) => {
                    e.preventDefault();
                    hapticLight();
                    void ackRematch();
                  }}
                >
                  {rematchBusy ? '…' : 'Run it back'}
                </button>
              ) : (
                <p className="h2h-final__waiting" role="status">
                  Waiting for rematch…
                </p>
              )}
              <button
                type="button"
                className="h2h-lobby__leave ui-tap"
                onPointerDown={(e: ReactPointerEvent) => {
                  e.preventDefault();
                  hapticLight();
                  void handleLeave();
                }}
              >
                Leave
              </button>
            </div>
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
  myScore,
  iAmP1,
  rounds,
  bountyPosition,
  children,
}: {
  myWins: boolean;
  oppWins: boolean;
  roomId: string;
  myPlayerNumber: 1 | 2;
  myScore: number;
  iAmP1: boolean;
  rounds: H2HRoundPublic[];
  bountyPosition: H2HPosition | null;
  children: ReactNode;
}) {
  const [emojiReady, setEmojiReady] = useState(false);
  const [toastReady, setToastReady] = useState(false);
  const [achievementQueue, setAchievementQueue] = useState<
    Array<{ id: string; completed: number; total: number }>
  >([]);
  const settledKey = useRef('');

  useEffect(() => {
    const key = `${roomId}:${myWins ? 'w' : oppWins ? 'l' : 't'}`;
    if (settledKey.current === key) return;
    settledKey.current = key;

    warmH2HReactionSounds();
    prepareH2HEmojiAudio();
    if (myWins) playH2HVictorySound();
    else if (oppWins) playH2HDefeatSound();

    const unlocked = processH2HMatchChallenges({
      roomId,
      won: myWins,
      myScore,
      rounds: rounds.map((round) => {
        const mine = displayedRoundValue(round, iAmP1 ? 'p1' : 'p2', bountyPosition, 2);
        const opp = displayedRoundValue(round, iAmP1 ? 'p2' : 'p1', bountyPosition, 2);
        const iWon =
          (iAmP1 && round.matchup_winner === 'p1') ||
          (!iAmP1 && round.matchup_winner === 'p2');
        return { mine, opp, iWon };
      }),
    });
    if (unlocked.length > 0) {
      notifyAchievementsUnlocked();
      const summary = getAchievementSummary();
      const alreadyShown = summary.completed - unlocked.length;
      setAchievementQueue(
        unlocked.map((id, index) => ({
          id,
          completed: alreadyShown + index + 1,
          total: summary.total,
        })),
      );
    }
  }, [bountyPosition, iAmP1, myScore, myWins, oppWins, roomId, rounds]);

  useEffect(() => {
    setToastReady(true);
  }, []);

  useEffect(() => {
    const delay = myWins ? RESULTS_POUR_TOTAL_MS + 350 : 900;
    const t = window.setTimeout(() => setEmojiReady(true), delay);
    return () => window.clearTimeout(t);
  }, [myWins]);

  const activeAchievement = achievementQueue[0] ?? null;

  return (
    <>
      {activeAchievement && toastReady
        ? createPortal(
            <ChallengeCompleteToast
              challengeId={activeAchievement.id}
              completed={activeAchievement.completed}
              total={activeAchievement.total}
              onDismiss={() => setAchievementQueue((queue) => queue.slice(1))}
            />,
            document.body,
          )
        : null}
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
