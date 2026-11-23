'use client';

import { motion } from 'framer-motion';
import type { LevelProgress } from '@/lib/tradeup/xp';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';

interface HomeProfileXpProps {
  progress: LevelProgress;
}

/** Compact LV + orange fill under the home username (reference top chrome). */
export function HomeProfileXp({ progress }: HomeProfileXpProps) {
  const reduce = getPrefersReducedMotion();
  const fill = Math.max(0.04, Math.min(1, progress.fill));

  return (
    <div
      className="rh4-pxp"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={progress.xpForNext}
      aria-valuenow={progress.xpIntoLevel}
      aria-label={`Level ${progress.level}`}
    >
      <span className="rh4-pxp__lvl">LV. {progress.level}</span>
      <span className="rh4-pxp__track" aria-hidden>
        <motion.span
          className="rh4-pxp__fill"
          initial={false}
          animate={{ scaleX: fill }}
          transition={reduce ? { duration: 0 } : { duration: 0.7, ease: [0.22, 0.9, 0.28, 1] }}
          style={{ transformOrigin: 'left center' }}
        />
      </span>
    </div>
  );
}
