'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { progressFromTotalXp, type LevelProgress } from '@/lib/tradeup/xp';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';

interface XpProgressBarProps {
  progress: LevelProgress;
  levelLabel: string;
  /** Optional live "+N XP" callout (reference style). */
  gainedXp?: number | null;
  /** Animate fill toward this lifetime XP (defaults to progress.totalXp). */
  animateToTotalXp?: number | null;
  /** Start fill from this lifetime XP (for post-run sequences). */
  animateFromTotalXp?: number | null;
  compact?: boolean;
  className?: string;
}

/**
 * Slim striped XP meter matching the reference recording:
 * parallelogram track, orange/gold diagonal fill, XP totals under the bar.
 */
export function XpProgressBar({
  progress,
  levelLabel,
  gainedXp = null,
  animateToTotalXp = null,
  animateFromTotalXp = null,
  compact = false,
  className = '',
}: XpProgressBarProps) {
  const reduceMotion = getPrefersReducedMotion();
  const targetTotal = animateToTotalXp ?? progress.totalXp;
  const startTotal = animateFromTotalXp ?? targetTotal;
  const start = progressFromTotalXp(startTotal);
  const end = progressFromTotalXp(targetTotal);

  // When leveling within one animation, fill to 100% of the starting segment then settle on end.
  const crossed = end.level > start.level;

  // Level changed while mounted (XP landed after the bar appeared): pop the number + glow once.
  const prevLevel = useRef(end.level);
  const [leveledUp, setLeveledUp] = useState(false);
  useEffect(() => {
    if (end.level > prevLevel.current) {
      setLeveledUp(true);
      const id = window.setTimeout(() => setLeveledUp(false), 1800);
      prevLevel.current = end.level;
      return () => window.clearTimeout(id);
    }
    prevLevel.current = end.level;
  }, [end.level]);
  const fillFrom = start.fill;
  const fillTo = crossed ? 1 : end.fill;

  return (
    <div
      className={`xp-meter${compact ? ' is-compact' : ''}${leveledUp ? ' is-level-up' : ''} ${className}`.trim()}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={end.xpForNext}
      aria-valuenow={end.xpIntoLevel}
      aria-label={`${levelLabel} ${end.level}`}
    >
      <div className="xp-meter__row">
        <span className="xp-meter__lvl">
          {levelLabel}{' '}
          <motion.strong
            key={end.level}
            initial={leveledUp && !reduceMotion ? { scale: 1.7, opacity: 0.4 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 15 }}
          >
            {end.level}
          </motion.strong>
        </span>
        <div className="xp-meter__bar-wrap">
          <div className="xp-meter__track" aria-hidden>
            <motion.div
              className="xp-meter__fill"
              initial={reduceMotion ? false : { scaleX: fillFrom }}
              animate={{ scaleX: Math.max(0.02, Math.min(1, fillTo)) }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 1.05, ease: [0.22, 0.9, 0.28, 1] }
              }
              style={{ transformOrigin: 'left center' }}
            />
          </div>
          {gainedXp != null && gainedXp > 0 ? (
            <motion.span
              className="xp-meter__gain"
              initial={reduceMotion ? false : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.28, delay: 0.12 }}
            >
              +{gainedXp.toLocaleString('en-US')} XP
            </motion.span>
          ) : null}
        </div>
      </div>
      <p className="xp-meter__totals">
        {end.xpIntoLevel.toLocaleString('en-US')}
        <span> / </span>
        {end.xpForNext.toLocaleString('en-US')} XP
      </p>
    </div>
  );
}
