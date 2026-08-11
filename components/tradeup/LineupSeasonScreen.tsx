'use client';

import { useEffect, useRef, useState } from 'react';
import type { SeasonRecord } from '@/lib/tradeup/lineupSeason';
import {
  deriveSeasonStanding,
  formatSeedLabel,
  championshipOddsPercent,
} from '@/lib/tradeup/seasonStanding';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import { useSound } from '@/hooks/useSound';
import { GameBackground } from './game/GameBackground';
import { BallionWordmark } from './BallionWordmark';
import { PerfectSeasonCelebration } from './PerfectSeasonCelebration';
import { PlayerCardVisual } from './PlayerCardVisual';
import { formatUserTeamLabel, type UserTeamIdentity } from '@/lib/tradeup/userTeam';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';

interface LineupSeasonScreenProps {
  players: Array<{ slot: Position; player: TradePlayer }>;
  record: SeasonRecord | null;
  userTeam?: UserTeamIdentity | null;
  simulationComplete: boolean;
  onBeginSimulation: () => void;
  onCompleteSimulation: () => boolean;
  onStartNewRun: () => void;
  onProceedToPlayoffs?: () => void;
  onEnterPlayIn?: () => void;
  onExit?: () => void;
}

export function LineupSeasonScreen({
  players,
  record,
  userTeam = null,
  simulationComplete,
  onBeginSimulation,
  onCompleteSimulation,
  onStartNewRun,
  onProceedToPlayoffs,
  onEnterPlayIn,
  onExit,
}: LineupSeasonScreenProps) {
  const [isNewBest, setIsNewBest] = useState(false);
  const [isPerfectSeason, setIsPerfectSeason] = useState(
    Boolean(record && record.wins === 82 && record.losses === 0),
  );
  const [showRingDrop, setShowRingDrop] = useState(
    Boolean(record && record.wins === 82 && record.losses === 0 && !simulationComplete),
  );
  const completedRef = useRef(simulationComplete);
  const { playChampionship, playAccept } = useSound();

  useEffect(() => {
    onBeginSimulation();
  }, [onBeginSimulation]);

  useEffect(() => {
    if (!record) return;
    if (record.wins + record.losses !== 82) return;

    const perfect = record.wins === 82 && record.losses === 0;
    setIsPerfectSeason(perfect);

    if (!completedRef.current) {
      completedRef.current = true;
      const newBest = onCompleteSimulation();
      setIsNewBest(newBest);
      setShowRingDrop(perfect);
      if (perfect || record.wins >= 55) playChampionship();
      else playAccept();
    } else {
      setShowRingDrop(false);
    }
  }, [onCompleteSimulation, playAccept, playChampionship, record]);

  useEffect(() => {
    if (!isPerfectSeason || !showRingDrop) return;
    const timer = window.setTimeout(() => setShowRingDrop(false), 2200);
    return () => window.clearTimeout(timer);
  }, [isPerfectSeason, showRingDrop]);

  const standing = record ? deriveSeasonStanding(record.wins, record.losses) : null;
  const madePlayoffsBanner = Boolean(standing && standing.berth !== 'missed');
  const titleOdds =
    record && standing
      ? championshipOddsPercent(record.wins, record.analysis.lineupScore, standing.seed)
      : 0;

  if (!record || !standing) {
    return (
      <div className="tradeup-shell season-screen season-screen--final">
        <GameBackground />
        <main className="season-screen__content">
          <header className="season-screen__header">
            <BallionWordmark />
            <p className="season-screen__eyebrow">Postseason Path</p>
            <h1 className="season-screen__title">Season Complete</h1>
            <p className="season-screen__team">{formatUserTeamLabel(userTeam)}</p>
          </header>
          <p className="season-loading">Calculating season…</p>
        </main>
      </div>
    );
  }

  return (
    <div
      className={`tradeup-shell season-screen season-screen--final${
        isPerfectSeason ? ' season-screen--perfect' : ''
      }`}
    >
      <GameBackground />
      <div className="season-screen__arena" aria-hidden />

      {isPerfectSeason ? <PerfectSeasonCelebration active={showRingDrop} /> : null}

      <main className="season-screen__content">
        <header className="season-screen__header">
          <BallionWordmark />
          <p className="season-screen__eyebrow">Postseason Path</p>
          <h1 className="season-screen__title">
            {isPerfectSeason ? 'Perfect Season' : 'Season Complete'}
          </h1>
          <p className="season-screen__team">{formatUserTeamLabel(userTeam)}</p>
        </header>

        <section className="season-preview-stats" aria-live="polite">
          <div className="season-preview-stats__record">
            <span>Record</span>
            <strong>
              {record.wins}–{record.losses}
            </strong>
          </div>
          <div className="season-preview-stats__seed">
            <span>Seed</span>
            <strong>{formatSeedLabel(standing.seed)}</strong>
          </div>
          <div className="season-preview-stats__odds">
            <span>Title odds</span>
            <strong>{titleOdds}%</strong>
          </div>
        </section>

        {isNewBest ? <p className="season-final__new-best">New Best Record</p> : null}

        <section className="season-lineup season-lineup--broadcast" aria-label="Starting five">
          {players.map(({ slot, player }, index) => (
            <div
              key={slot}
              className="season-player season-player--card"
              style={{ '--season-index': index } as React.CSSProperties}
            >
              <PlayerCardVisual player={player} slot={slot} variant="full" size="sm" />
              <p className="season-player__meta">
                <span>{POSITION_LABELS[slot]}</span>
                <strong>{player.name}</strong>
              </p>
            </div>
          ))}
          <div className="season-lineup__connections" aria-hidden />
        </section>

        {madePlayoffsBanner ? (
          <div
            className={`season-playoff-banner season-playoff-banner--${standing.berth}`}
            aria-live="assertive"
          >
            <span className="season-playoff-banner__burst" aria-hidden />
            <strong>
              {standing.berth === 'playoffs' ? 'MADE THE PLAYOFFS' : 'PLAY-IN TOURNAMENT'}
            </strong>
            <p>
              {standing.berth === 'playoffs'
                ? `${formatSeedLabel(standing.seed)} — automatic berth`
                : `${formatSeedLabel(standing.seed)} — win your way in`}
            </p>
          </div>
        ) : (
          <p className="season-final__classification">Missed the playoffs</p>
        )}

        <div className="season-screen__actions season-screen__actions--sticky">
          {onProceedToPlayoffs ? (
            <button
              type="button"
              className="tu-btn tu-btn--primary season-screen__action season-screen__action--primary"
              onClick={onProceedToPlayoffs}
            >
              Enter the Playoffs
            </button>
          ) : onEnterPlayIn ? (
            <button
              type="button"
              className="tu-btn tu-btn--primary season-screen__action season-screen__action--primary"
              onClick={onEnterPlayIn}
            >
              Enter Play-In Tournament
            </button>
          ) : (
            <>
              <button
                type="button"
                className="tu-btn tu-btn--primary season-screen__action season-screen__action--primary"
                onClick={onStartNewRun}
              >
                Build Another Dynasty
              </button>
              {onExit ? (
                <button
                  type="button"
                  className="tu-btn tu-btn--secondary season-screen__action"
                  onClick={onExit}
                >
                  Home
                </button>
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
