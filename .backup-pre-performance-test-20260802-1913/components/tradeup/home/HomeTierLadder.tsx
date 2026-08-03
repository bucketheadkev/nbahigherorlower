'use client';

import { motion } from 'framer-motion';
import type { PlayerTier } from '@/lib/tradeup/tiers';
import { TIER_STYLES } from '@/lib/tradeup/tierStyles';
import { SELL_VALUE } from '@/lib/tradeup/credits';

const TIERS: PlayerTier[] = ['S', 'A', 'B', 'C', 'D', 'F'];

export function HomeTierLadder() {
  const maxSell = SELL_VALUE.S;

  return (
    <div className="home-panel home-tier-panel">
      <div className="home-panel-header">
        <span className="home-panel-label">Tier ladder</span>
        <span className="home-panel-meta">Sell value by tier</span>
      </div>
      <div className="home-tier-ladder">
        {TIERS.map((tier, i) => {
          const style = TIER_STYLES[tier];
          const sell = SELL_VALUE[tier];
          const width = `${Math.max(18, (sell / maxSell) * 100)}%`;

          return (
            <motion.div
              key={tier}
              className="home-tier-row"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <span
                className="home-tier-badge"
                style={{ color: style.color, borderColor: style.border, background: style.bg }}
              >
                {tier}
              </span>
              <div className="home-tier-bar-track">
                <motion.div
                  className="home-tier-bar-fill"
                  style={{ background: style.color, boxShadow: `0 0 12px ${style.glow}` }}
                  initial={{ width: 0 }}
                  animate={{ width }}
                  transition={{ duration: 0.7, delay: 0.2 + i * 0.08, ease: 'easeOut' }}
                />
              </div>
              <span className="home-tier-sell">{sell} cr</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
