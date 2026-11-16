'use client';

import { motion } from 'framer-motion';
import type { LevelProgress } from '@/lib/tradeup/xp';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';

interface HomeXpModuleProps {
  progress: LevelProgress;
}

/** Home XP strip — gold hex level + blue fill (official reference). */
export function HomeXpModule({ progress }: HomeXpModuleProps) {
  const reduce = getPrefersReducedMotion();
  const fill = Math.max(0.04, Math.min(1, progress.fill));

  return (
    <div
      className="home-xp"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={progress.xpForNext}
      aria-valuenow={progress.xpIntoLevel}
      aria-label={`Level ${progress.level}`}
    >
      <div className="home-xp__hex" aria-hidden={false}>
        <svg viewBox="0 0 56 56" width="44" height="44" aria-hidden>
          <defs>
            <linearGradient id="home-xp-hex" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffe29a" />
              <stop offset="0.5" stopColor="#f0a820" />
              <stop offset="1" stopColor="#c87810" />
            </linearGradient>
          </defs>
          <path
            d="M28 3 L50 15.5 V40.5 L28 53 L6 40.5 V15.5 Z"
            fill="#0b1428"
            stroke="url(#home-xp-hex)"
            strokeWidth="2.4"
          />
        </svg>
        <strong className="home-xp__level">{progress.level}</strong>
      </div>
      <div className="home-xp__body">
        <p className="home-xp__totals">
          {progress.xpIntoLevel.toLocaleString('en-US')}
          <span> / </span>
          {progress.xpForNext.toLocaleString('en-US')} XP
        </p>
        <div className="home-xp__track">
          <motion.div
            className="home-xp__fill"
            initial={false}
            animate={{ scaleX: fill }}
            transition={reduce ? { duration: 0 } : { duration: 0.85, ease: [0.22, 0.9, 0.28, 1] }}
            style={{ transformOrigin: 'left center' }}
          />
        </div>
      </div>
    </div>
  );
}
