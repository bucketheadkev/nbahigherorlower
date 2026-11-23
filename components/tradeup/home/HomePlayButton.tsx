'use client';

import { motion } from 'framer-motion';
import type { MouseEventHandler } from 'react';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';

interface HomePlayButtonProps {
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

/**
 * Classic-arena SPIN twin — same orange gloss + spinning light sweep,
 * labeled PLAY for the home plate.
 */
export function HomePlayButton({ label, onClick }: HomePlayButtonProps) {
  const reduce = getPrefersReducedMotion();

  return (
    <motion.button
      type="button"
      className="home-play home-play--classic"
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
    >
      <span className="home-play__spin" aria-hidden />
      <span className="home-play__gloss" aria-hidden />
      <span className="home-play__spark home-play__spark--a" aria-hidden />
      <span className="home-play__spark home-play__spark--b" aria-hidden />
      <span className="home-play__spark home-play__spark--c" aria-hidden />
      <span className="home-play__label">{label}</span>
    </motion.button>
  );
}
