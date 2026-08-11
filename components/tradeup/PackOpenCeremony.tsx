'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import type { Position } from '@/lib/tradeup/types';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { BallionWordmark } from './BallionWordmark';

export type PackCeremonyPhase = 'closed' | 'opening' | 'dealing' | 'open';

interface SlotTarget {
  slot: Position;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PackOpenCeremonyProps {
  phase: PackCeremonyPhase;
  dealOrder: Position[];
  landedCount: number;
  slotRefs: React.MutableRefObject<Record<Position, HTMLElement | null>>;
  onOpen: () => void;
  onExit: () => void;
  /** e.g. "Est. team value $20M" */
  packSubtitle?: string;
  packTitle?: string;
}

function FaceDownMini({ slot, className = '' }: { slot: Position; className?: string }) {
  return (
    <div className={`pack-deal-card ${className}`} aria-hidden>
      <span className="pack-deal-card__glow" />
      <span className="pack-deal-card__shine" />
      <span className="pack-deal-card__frame" />
      <span className="pack-deal-card__mark">TU</span>
      <span className="pack-deal-card__pos">{slot}</span>
      <span className="pack-deal-card__label">{POSITION_LABELS[slot]}</span>
    </div>
  );
}

export function PackOpenCeremony({
  phase,
  dealOrder,
  landedCount,
  slotRefs,
  onOpen,
  onExit,
  packSubtitle = '5 cards · face down',
  packTitle = 'STARTER PACK',
}: PackOpenCeremonyProps) {
  const reduceMotion = getPrefersReducedMotion();
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [targets, setTargets] = useState<SlotTarget[]>([]);
  const [flyingIndex, setFlyingIndex] = useState(-1);
  const openedRef = useRef(false);

  const measure = useCallback(() => {
    setOrigin({
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.42,
    });

    const next: SlotTarget[] = [];
    for (const slot of dealOrder) {
      const node = slotRefs.current?.[slot];
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      next.push({
        slot,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        w: rect.width,
        h: rect.height,
      });
    }
    setTargets(next);
  }, [dealOrder, slotRefs]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, phase, landedCount]);

  useEffect(() => {
    if (phase !== 'dealing') {
      setFlyingIndex(-1);
      return;
    }
    if (landedCount >= dealOrder.length) {
      setFlyingIndex(-1);
      return;
    }
    const id = window.requestAnimationFrame(() => {
      measure();
      setFlyingIndex(landedCount);
    });
    return () => window.cancelAnimationFrame(id);
  }, [phase, landedCount, dealOrder.length, measure]);

  useEffect(() => {
    if (phase === 'closed') openedRef.current = false;
  }, [phase]);

  const activeTarget = useMemo(() => {
    if (flyingIndex < 0) return null;
    return targets.find((t) => t.slot === dealOrder[flyingIndex]) ?? null;
  }, [flyingIndex, targets, dealOrder]);

  const handleOpen = useCallback(() => {
    if (phase !== 'closed' || openedRef.current) return;
    openedRef.current = true;
    onOpen();
  }, [onOpen, phase]);

  if (phase === 'open') return null;

  const showOverlay = phase === 'closed' || phase === 'opening';
  const showFlight = phase === 'dealing' && activeTarget && flyingIndex >= 0;

  return (
    <div className="pack-ceremony" aria-live="polite">
      <AnimatePresence>
        {showOverlay ? (
          <motion.div
            key="pack-overlay"
            className={`pack-ceremony__overlay${phase === 'opening' ? ' is-opening' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label="Open starter pack"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.28 } }}
            onPointerUp={(event) => {
              // Ignore the Home control — it stops propagation itself.
              if ((event.target as HTMLElement).closest('.pack-ceremony__home')) return;
              handleOpen();
            }}
          >
            <button
              type="button"
              className="pack-ceremony__home"
              onPointerUp={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onExit();
              }}
            >
              ← Home
            </button>

            <span className="pack-ceremony__vignette" aria-hidden />
            <span className="pack-ceremony__rays" aria-hidden />

            <div className="pack-ceremony__stage">
              <motion.div
                className="pack-ceremony__pack"
                initial={reduceMotion ? false : { scale: 0.9, y: 18 }}
                animate={
                  phase === 'opening'
                    ? { scale: 1.08, y: -6, filter: 'brightness(1.3)' }
                    : { scale: 1, y: 0, filter: 'brightness(1)' }
                }
                transition={{ type: 'spring', stiffness: 280, damping: 20 }}
              >
                <span className="pack-ceremony__pack-glow" aria-hidden />
                <span className="pack-ceremony__pack-foil" aria-hidden />
                <div className="pack-ceremony__pack-stack" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
                <BallionWordmark />
                <p className="pack-ceremony__pack-title">{packTitle}</p>
                <p className="pack-ceremony__pack-sub">{packSubtitle}</p>
              </motion.div>

              <motion.div
                className="pack-ceremony__cta"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: phase === 'opening' ? 0 : 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.35 }}
              >
                <strong>OPEN PACK</strong>
                <span>Tap anywhere</span>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showFlight && activeTarget ? (
          <motion.div
            key={`fly-${activeTarget.slot}-${flyingIndex}`}
            className="pack-ceremony__flyer"
            initial={{
              left: origin.x,
              top: origin.y,
              x: '-50%',
              y: '-50%',
              scale: 0.55,
              rotate: -28,
              opacity: 0.15,
              width: Math.max(72, activeTarget.w * 0.72),
              height: Math.max(96, activeTarget.h * 0.72),
              filter: 'blur(2px)',
            }}
            animate={{
              left: activeTarget.x,
              top: activeTarget.y,
              x: '-50%',
              y: '-50%',
              scale: 1,
              rotate: 0,
              opacity: 1,
              width: activeTarget.w,
              height: activeTarget.h,
              filter: 'blur(0px)',
            }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={
              reduceMotion
                ? { duration: 0.12 }
                : {
                    type: 'spring',
                    stiffness: 320,
                    damping: 26,
                    mass: 0.85,
                  }
            }
            style={{ position: 'fixed', zIndex: 210, pointerEvents: 'none' }}
          >
            <FaceDownMini slot={activeTarget.slot} className="pack-deal-card--flight" />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {phase === 'dealing' ? (
        <div className="pack-ceremony__deal-status" aria-live="polite">
          Dealing {Math.min(landedCount + 1, dealOrder.length)} / {dealOrder.length}
        </div>
      ) : null}
    </div>
  );
}
