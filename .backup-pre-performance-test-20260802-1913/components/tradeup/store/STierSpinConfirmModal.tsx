'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { formatCredits } from '@/lib/tradeup/credits';
import { S_TIER_SPIN_COST } from '@/lib/tradeup/sTierSpin';

interface STierSpinConfirmModalProps {
  credits: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function STierSpinConfirmModal({
  credits,
  onConfirm,
  onCancel,
}: STierSpinConfirmModalProps) {
  const reduceMotion = useGameReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const canAfford = credits >= S_TIER_SPIN_COST;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [submitting, onCancel]);

  const handleConfirm = () => {
    if (submitting || !canAfford) return;
    setSubmitting(true);
    onConfirm();
  };

  if (!mounted) return null;

  return createPortal(
    <div className="game-trade-overlay spin-confirm-overlay" role="presentation">
      <motion.button
        type="button"
        className="game-trade-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        onClick={submitting ? undefined : onCancel}
        aria-label="Cancel spin"
        tabIndex={-1}
      />
      <motion.div
        className="game-trade-modal spin-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spin-confirm-title"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="spin-confirm-title" className="spin-confirm-modal__title">
          Spin for an S-Tier Player?
        </h2>
        <p className="spin-confirm-modal__body">
          This will cost <strong>{formatCredits(S_TIER_SPIN_COST)} Credits</strong> and award one
          random S-tier player directly to My Collection.
        </p>
        <p className="spin-confirm-modal__balance">
          Your balance: {formatCredits(credits)} credits
        </p>
        <div className="spin-confirm-modal__actions">
          <button
            type="button"
            className="game-trade-modal__cancel"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="store-spin-card__action spin-confirm-modal__confirm"
            onClick={handleConfirm}
            disabled={submitting || !canAfford}
          >
            {submitting ? 'Starting…' : `Confirm Spin — ${formatCredits(S_TIER_SPIN_COST)} Credits`}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
