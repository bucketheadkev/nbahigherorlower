'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { motion } from 'framer-motion';

interface LivesIndicatorProps {
  lives: number;
  max: number;
}

function LifeIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <circle
        cx="8"
        cy="8"
        r="6.25"
        fill={active ? 'rgba(196, 92, 74, 0.2)' : 'transparent'}
        stroke={active ? 'rgba(196, 92, 74, 0.75)' : 'rgba(255,255,255,0.18)'}
        strokeWidth="1.25"
      />
      <path
        d="M8 4.5c-1.2 0-2.2 1-2.2 2.2 0 1.6 2.2 3.8 2.2 3.8s2.2-2.2 2.2-3.8C10.2 5.5 9.2 4.5 8 4.5z"
        fill={active ? 'rgba(196, 92, 74, 0.85)' : 'rgba(255,255,255,0.15)'}
      />
    </svg>
  );
}

export function LivesIndicator({ lives, max }: LivesIndicatorProps) {
  const reduceMotion = useGameReducedMotion();

  return (
    <div className="game-lives" aria-label={`${lives} of ${max} lives remaining`}>
      <span className="game-lives__label">Lives</span>
      <div className="game-lives__icons">
        {Array.from({ length: max }).map((_, i) => (
          <motion.span
            key={i}
            className="game-lives__icon"
            initial={false}
            animate={
              reduceMotion
                ? { opacity: i < lives ? 1 : 0.25 }
                : {
                    opacity: i < lives ? 1 : 0.25,
                    scale: i < lives ? 1 : 0.88,
                  }
            }
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          >
            <LifeIcon active={i < lives} />
          </motion.span>
        ))}
      </div>
      <span className="game-lives__count" aria-hidden>
        {lives}
      </span>
    </div>
  );
}
