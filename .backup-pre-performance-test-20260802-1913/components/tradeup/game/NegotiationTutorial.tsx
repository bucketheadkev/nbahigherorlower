'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  hasSeenNegotiationTutorial,
  markNegotiationTutorialSeen,
} from '@/lib/tradeup/storage';

interface NegotiationTutorialProps {
  open: boolean;
  onDismiss: () => void;
}

export function NegotiationTutorial({ open, onDismiss }: NegotiationTutorialProps) {
  const reduceMotion = useGameReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open) return null;

  const dismiss = () => {
    markNegotiationTutorialSeen();
    onDismiss();
  };

  return createPortal(
    <div className="game-trade-overlay nego-tutorial-overlay" role="presentation">
      <button type="button" className="game-trade-modal-backdrop" aria-label="Dismiss" onClick={dismiss} />
      <motion.div
        className="game-trade-modal nego-tutorial"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nego-tutorial-title"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="nego-tutorial-title" className="nego-tutorial__title">
          How Trading Works
        </h2>
        <ul className="nego-tutorial__list">
          <li>The first offer is safe — 100% chance to land.</li>
          <li>
            <strong>Ask for More</strong> upgrades the player but lowers your acceptance chance.
          </li>
          <li>
            <strong>Attempt Trade</strong> locks in the current offer and rolls against that chance.
          </li>
          <li>A rejection costs one life.</li>
          <li>
            <strong>Keep Current Player</strong> walks away safely with no life lost.
          </li>
        </ul>
        <button type="button" className="tu-btn tu-btn--primary" onClick={dismiss} style={{ width: '100%' }}>
          Got it
        </button>
      </motion.div>
    </div>,
    document.body,
  );
}

export function useNegotiationTutorial() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!hasSeenNegotiationTutorial()) {
      setShow(true);
    }
  }, []);

  return {
    showTutorial: show,
    dismissTutorial: () => setShow(false),
  };
}
