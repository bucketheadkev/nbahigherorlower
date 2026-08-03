'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { motion } from 'framer-motion';

interface HomeCommandNavProps {
  onPlay: () => void;
  onStore: () => void;
  onFranchise: () => void;
}

export function HomeCommandNav({ onPlay, onStore, onFranchise }: HomeCommandNavProps) {
  const reduceMotion = useGameReducedMotion();
  const hover = reduceMotion ? undefined : { y: -1, transition: { duration: 0.18 } };
  const tap = reduceMotion ? undefined : { scale: 0.985, transition: { duration: 0.08 } };

  return (
    <nav className="home-menu__nav" aria-label="Main menu">
      <motion.button
        type="button"
        className="home-menu__trade"
        onClick={onPlay}
        aria-label="Trade"
        whileHover={hover}
        whileTap={tap}
      >
        Trade
      </motion.button>

      <div className="home-menu__secondary">
        <motion.button
          type="button"
          className="home-menu__secondary-btn"
          onClick={onFranchise}
          aria-label="My Franchise"
          whileHover={hover}
          whileTap={tap}
        >
          My Franchise
        </motion.button>
        <motion.button
          type="button"
          className="home-menu__secondary-btn"
          onClick={onStore}
          aria-label="Store"
          whileHover={hover}
          whileTap={tap}
        >
          Store
        </motion.button>
      </div>
    </nav>
  );
}
