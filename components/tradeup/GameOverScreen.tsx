'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { TradePlayer } from '@/lib/tradeup/types';
import { calculateGMScore } from '@/lib/tradeup/gmScore';
import { getPlayerTier } from '@/lib/tradeup/tiers';
import { buildShareText } from '@/lib/tradeup/storage';

interface GameOverScreenProps {
  tradePath: TradePlayer[];
  tradesCompleted: number;
  rejectionsUsed: number;
  onPlayAgain: () => void;
  onHome: () => void;
}

function useCountUp(target: number, duration = 1400) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    setValue(0);
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };

    const frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

export function GameOverScreen({
  tradePath,
  tradesCompleted,
  rejectionsUsed,
  onPlayAgain,
  onHome,
}: GameOverScreenProps) {
  const finalPlayer = tradePath[tradePath.length - 1];
  const { score, title } = useMemo(
    () => calculateGMScore(tradePath, tradesCompleted, rejectionsUsed),
    [tradePath, tradesCompleted, rejectionsUsed],
  );
  const animatedScore = useCountUp(score);
  const names = tradePath.map((p) => p.name);

  const handleShare = async () => {
    const text = buildShareText(names, tradesCompleted, score, title);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Trade Up', text });
        return;
      } catch {
        /* fall through */
      }
    }
    await navigator.clipboard.writeText(text);
  };

  return (
    <motion.div
      className="game-over"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <motion.div
        className="game-over-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32, delay: 0.05 }}
      >
        <span className="game-over-label">Game over</span>

        <div className="gm-score-block">
          <span className="gm-score-label">GM Score</span>
          <p className="gm-score-value">{animatedScore}</p>
          <p className="gm-score-title">{title}</p>
        </div>

        <div className="game-over-stats game-over-stats--compact">
          <div className="game-over-stat">
            <span className="game-over-stat-value">{tradesCompleted}</span>
            <span className="game-over-stat-label">Successful trades</span>
          </div>
          <div className="game-over-stat">
            <span className="game-over-stat-value">{finalPlayer ? getPlayerTier(finalPlayer) : '—'}</span>
            <span className="game-over-stat-label">Final tier</span>
          </div>
        </div>

        {finalPlayer ? (
          <div className="game-over-final-block">
            <span className="game-over-stat-label">Final player</span>
            <p className="game-over-final">{finalPlayer.name}</p>
          </div>
        ) : null}

        <div className="trade-path">
          <span className="game-over-stat-label">Trade path</span>
          {tradePath.map((player, i) => (
            <div key={`${player.id}-${i}`} className="trade-path-row">
              {i > 0 ? <span className="trade-path-arrow">↓</span> : null}
              <span
                className={
                  i === tradePath.length - 1
                    ? 'trade-path-name trade-path-name--final'
                    : 'trade-path-name'
                }
              >
                {player.name}
              </span>
            </div>
          ))}
        </div>

        <div className="game-over-actions">
          <motion.button
            type="button"
            className="btn-primary"
            onClick={handleShare}
            whileTap={{ scale: 0.97 }}
          >
            Share score
          </motion.button>
          <motion.button
            type="button"
            className="btn-ghost"
            onClick={onPlayAgain}
            whileTap={{ scale: 0.97 }}
          >
            Play again
          </motion.button>
          <motion.button
            type="button"
            className="btn-ghost"
            onClick={onHome}
            whileTap={{ scale: 0.97 }}
          >
            Home
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
