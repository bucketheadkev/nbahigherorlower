'use client';

import { motion } from 'framer-motion';
import { formatCredits } from '@/lib/tradeup/credits';
import { S_TIER_SPIN_COST } from '@/lib/tradeup/sTierSpin';
import { TierBadge } from '../TierBadge';

interface STierSpinCardProps {
  credits: number;
  allOwned: boolean;
  onSpin: () => void;
}

export function STierSpinCard({ credits, allOwned, onSpin }: STierSpinCardProps) {
  const canAfford = credits >= S_TIER_SPIN_COST;
  const disabled = allOwned || !canAfford;

  let actionLabel = 'Spin Now';
  if (allOwned) {
    actionLabel = 'All S-Tier Owned';
  } else if (!canAfford) {
    actionLabel = 'Not Enough Credits';
  }

  return (
    <motion.article
      className="store-spin-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
    >
      <div className="store-spin-card__body">
        <div className="store-spin-card__header">
          <TierBadge tier="S" size="large" />
        </div>
        <h3 className="store-spin-card__title">S-Tier Spin</h3>
        <p className="store-spin-card__subtitle">One random S-tier player for your collection.</p>
        <div className="store-spin-card__footer">
          <span className="store-spin-card__price">{formatCredits(S_TIER_SPIN_COST)} Credits</span>
          <button
            type="button"
            className="tu-btn tu-btn--primary"
            disabled={disabled}
            onClick={onSpin}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </motion.article>
  );
}
