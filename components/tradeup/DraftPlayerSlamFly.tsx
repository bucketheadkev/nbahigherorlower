'use client';

import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { hapticImpact, hapticMedium } from '@/lib/tradeup/haptics';

export interface DraftSlamPayload {
  id: string;
  from: { x: number; y: number; size: number; width?: number; height?: number };
  to: { x: number; y: number; size: number };
  initials: string;
  primary: string;
  ink: string;
  name?: string;
  positionLabel?: string;
  valueLabel?: string;
}

interface DraftPlayerSlamFlyProps {
  payload: DraftSlamPayload | null;
  onImpact: () => void;
  onComplete: () => void;
}

const FLIGHT_MS = 450;
const IMPACT_AT = 420;
const DONE_AT = 560;

/**
 * Flies a pick-list card clone into a roster dock circle along a curved path.
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

  const { from, to, initials, primary, ink, name, positionLabel, valueLabel } = payload;
  const cardMode = Boolean(name);
  const fromW = from.width ?? Math.max(from.size * 2.6, 180);
  const fromH = from.height ?? Math.max(from.size, 52);
  const lift = Math.min(110, Math.max(56, Math.abs(from.y - to.y) * 0.32));
  const midX = from.x + (to.x - from.x) * 0.42;
  const midY = Math.min(from.y, to.y) - lift;

  return createPortal(
    <>
      <motion.div
        key={payload.id}
        className={`draft-player-slam${cardMode ? ' is-card' : ''}`}
        aria-hidden
        initial={{
          left: from.x,
          top: from.y,
          width: cardMode ? fromW : from.size,
          height: cardMode ? fromH : from.size,
          x: '-50%',
          y: '-50%',
          scale: cardMode ? 1.025 : 1.06,
          opacity: 1,
        }}
        animate={{
          left: [from.x, midX, to.x, to.x],
          top: [from.y, midY, to.y, to.y],
          width: cardMode
            ? [fromW, fromW * 0.7, to.size, to.size]
            : [from.size, from.size * 0.92, to.size * 1.12, to.size],
          height: cardMode
            ? [fromH, fromH * 0.65, to.size, to.size]
            : [from.size, from.size * 0.92, to.size * 1.12, to.size],
          scale: cardMode ? [1.025, 0.95, 1.12, 1] : [1.06, 0.95, 1.16, 1],
          opacity: [1, 1, 1, 0.96],
        }}
        transition={{
          duration: FLIGHT_MS / 1000,
          times: [0, 0.4, 0.82, 1],
          ease: [0.16, 0.84, 0.22, 1],
        }}
        style={{ position: 'fixed', zIndex: 9999, pointerEvents: 'none' }}
      >
        <div
          className="draft-player-slam__body"
          style={{
            backgroundColor: primary,
            color: ink,
            borderColor: primary,
            boxShadow: `0 12px 32px rgba(0,0,0,0.45), 0 0 22px color-mix(in srgb, ${primary} 48%, transparent)`,
          }}
        >
          {cardMode ? (
            <>
              <span className="draft-player-slam__pos">{positionLabel}</span>
              <span className="draft-player-slam__meta">
                <strong className="draft-player-slam__name">{name}</strong>
                {valueLabel ? <em className="draft-player-slam__val">{valueLabel}</em> : null}
              </span>
              <span className="draft-player-slam__initials" aria-hidden>
                {initials}
              </span>
            </>
          ) : (
            <span className="draft-player-slam__disc-label">{initials}</span>
          )}
        </div>
      </motion.div>
      <motion.div
        key={`${payload.id}-ring`}
        className="draft-player-slam__ring"
        aria-hidden
        initial={{ left: to.x, top: to.y, scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.5, 1.3, 1.55], opacity: [0, 0.5, 0] }}
        transition={{ duration: 0.4, delay: 0.34, ease: 'easeOut' }}
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
