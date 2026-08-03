'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FranchiseData } from '@/lib/tradeup/franchise/types';
import {
  SEASON_GAME_MILESTONES,
  SEASON_SIM_DURATION_MS,
  SEASON_SIM_MESSAGES,
  getFranchiseRatings,
  gameMilestoneForProgress,
  interpolateSimStats,
  messageIndexForProgress,
  type SeasonSimulationResult,
} from '@/lib/tradeup/franchise/seasonSim';
import type { PlayerTier } from '@/lib/tradeup/tiers';
import { TierBadge } from '../TierBadge';
import { useSound } from '@/hooks/useSound';

interface SeasonSimulatorProps {
  franchise: FranchiseData;
  franchiseTier: PlayerTier | null;
  result: SeasonSimulationResult | null;
  phase: 'idle' | 'simulating' | 'results';
  onClose: () => void;
  onSimulateAgain: () => void;
  onAnimationComplete: () => void;
}

const CHAMPION_OUTCOME = 'NBA Champions';

export function SeasonSimulator({
  franchise,
  franchiseTier,
  result,
  phase,
  onClose,
  onSimulateAgain,
  onAnimationComplete,
}: SeasonSimulatorProps) {
  const { playSeasonSimulation, playChampionship } = useSound();
  const ratings = useMemo(
    () => getFranchiseRatings(franchise, franchiseTier),
    [franchise, franchiseTier],
  );

  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [gameMilestone, setGameMilestone] = useState(1);
  const [liveStats, setLiveStats] = useState({
    projectedWins: 41,
    projectedLosses: 41,
    offensiveRating: 108,
    defensiveRating: 112,
    chemistry: 72,
    playoffProbability: 48,
  });

  const noiseSeedRef = useRef(Date.now());
  const simSoundPlayedRef = useRef(false);

  useEffect(() => {
    if (phase !== 'simulating' || !result) return;

    noiseSeedRef.current = Date.now();
    simSoundPlayedRef.current = false;
    setProgress(0);
    setMessageIndex(0);
    setGameMilestone(1);

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / SEASON_SIM_DURATION_MS);
      setProgress(t);
      setMessageIndex(messageIndexForProgress(t));
      setGameMilestone(gameMilestoneForProgress(t));
      setLiveStats(interpolateSimStats(result, t, noiseSeedRef.current));

      if (!simSoundPlayedRef.current && t > 0.02) {
        simSoundPlayedRef.current = true;
        playSeasonSimulation();
      }

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setLiveStats({
          projectedWins: result.wins,
          projectedLosses: result.losses,
          offensiveRating: result.offensiveRating,
          defensiveRating: result.defensiveRating,
          chemistry: Math.round(result.chemistryScore * 100),
          playoffProbability: result.playoffProbability,
        });
        onAnimationComplete();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, result, onAnimationComplete, playSeasonSimulation]);

  useEffect(() => {
    if (phase === 'results' && result?.playoffResult === CHAMPION_OUTCOME) {
      playChampionship();
    }
  }, [phase, result, playChampionship]);

  if (phase === 'idle') return null;

  const isChampion = result?.playoffResult === CHAMPION_OUTCOME;

  return (
    <AnimatePresence>
      <motion.div
        className="season-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        {phase === 'simulating' && ratings ? (
          <motion.div
            className="season-sim-panel"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <div className="season-sim-header">
              <span className="season-sim-eyebrow">Season projection</span>
              <h2 className="season-sim-title">My Franchise</h2>
              <div className="season-sim-ratings">
                <div className="season-sim-rating">
                  <span className="season-sim-rating-label">Overall</span>
                  <span className="season-sim-rating-value">{ratings.overallRating}</span>
                </div>
                <div className="season-sim-rating">
                  <span className="season-sim-rating-label">Starting 5</span>
                  <span className="season-sim-rating-value">{ratings.startingRating}</span>
                </div>
                <div className="season-sim-rating">
                  <span className="season-sim-rating-label">Bench</span>
                  <span className="season-sim-rating-value">{ratings.benchRating}</span>
                </div>
                <div className="season-sim-rating season-sim-rating--tier">
                  <span className="season-sim-rating-label">Team tier</span>
                  {ratings.teamTier ? (
                    <TierBadge tier={ratings.teamTier} size="default" />
                  ) : (
                    <span className="season-sim-rating-value">—</span>
                  )}
                </div>
              </div>
            </div>

            <div className="season-sim-progress-wrap">
              <div className="season-sim-progress-track">
                <motion.div
                  className="season-sim-progress-fill"
                  style={{ width: `${progress * 100}%` }}
                />
                <div className="season-sim-progress-scan" aria-hidden />
              </div>
              <p className="season-sim-message">{SEASON_SIM_MESSAGES[messageIndex]}</p>
            </div>

            <div className="season-sim-timeline" aria-label="Season progress">
              {SEASON_GAME_MILESTONES.map((game) => {
                const active = gameMilestone >= game;
                return (
                  <div
                    key={game}
                    className={`season-sim-milestone${active ? ' season-sim-milestone--active' : ''}`}
                  >
                    <span className="season-sim-milestone-dot" aria-hidden />
                    <span className="season-sim-milestone-label">Game {game}</span>
                  </div>
                );
              })}
            </div>

            <div className="season-sim-live-grid">
              <div className="season-sim-live-stat">
                <span className="season-sim-live-label">Projected W</span>
                <span className="season-sim-live-value">{liveStats.projectedWins}</span>
              </div>
              <div className="season-sim-live-stat">
                <span className="season-sim-live-label">Projected L</span>
                <span className="season-sim-live-value">{liveStats.projectedLosses}</span>
              </div>
              <div className="season-sim-live-stat">
                <span className="season-sim-live-label">Off. rating</span>
                <span className="season-sim-live-value">{liveStats.offensiveRating}</span>
              </div>
              <div className="season-sim-live-stat">
                <span className="season-sim-live-label">Def. rating</span>
                <span className="season-sim-live-value">{liveStats.defensiveRating}</span>
              </div>
              <div className="season-sim-live-stat">
                <span className="season-sim-live-label">Chemistry</span>
                <span className="season-sim-live-value">{liveStats.chemistry}%</span>
              </div>
              <div className="season-sim-live-stat">
                <span className="season-sim-live-label">Playoff prob.</span>
                <span className="season-sim-live-value">{liveStats.playoffProbability}%</span>
              </div>
            </div>
          </motion.div>
        ) : null}

        {phase === 'results' && result ? (
          <motion.div
            className={`season-results${isChampion ? ' season-results--champion' : ''}`}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            {isChampion ? (
              <div className="season-results-trophy" aria-hidden>
                🏆
              </div>
            ) : null}

            <span className="season-results-eyebrow">Season complete</span>
            <h2 className="season-results-record">
              {result.conferenceSeed !== null
                ? `${result.record} · ${result.seedLabel}`
                : result.record}
            </h2>
            {result.conferenceSeed === null ? (
              <p className="season-results-seed">{result.seedLabel}</p>
            ) : null}

            <div className="season-results-playoff">
              <span className="season-results-playoff-label">Playoff result</span>
              <span className="season-results-playoff-value">{result.playoffResult}</span>
            </div>

            <div className="season-results-grid">
              <div className="season-stat">
                <span className="season-stat-label">Off. rating</span>
                <span className="season-stat-value">{result.offensiveRating}</span>
              </div>
              <div className="season-stat">
                <span className="season-stat-label">Def. rating</span>
                <span className="season-stat-value">{result.defensiveRating}</span>
              </div>
              <div className="season-stat">
                <span className="season-stat-label">Chemistry</span>
                <span className="season-stat-value">{result.chemistryGrade}</span>
              </div>
              <div className="season-stat">
                <span className="season-stat-label">Season grade</span>
                <span className="season-stat-value season-stat-value--grade">
                  <TierBadge tier={result.seasonGrade} size="default" />
                </span>
              </div>
            </div>

            <p className="season-results-summary">{result.summary}</p>

            <div className="season-results-actions">
              <button
                type="button"
                className="btn-ghost season-results-again"
                onClick={onSimulateAgain}
              >
                Simulate Again
              </button>
              <button type="button" className="btn-primary season-results-close" onClick={onClose}>
                Close Results
              </button>
            </div>
          </motion.div>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}
