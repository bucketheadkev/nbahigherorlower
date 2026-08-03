'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { TradePlayer } from '@/lib/tradeup/types';
import {
  computeWheelLandingRotation,
  getPlayerLastName,
  getSTierSpinWheelPlayers,
} from '@/lib/tradeup/sTierSpin';
import { getSellValue, formatCredits } from '@/lib/tradeup/credits';
import { getTeam } from '@/lib/tradeup/teams';
import { TierBadge } from '../TierBadge';
import { PlayerHeadshot } from '../PlayerHeadshot';
import { TeamLogo } from '../TeamLogo';

interface STierSpinWheelModalProps {
  winner: TradePlayer;
  winnerIndex: number;
  onComplete: () => void;
  onViewCollection: () => void;
  onClose: () => void;
  onLand?: () => void;
}

const SPIN_DURATION_MS = 5000;

export function STierSpinWheelModal({
  winner,
  winnerIndex,
  onComplete,
  onViewCollection,
  onClose,
  onLand,
}: STierSpinWheelModalProps) {
  const reduceMotion = useGameReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<'spinning' | 'result'>('spinning');
  const landedRef = useRef(false);

  const wheelPlayers = useMemo(() => getSTierSpinWheelPlayers(), []);
  const segmentAngle = 360 / wheelPlayers.length;
  const targetRotation = computeWheelLandingRotation(winnerIndex, wheelPlayers.length);
  const team = getTeam(winner.teamId);
  const sellValue = getSellValue(winner);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setPhase('result');
      onLand?.();
      onComplete();
      return;
    }

    const landTimer = window.setTimeout(() => {
      if (!landedRef.current) {
        landedRef.current = true;
        onLand?.();
        setPhase('result');
        onComplete();
      }
    }, SPIN_DURATION_MS + 150);

    return () => window.clearTimeout(landTimer);
  }, [reduceMotion, onComplete, onLand]);

  if (!mounted) return null;

  return createPortal(
    <div className="game-trade-overlay spin-wheel-overlay" role="presentation">
      <div className="spin-wheel-backdrop" aria-hidden />
      <div className="spin-wheel-modal" role="dialog" aria-modal="true" aria-labelledby="spin-wheel-title">
        <h2 id="spin-wheel-title" className="spin-wheel-modal__title">
          {phase === 'spinning' ? 'S-Tier Spin' : 'S-Tier Player Acquired'}
        </h2>

        {phase === 'spinning' ? (
          <div className="spin-wheel-stage">
            <div className="spin-wheel__pointer" aria-hidden />
            <motion.div
              className="spin-wheel"
              initial={{ rotate: 0 }}
              animate={{ rotate: targetRotation }}
              transition={{
                duration: reduceMotion ? 0 : SPIN_DURATION_MS / 1000,
                ease: [0.12, 0.85, 0.22, 1],
              }}
            >
              <div
                className="spin-wheel__disc"
                style={{
                  background: `conic-gradient(from -90deg, ${wheelPlayers
                    .map((_, i) => {
                      const shade = i % 2 === 0 ? 'rgba(212, 175, 55, 0.22)' : 'rgba(15, 28, 52, 0.92)';
                      const start = i * segmentAngle;
                      const end = (i + 1) * segmentAngle;
                      return `${shade} ${start}deg ${end}deg`;
                    })
                    .join(', ')})`,
                }}
              />
              {wheelPlayers.map((player, index) => {
                const angle = index * segmentAngle + segmentAngle / 2;
                return (
                  <div
                    key={player.id}
                    className="spin-wheel__label"
                    style={{ transform: `rotate(${angle}deg) translateY(-7.35rem)` }}
                  >
                    <div
                      className="spin-wheel__label-inner"
                      style={{ transform: `rotate(${-angle}deg)` }}
                    >
                      <PlayerHeadshot
                        name={player.name}
                        teamId={player.teamId}
                        playerId={player.id}
                        headshotUrl={player.headshotUrl}
                        size="xs"
                      />
                      <span className="spin-wheel__segment-name">{getPlayerLastName(player.name)}</span>
                      <span className="spin-wheel__segment-tier">S</span>
                    </div>
                  </div>
                );
              })}
              <div className="spin-wheel__hub" aria-hidden />
            </motion.div>
          </div>
        ) : (
          <motion.div
            className="spin-result"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <p className="spin-result__eyebrow">S-Tier Player Acquired</p>
            <PlayerHeadshot
              name={winner.name}
              teamId={winner.teamId}
              playerId={winner.id}
              headshotUrl={winner.headshotUrl}
              size="modal"
            />
            <h3 className="spin-result__name">{winner.name}</h3>
            <div className="spin-result__meta">
              <TeamLogo teamId={winner.teamId} abbreviation={winner.teamId} size="sm" />
              <span>{team?.fullName ?? winner.teamId}</span>
            </div>
            <TierBadge tier="S" size="large" />
            <p className="spin-result__collection">Added to My Collection</p>
            <p className="spin-result__sell">Sell value: {formatCredits(sellValue)} credits</p>
            <div className="spin-result__actions">
              <button type="button" className="store-spin-card__action" onClick={onViewCollection}>
                View in My Collection
              </button>
              <button type="button" className="game-trade-modal__cancel" onClick={onClose}>
                Close
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>,
    document.body,
  );
}
