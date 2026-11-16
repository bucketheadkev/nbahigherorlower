'use client';

import { motion } from 'framer-motion';
import type { MouseEventHandler } from 'react';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';

interface HomePlayButtonProps {
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

/** Hero PLAY CTA — premium glow + shimmer (tasteful, not tacky). */
export function HomePlayButton({ label, onClick }: HomePlayButtonProps) {
  const reduce = getPrefersReducedMotion();

  return (
    <motion.button
      type="button"
      className="home-play home-play--alive"
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.985, y: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
    >
      <span className="home-play__glow" aria-hidden />
      <span className="home-play__shimmer" aria-hidden />
      <span className="home-play__spark home-play__spark--a" aria-hidden />
      <span className="home-play__spark home-play__spark--b" aria-hidden />
      <span className="home-play__spark home-play__spark--c" aria-hidden />
      <span className="home-play__label">{label}</span>
    </motion.button>
  );
}
