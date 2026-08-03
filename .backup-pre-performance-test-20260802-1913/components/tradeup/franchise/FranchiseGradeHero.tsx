'use client';

import { motion } from 'framer-motion';
import type { PlayerTier } from '@/lib/tradeup/tiers';
import { TierBadge } from '../TierBadge';

interface FranchiseGradeHeroProps {
  franchiseTier: PlayerTier | null;
  tierImproved: boolean;
  collectionSize: number;
  lineupFilled: number;
  lineupTotal: number;
}

const TIER_COPY: Record<PlayerTier, string> = {
  GOAT: 'All-time dynasty',
  S: 'Championship caliber',
  A: 'Contender status',
  B: 'Playoff bound',
  C: 'Developing core',
  D: 'Rebuild mode',
  F: 'Foundation building',
};

export function FranchiseGradeHero({
  franchiseTier,
  tierImproved,
  collectionSize,
  lineupFilled,
  lineupTotal,
}: FranchiseGradeHeroProps) {
  return (
    <motion.section
      className="franchise-grade-hero franchise-grade-hero--compact"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="franchise-grade-content franchise-grade-content--compact">
        <div className="franchise-grade-main">
          <div className="franchise-grade-badge-wrap">
            {franchiseTier ? (
              <motion.div
                key={franchiseTier}
                animate={tierImproved ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={{ duration: 0.45 }}
              >
                <TierBadge tier={franchiseTier} size="large" />
              </motion.div>
            ) : (
              <span className="franchise-grade-empty">—</span>
            )}
          </div>
          <p className="franchise-grade-tagline">
            {franchiseTier ? TIER_COPY[franchiseTier] : 'Fill your lineup to earn a grade'}
          </p>
        </div>
        <dl className="home-menu__meta franchise-grade-meta" aria-label="Roster summary">
          <div className="home-menu__stat">
            <dt>Lineup</dt>
            <dd>
              {lineupFilled}/{lineupTotal}
            </dd>
          </div>
          <div className="home-menu__divider" aria-hidden />
          <div className="home-menu__stat">
            <dt>Collected</dt>
            <dd>{collectionSize}</dd>
          </div>
        </dl>
      </div>
    </motion.section>
  );
}
