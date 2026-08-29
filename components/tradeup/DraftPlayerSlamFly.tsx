'use client';

import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { hapticHeavy, hapticMedium } from '@/lib/tradeup/haptics';

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

/**
 * Flies a team-colored player disc from the pick list into a dock circle.
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
      void hapticHeavy();
      onImpactRef.current();
    }, 400);
    const doneAt = window.setTimeout(() => {
      onCompleteRef.current();
    }, 560);

    return () => {
      window.clearTimeout(impactAt);
      window.clearTimeout(doneAt);
    };
  }, [payload?.id]);

  if (!mounted || !payload || typeof document === 'undefined') return null;

  const { from, to, initials, primary, ink } = payload;
  const lift = Math.min(96, Math.max(48, Math.abs(from.y - to.y) * 0.28));
  const mid = {
    x: (from.x + to.x) / 2,
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
          scale: 1.08,
          opacity: 0.92,
          rotate: -8,
        }}
        animate={{
          left: [from.x, mid.x, to.x, to.x],
          top: [from.y, mid.y, to.y, to.y],
          scale: [1.08, 0.94, 1.26, 1],
          opacity: [0.92, 1, 1, 0.98],
          rotate: [-8, 0, 4, 0],
        }}
        transition={{
          duration: 0.52,
          times: [0, 0.38, 0.78, 1],
          ease: [0.12, 0.85, 0.22, 1],
        }}
        style={{ position: 'fixed', zIndex: 9999, pointerEvents: 'none' }}
      >
        <span
          className="draft-player-slam__disc"
          style={{
            backgroundColor: primary,
            color: ink,
            borderColor: primary,
            boxShadow: `0 10px 28px rgba(0,0,0,0.45), 0 0 22px color-mix(in srgb, ${primary} 55%, transparent)`,
          }}
        >
          {initials}
        </span>
      </motion.div>
      <motion.div
        key={`${payload.id}-flash`}
        className="draft-player-slam__flash"
        aria-hidden
        initial={{ left: to.x, top: to.y, scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.35, 1.6], opacity: [0, 0.55, 0] }}
        transition={{ duration: 0.38, delay: 0.38, ease: 'easeOut' }}
        style={{
          position: 'fixed',
          zIndex: 9998,
          pointerEvents: 'none',
          x: '-50%',
          y: '-50%',
        }}
      />
    </>,
    document.body,
  );
}
