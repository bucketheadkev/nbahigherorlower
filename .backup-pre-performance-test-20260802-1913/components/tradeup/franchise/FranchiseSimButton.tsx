'use client';

import { motion } from 'framer-motion';

interface FranchiseSimButtonProps {
  canSimulate: boolean;
  isSimulating: boolean;
  startersFilled: number;
  benchFilled: number;
  onSimulate: () => void;
}

export function FranchiseSimButton({
  canSimulate,
  isSimulating,
  startersFilled,
  benchFilled,
  onSimulate,
}: FranchiseSimButtonProps) {
  return (
    <div className="franchise-sim-wrap">
      <motion.button
        type="button"
        className={`tu-btn tu-btn--primary franchise-sim-cta${canSimulate ? '' : ' is-locked'}`}
        onClick={onSimulate}
        disabled={!canSimulate || isSimulating}
        aria-label="Simulate 82-Game Season"
        whileHover={canSimulate && !isSimulating ? { y: -1 } : undefined}
        whileTap={canSimulate && !isSimulating ? { scale: 0.985 } : undefined}
      >
        {isSimulating ? 'Simulating…' : 'Simulate Season'}
      </motion.button>
      {!canSimulate ? (
        <p className="franchise-sim-hint">
          Complete lineup · Starters {startersFilled}/5 · Bench {benchFilled}/5
        </p>
      ) : null}
    </div>
  );
}
