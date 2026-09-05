'use client';

import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { hapticImpact, hapticMedium } from '@/lib/tradeup/haptics';

export interface DraftSlamPayload {
  id: string;
  from: { x: number; y: number; size: number };
  to: { x: number; y: number; size: number };
  initials: string;
  primary: string;
  ink: string;
}

interface DraftPlayerSlamFlyProps {
  payload: DraftSlamPayload | null;
  onImpact: () => void;
  onComplete: () => void;
}

const FLIGHT_MS = 480;
const IMPACT_AT = 420;
const DONE_AT = 540;

/**
 * Compact disc flies from the pick list into the user-tapped dock circle.
 */
export function DraftPlayerSlamFly({ payload, onImpact, onComplete }: DraftPlayerSlamFlyProps) {
  const [mounted, setMounted] = useState(false);
  const onImpactRef = useRef(onImpact);
  const onCompleteRef = useRef(onComplete);
  onImpactRef.current = onImpact;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!payload) return;

    void hapticMedium();
    const impactAt = window.setTimeout(() => {
      void hapticImpact('medium');
      onImpactRef.current();
    }, IMPACT_AT);
    const doneAt = window.setTimeout(() => {
      onCompleteRef.current();
    }, DONE_AT);

    return () => {
      window.clearTimeout(impactAt);
      window.clearTimeout(doneAt);
    };
  }, [payload?.id]);

  if (!mounted || !payload || typeof document === 'undefined') return null;

  const { from, to, initials, primary, ink } = payload;
  const lift = Math.min(96, Math.max(48, Math.abs(from.y - to.y) * 0.28));
  const mid = {
    x: from.x + (to.x - from.x) * 0.45,
    y: Math.min(from.y, to.y) - lift,
  };

  return createPortal(
    <>
      <motion.div
        key={payload.id}
        className="draft-player-slam"
        aria-hidden
        initial={{
          left: from.x,
          top: from.y,
          width: from.size,
          height: from.size,
          x: '-50%',
          y: '-50%',
          scale: 1.05,
          opacity: 0.95,
        }}
        animate={{
          left: [from.x, mid.x, to.x, to.x],
          top: [from.y, mid.y, to.y, to.y],
          width: [from.size, from.size * 0.92, to.size * 1.1, to.size],
          height: [from.size, from.size * 0.92, to.size * 1.1, to.size],
          scale: [1.05, 0.96, 1.12, 1],
          opacity: [0.95, 1, 1, 0.98],
        }}
        transition={{
          duration: FLIGHT_MS / 1000,
          times: [0, 0.4, 0.8, 1],
          ease: [0.16, 0.84, 0.22, 1],
        }}
        style={{ position: 'fixed', zIndex: 9999, pointerEvents: 'none' }}
      >
        <span
          className="draft-player-slam__disc"
          style={{
            backgroundColor: primary,
            color: ink,
            borderColor: primary,
            boxShadow: `0 10px 24px rgba(0,0,0,0.42), 0 0 16px color-mix(in srgb, ${primary} 45%, transparent)`,
          }}
        >
          {initials}
        </span>
      </motion.div>
      <motion.div
        key={`${payload.id}-ring`}
        className="draft-player-slam__ring"
        aria-hidden
        initial={{ left: to.x, top: to.y, scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.5, 1.28, 1.5], opacity: [0, 0.5, 0] }}
        transition={{ duration: 0.36, delay: 0.32, ease: 'easeOut' }}
        style={{
          position: 'fixed',
          zIndex: 9998,
          pointerEvents: 'none',
          x: '-50%',
          y: '-50%',
          borderColor: primary,
        }}
      />
    </>,
    document.body,
  );
}
