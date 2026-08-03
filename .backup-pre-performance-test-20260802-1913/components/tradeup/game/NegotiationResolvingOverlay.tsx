'use client';

import { useGameReducedMotion } from '@/hooks/useGameReducedMotion';

import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface NegotiationResolvingOverlayProps {
  active: boolean;
  teamName: string;
}

export function NegotiationResolvingOverlay({
  active,
  teamName,
}: NegotiationResolvingOverlayProps) {
  const reduceMotion = useGameReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !active) return null;

  return createPortal(
    <div className="game-trade-overlay nego-resolving-overlay" role="status" aria-live="polite">
      <motion.div
        className="nego-resolving"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="nego-resolving__pulse" aria-hidden />
        <p className="nego-resolving__eyebrow">Trade under review</p>
        <h2 className="nego-resolving__title">The {teamName} are deciding…</h2>
      </motion.div>
    </div>,
    document.body,
  );
}
