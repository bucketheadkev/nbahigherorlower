'use client';

import { motion } from 'framer-motion';
import { formatCredits } from '@/lib/tradeup/credits';

interface SellPlayerModalProps {
  playerName: string;
  tierLabel: string;
  credits: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SellPlayerModal({
  playerName,
  tierLabel,
  credits,
  onConfirm,
  onCancel,
}: SellPlayerModalProps) {
  return (
    <motion.div
      className="sell-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className="sell-modal"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="section-label">Sell player</span>
        <h2 className="sell-modal-title">{playerName}</h2>
        <p className="sell-modal-tier">{tierLabel} tier</p>
        <p className="sell-modal-desc">
          End this run and cash out your current player for credits.
        </p>
        <div className="sell-modal-payout">
          <span className="sell-modal-payout-label">You receive</span>
          <span className="sell-modal-payout-value">{formatCredits(credits)} credits</span>
        </div>
        <div className="sell-modal-actions">
          <button type="button" className="btn-primary" onClick={onConfirm}>
            Sell &amp; exit
          </button>
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
