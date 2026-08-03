'use client';

import { motion } from 'framer-motion';

interface FranchiseHoverMenuProps {
  inStarting: boolean;
  inBench: boolean;
  inLineup: boolean;
  onMoveToStarting: () => void;
  onMoveToBench: () => void;
  onRemoveFromLineup: () => void;
  onSell: () => void;
}

export function FranchiseHoverMenu({
  inStarting,
  inBench,
  inLineup,
  onMoveToStarting,
  onMoveToBench,
  onRemoveFromLineup,
  onSell,
}: FranchiseHoverMenuProps) {
  return (
    <motion.div
      className="franchise-hover-menu"
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
    >
      {!inStarting ? (
        <button type="button" className="franchise-menu-btn" onClick={onMoveToStarting}>
          Move to Starting Five
        </button>
      ) : null}
      {!inBench ? (
        <button type="button" className="franchise-menu-btn" onClick={onMoveToBench}>
          Move to Bench
        </button>
      ) : null}
      {inLineup ? (
        <button type="button" className="franchise-menu-btn" onClick={onRemoveFromLineup}>
          Remove From Lineup
        </button>
      ) : null}
      <button type="button" className="franchise-menu-btn franchise-menu-btn--danger" onClick={onSell}>
        Sell Player
      </button>
    </motion.div>
  );
}
