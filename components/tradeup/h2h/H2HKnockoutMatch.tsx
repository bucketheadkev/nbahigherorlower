'use client';

import { type PointerEvent as ReactPointerEvent, useEffect, useState } from 'react';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { H2H_POSITIONS, type H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import { hapticLight } from '@/lib/tradeup/haptics';
import type { H2HMatchState, H2HPickSelection, H2HRoundPublic } from '@/lib/multiplayer/h2hState';
import { getTeamColors, contrastOnPrimary } from '@/lib/tradeup/teamColors';
import { GameBackground } from '../game/GameBackground';
import { H2HSoloStyleDraft } from './H2HSoloStyleDraft';
import { H2HShowdownSequence } from './H2HShowdownSequence';

export interface H2HKnockoutMatchProps {
  roomId: string;
  state: H2HMatchState;
  myName: string;
  opponentName: string;
  lockBusy: boolean;
  continueBusy: boolean;
  rematchBusy: boolean;
  isHost: boolean;
  error: string | null;
  onSynced: () => Promise<void>;
  onLock: (position: H2HPosition, selection: H2HPickSelection, rawValue: number) => Promise<void>;
  onMove: (
    from: H2HPosition,
    to: H2HPosition,
    selection: H2HPickSelection,
    rawValue: number,
  ) => Promise<void>;
  onContinue: () => void;
  onRematch: () => void;
  onExit: () => void;
}

export function H2HKnockoutMatch({
  roomId,
  state,
  myName,
  opponentName,
  rematchBusy,
  isHost,
  error,
  onSynced,
  onLock,
  onMove,
  onRematch,
  onExit,
}: H2HKnockoutMatchProps) {
  const myNum = state.my_player_number;
  const myPicks = state.my_picks ?? [];
  const [revealDone, setRevealDone] = useState(false);

  useEffect(() => {
    if (state.phase !== 'finished') {
      setRevealDone(false);
    }
  }, [state.phase]);

  const orderedRounds = H2H_POSITIONS.map((pos) =>
    state.resolved_rounds.find((r) => r.position === pos),
  ).filter((r): r is H2HRoundPublic => Boolean(r?.matchup_resolved));

  const p1Wins = orderedRounds.filter((r) => r.matchup_winner === 'p1').length;
  const p2Wins = orderedRounds.filter((r) => r.matchup_winner === 'p2').length;
  const gameFinished = state.phase === 'finished' && orderedRounds.length > 0;

  if (state.phase !== 'finished') {
    return (
      <H2HSoloStyleDraft
        modeTitle="KNOCKOUT"
        myName={myName}
        opponentName={opponentName}
        myPicks={myPicks}
        opponentPickCount={state.opponent_pick_count ?? 0}
        error={error}
        onLock={onLock}
        onMove={onMove}
        onExit={onExit}
      />
    );
  }

  if (!gameFinished) {
    return (
      <div className="h2h-shell h2h-shell--arena">
        <GameBackground />
        <div className="h2h-lobby">
          <p className="h2h-lobby__status">Loading results…</p>
        </div>
      </div>
    );
  }

  const p1Name = myNum === 1 ? myName : opponentName;
  const p2Name = myNum === 2 ? myName : opponentName;

  if (!revealDone && !state.showdown.finished) {
    return (
      <H2HShowdownSequence
        roomId={roomId}
        rounds={state.resolved_rounds}
        p1Name={p1Name}
        p2Name={p2Name}
        myPlayerNumber={myNum}
        isHost={isHost}
        showdown={state.showdown}
        onSynced={onSynced}
        scoreFormatter={(rounds) => ({
          p1: rounds.filter((r) => r.matchup_winner === 'p1').length,
          p2: rounds.filter((r) => r.matchup_winner === 'p2').length,
        })}
        formatScore={(n) => `${n} W`}
        onComplete={() => setRevealDone(true)}
      />
    );
  }

  const myWins = myNum === 1 ? p1Wins : p2Wins;
  const oppWins = myNum === 1 ? p2Wins : p1Wins;
  const iWonGame = myWins > oppWins;
  const tie = myWins === oppWins;

  return (
    <div className="h2h-shell h2h-shell--arena" aria-label="Knockout final">
      <GameBackground />
      <div className="h2h-lobby h2h-lobby--results ko-results">
        <header className="h2h-lobby__header">
          <p className="h2h-lobby__eyebrow">KNOCKOUT</p>
          <h1 className="h2h-lobby__title">
            {tie ? 'TIE' : iWonGame ? 'YOU WIN' : 'OPPONENT WINS'}
          </h1>
          <p className="h2h-lobby__subtitle">
            {myName} {myWins} — {oppWins} {opponentName}
          </p>
        </header>

        <div className="h2h-final__boards ko-results__boards">
          <KoBoard
            label="You"
            rounds={orderedRounds}
            myNum={myNum}
            side="me"
          />
          <KoBoard
            label={opponentName.split(/\s+/)[0] ?? 'Opp'}
            rounds={orderedRounds}
            myNum={myNum}
            side="opp"
          />
        </div>

        <div className="h2h-final__verdict">
          <p className="h2h-final__margin">
            {tie
              ? 'Even on positions'
              : iWonGame
                ? `by ${myWins - oppWins} position${myWins - oppWins === 1 ? '' : 's'}`
                : `by ${oppWins - myWins} position${oppWins - myWins === 1 ? '' : 's'}`}
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
              void onRematch();
            }}
          >
            <strong>{rematchBusy ? 'STARTING…' : 'RUN IT BACK'}</strong>
          </button>
        ) : (
          <p className="h2h-lobby__waiting h2h-lobby__waiting--ready">Waiting for host…</p>
        )}

        <button
          type="button"
          className="run-btn run-btn--secondary h2h-lobby__submit"
          onPointerDown={(e: ReactPointerEvent) => {
            e.preventDefault();
            hapticLight();
            void onExit();
          }}
        >
          <strong>BACK TO 1V1</strong>
        </button>
      </div>
    </div>
  );
}

function KoBoard({
  label,
  rounds,
  myNum,
  side,
}: {
  label: string;
  rounds: H2HRoundPublic[];
  myNum: 1 | 2;
  side: 'me' | 'opp';
}) {
  return (
    <div className="h2h-final__board">
      <p className="h2h-final__board-label">{label}</p>
      <ul className="h2h-final__list">
        {H2H_POSITIONS.map((pos) => {
          const r = rounds.find((rd) => rd.position === pos);
          if (!r) return null;
          const pick =
            side === 'me'
              ? myNum === 1
                ? r.p1_selection
                : r.p2_selection
              : myNum === 1
                ? r.p2_selection
                : r.p1_selection;
          const val =
            side === 'me'
              ? myNum === 1
                ? r.p1_raw_value
                : r.p2_raw_value
              : myNum === 1
                ? r.p2_raw_value
                : r.p1_raw_value;
          const colors = pick ? getTeamColors(pick.teamId) : { primary: '#10202b' };
          const ink = contrastOnPrimary(colors.primary);
          return (
            <li key={pos} style={{ background: colors.primary, color: ink }}>
              <span style={{ color: ink, opacity: 0.78 }}>{pos}</span>
              <strong style={{ color: ink }}>{pick?.name ?? '—'}</strong>
              <em style={{ color: ink }}>
                {val != null ? formatDollarsExact(val) : '—'}
              </em>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
