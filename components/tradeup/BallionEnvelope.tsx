'use client';

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { contrastOnPrimary } from '@/lib/tradeup/teamColors';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';
import { BALLION_LOGO_SRC } from './TradeUpLogo';

interface BallionEnvelopeProps {
  teamName: string;
  era: string;
  teamPrimary: string;
  reduceMotion?: boolean;
  /** Fired once when the automatic open+card sequence finishes */
  onOpened: () => void;
}

type EnvelopePhase = 'sealed' | 'opening' | 'done';

const SWIPE_RATIO = 0.16;
const OPEN_MS = 1600;
const OPEN_MS_REDUCED = 280;

/**
 * Premium sealed Ballion envelope — short upward swipe triggers a full auto-open.
 */
export const BallionEnvelope = memo(function BallionEnvelope({
  teamName,
  era,
  teamPrimary,
  reduceMotion = false,
  onOpened,
}: BallionEnvelopeProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<EnvelopePhase>('sealed');
  const phaseRef = useRef<EnvelopePhase>('sealed');
  const dragStartY = useRef<number | null>(null);
  const dragging = useRef(false);
  const pulledRef = useRef(0);
  const openedRef = useRef(false);
  const timerRef = useRef(0);
  const ink = contrastOnPrimary(teamPrimary);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const finishOpen = useCallback(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    setPhase('done');
    phaseRef.current = 'done';
    hapticMedium();
    onOpened();
  }, [onOpened]);

  const beginOpen = useCallback(() => {
    if (phaseRef.current !== 'sealed' || openedRef.current) return;
    setPhase('opening');
    phaseRef.current = 'opening';
    hapticLight();
    // Subtle flap feedback shortly after auto-open begins
    if (!reduceMotion) {
      window.setTimeout(() => hapticLight(), 220);
    }
    const ms = reduceMotion ? OPEN_MS_REDUCED : OPEN_MS;
    timerRef.current = window.setTimeout(finishOpen, ms);
  }, [finishOpen, reduceMotion]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (phaseRef.current !== 'sealed') return;
    e.preventDefault();
    dragging.current = true;
    dragStartY.current = e.clientY;
    pulledRef.current = 0;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragging.current || phaseRef.current !== 'sealed') return;
    const start = dragStartY.current;
    if (start == null) return;
    const dy = start - e.clientY; // up is positive
    const h = rootRef.current?.offsetHeight ?? 360;
    const pull = Math.max(0, Math.min(1, dy / (h * SWIPE_RATIO)));
    pulledRef.current = pull;
    const flap = rootRef.current?.querySelector('.envelope__flap') as HTMLElement | null;
    if (flap && !reduceMotion) {
      flap.style.transform = `rotateX(${Math.min(28, pull * 42)}deg)`;
    }
    if (dy >= h * SWIPE_RATIO) {
      dragging.current = false;
      beginOpen();
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    dragging.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (phaseRef.current !== 'sealed') return;
    const flap = rootRef.current?.querySelector('.envelope__flap') as HTMLElement | null;
    if (flap && !reduceMotion) {
      flap.style.transform = '';
    }
  };

  return (
    <div
      ref={rootRef}
      className={`envelope is-${phase}${reduceMotion ? ' is-instant' : ''}`}
      aria-label="Ballion envelope"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="envelope__shadow" aria-hidden />

      <div className="envelope__body">
        <div className="envelope__pocket" aria-hidden={phase === 'sealed'}>
          <div
            className="envelope__card"
            style={{ background: teamPrimary, color: ink }}
          >
            <p className="envelope__card-team" style={{ color: ink }}>
              {teamName}
            </p>
            <p className="envelope__card-era" style={{ color: ink }}>
              {era}
            </p>
          </div>
        </div>

        <div className="envelope__face">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="envelope__logo"
            src={BALLION_LOGO_SRC}
            alt="Ballion"
            draggable={false}
          />
          {phase === 'sealed' ? (
            <p className="envelope__hint">SWIPE UP TO OPEN</p>
          ) : null}
        </div>

        <div className="envelope__flap" aria-hidden>
          <span className="envelope__seal" />
        </div>
      </div>
    </div>
  );
});
