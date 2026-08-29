'use client';

import { type PointerEvent as ReactPointerEvent, useEffect, useState } from 'react';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { H2H_POSITIONS, type H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import { hapticLight } from '@/lib/tradeup/haptics';
import type { H2HMatchState, H2HPickSelection, H2HRoundPublic } from '@/lib/multiplayer/h2hState';
import { H2HSoloStyleDraft } from './H2HSoloStyleDraft';
import { H2HRevealSequence } from './H2HRevealSequence';

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
  lockBusy,
  rematchBusy,
  isHost,
  error,
  onLock,
  onMove,
  onRematch,
  onExit,
}: H2HKnockoutMatchProps) {
  const myNum = state.my_player_number;
  const myPicks = state.my_picks ?? [];
  const [revealDone, setRevealDone] = useState(false);

  useEffect(() => {
    if (state.phase !== 'finished') setRevealDone(false);
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
      <div className="h2h-lobby">
        <p className="h2h-lobby__status">Loading results…</p>
      </div>
    );
  }

  const p1Name = myNum === 1 ? myName : opponentName;
  const p2Name = myNum === 2 ? myName : opponentName;

  if (!revealDone) {
    return (
      <H2HRevealSequence
        roomId={roomId}
        rounds={state.resolved_rounds}
        p1Name={p1Name}
        p2Name={p2Name}
        myPlayerNumber={myNum}
        isHost={isHost}
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
    <div className="h2h-lobby h2h-lobby--results ko-results" aria-label="Knockout final">
      <header className="h2h-lobby__header">
        <p className="h2h-lobby__eyebrow">KNOCKOUT</p>
        <h1 className="h2h-lobby__title">
          {tie ? 'TIE' : iWonGame ? 'YOU WIN' : 'OPPONENT WINS'}
        </h1>
        <p className="h2h-lobby__subtitle">
          {myName} {myWins} — {oppWins} {opponentName}
        </p>
      </header>

      <div className="ko-results__breakdown">
        {H2H_POSITIONS.map((pos) => {
          const r = orderedRounds.find((rd) => rd.position === pos);
          if (!r) return null;
          const myVal = myNum === 1 ? r.p1_raw_value : r.p2_raw_value;
          const oppVal = myNum === 1 ? r.p2_raw_value : r.p1_raw_value;
          const myPickR = myNum === 1 ? r.p1_selection : r.p2_selection;
          const oppPickR = myNum === 1 ? r.p2_selection : r.p1_selection;
          const myWonRound = r.matchup_winner === (myNum === 1 ? 'p1' : 'p2');
          const tieRound = r.matchup_winner === 'tie';
          return (
            <div
              key={pos}
              className={`ko-results__row${myWonRound ? ' is-win' : tieRound ? '' : ' is-lose'}`}
            >
              <span className="ko-results__pos">{pos}</span>
              <span className="ko-results__name">{myPickR?.name ?? '—'}</span>
              <span className="ko-results__val">
                {myVal != null ? formatDollarsExact(myVal) : '—'}
              </span>
              <span
                className={`ko-results__dot${myWonRound ? ' is-win' : tieRound ? ' is-tie' : ' is-lose'}`}
              >
                {myWonRound ? '✓' : tieRound ? '=' : '✕'}
              </span>
              <span className="ko-results__val ko-results__val--opp">
                {oppVal != null ? formatDollarsExact(oppVal) : '—'}
              </span>
              <span className="ko-results__name ko-results__name--opp">
                {oppPickR?.name ?? '—'}
              </span>
            </div>
          );
        })}
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
  );
}
