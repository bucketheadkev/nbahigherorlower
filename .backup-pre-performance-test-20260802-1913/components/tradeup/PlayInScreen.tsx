'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  advancePlayInGame,
  createPlayInState,
  playInSeedLabel,
  startPlayIn,
  type PlayInSeed,
  type PlayInState,
} from '@/lib/tradeup/playIn';
import { useSound } from '@/hooks/useSound';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { GameBackground } from './game/GameBackground';
import { TradeUpLogo } from './TradeUpLogo';
import { formatUserTeamLabel, type UserTeamIdentity } from '@/lib/tradeup/userTeam';

interface PlayInScreenProps {
  seed: PlayInSeed;
  lineupScore: number;
  seasonWins: number;
  seasonLosses: number;
  userTeam?: UserTeamIdentity | null;
  onClinched: () => void;
  onEliminatedHome: () => void;
  onPlayAgain: () => void;
}

function delayMs(reduceMotion: boolean): number {
  return reduceMotion ? 320 : 900;
}

export function PlayInScreen({
  seed,
  lineupScore,
  seasonWins,
  seasonLosses,
  userTeam = null,
  onClinched,
  onEliminatedHome,
  onPlayAgain,
}: PlayInScreenProps) {
  const [state, setState] = useState<PlayInState>(() => createPlayInState(seed, lineupScore));
  const [simulating, setSimulating] = useState(false);
  const timerRef = useRef<number | null>(null);
  const { resume, playTap, playVictory, playDefeat, playAccept } = useSound();

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const runNextGame = useCallback(() => {
    if (simulating) return;
    resume();
    playTap();
    const reduceMotion = getPrefersReducedMotion();
    setSimulating(true);
    setState((current) =>
      current.phase === 'ready' ? startPlayIn(current) : { ...current, phase: 'playing' },
    );

    timerRef.current = window.setTimeout(() => {
      setState((current) => {
        const next = advancePlayInGame(
          current.phase === 'ready' ? startPlayIn(current) : current,
        );
        if (next.phase === 'clinched') playVictory();
        else if (next.phase === 'eliminated') playDefeat();
        setSimulating(false);
        return next;
      });
    }, delayMs(reduceMotion));
  }, [simulating, resume, playTap, playVictory, playDefeat]);

  const needsTwo = seed >= 9;

  return (
    <div className={`tradeup-shell playin-screen playin-screen--${state.phase}`}>
      <GameBackground />

      <main className="playin-screen__content">
        <header className="playin-screen__header">
          <TradeUpLogo size="xs" className="game-screen-brand" />
          <p className="playin-screen__eyebrow">Play-In Tournament</p>
          <h1 className="playin-screen__title">{playInSeedLabel(seed)}</h1>
          <p className="playin-screen__season">
            {formatUserTeamLabel(userTeam)} · {seasonWins}–{seasonLosses}
          </p>
        </header>

        <section className="playin-rules" aria-live="polite">
          <p>
            {needsTwo
              ? 'As a 9th/10th seed you must win two games in a row.'
              : 'As a 7th/8th seed, win once to clinch. Lose once and you get one last chance.'}
          </p>
        </section>

        <section className="playin-series" aria-live="polite">
          <div className="playin-series__games">
            {(needsTwo ? [0, 1] : [0, 1]).map((index) => {
              const result = state.games[index];
              return (
                <span
                  key={index}
                  className={result ? `is-${result.toLowerCase()}` : ''}
                >
                  {result ?? `G${index + 1}`}
                </span>
              );
            })}
          </div>
          <p className="playin-series__status">{state.status}</p>
          {simulating ? <p className="playin-series__live">Simulating…</p> : null}
        </section>

        {state.phase === 'ready' || state.phase === 'playing' ? (
          <button
            type="button"
            className="tu-btn tu-btn--primary playin-cta"
            onClick={runNextGame}
            disabled={simulating}
          >
            {state.games.length === 0 ? 'Play Play-In Game' : 'Play Next Game'}
          </button>
        ) : null}

        {state.phase === 'clinched' ? (
          <section className="playin-result playin-result--win">
            <h2>Playoffs</h2>
            <p>You survived the play-in.</p>
            <button type="button" className="tu-btn tu-btn--primary playin-cta" onClick={onClinched}>
              Proceed to Playoffs
            </button>
          </section>
        ) : null}

        {state.phase === 'eliminated' ? (
          <section className="playin-result playin-result--loss">
            <h2>Eliminated</h2>
            <p>The play-in ends your season.</p>
            <div className="playin-screen__actions">
              <button
                type="button"
                className="tu-btn tu-btn--primary"
                onClick={() => {
                  playAccept();
                  onPlayAgain();
                }}
              >
                Run It Back
              </button>
              <button type="button" className="tu-btn tu-btn--secondary" onClick={onEliminatedHome}>
                Home
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
