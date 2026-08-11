'use client';

import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { contrastOnPrimary } from '@/lib/tradeup/teamColors';
import { BALLION_LOGO_SRC } from './TradeUpLogo';
import { HeatRevealLayer } from './HeatRevealLayer';

interface BallionScratchTicketProps {
  teamName: string;
  era: string;
  teamPrimary: string;
  reduceMotion?: boolean;
  onRevealed: () => void;
  /** Compact already-revealed card for pick-screen header */
  compact?: boolean;
}

/**
 * Ballion heat-reveal card — thermochromic coating clears from the finger.
 */
export const BallionScratchTicket = memo(function BallionScratchTicket({
  teamName,
  era,
  teamPrimary,
  reduceMotion = false,
  onRevealed,
  compact = false,
}: BallionScratchTicketProps) {
  const wellRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [revealed, setRevealed] = useState(compact);
  const ink = contrastOnPrimary(teamPrimary);

  useLayoutEffect(() => {
    if (compact) return;
    const el = wellRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({
        w: Math.max(1, Math.round(r.width)),
        h: Math.max(1, Math.round(r.height)),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact]);

  const handleRevealed = useCallback(() => {
    if (revealed) return;
    setRevealed(true);
    onRevealed();
  }, [onRevealed, revealed]);

  if (compact) {
    return (
      <div className="bst bst--compact bst--card is-revealed" aria-label={`${teamName} ${era}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bst__logo-img" src={BALLION_LOGO_SRC} alt="" draggable={false} />
        <div className="bst__compact-meta" style={{ background: teamPrimary, color: ink }}>
          <p className="bst__team" style={{ color: ink }}>
            {teamName}
          </p>
          <p className="bst__era" style={{ color: ink }}>
            {era}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bst bst--card bst--heat${revealed ? ' is-revealed' : ''}`}
      aria-label="Ballion heat reveal card"
    >
      <div className="bst__logo bst__logo--top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bst__logo-img" src={BALLION_LOGO_SRC} alt="$1B" draggable={false} />
      </div>

      <div className="bst__well" ref={wellRef}>
        <div
          className="bst__reveal"
          aria-live="polite"
          style={{ background: teamPrimary, color: ink }}
        >
          <p className="bst__team" style={{ color: ink }}>
            {teamName}
          </p>
          <p className="bst__era" style={{ color: ink }}>
            {era}
          </p>
        </div>

        {!revealed ? (
          <HeatRevealLayer
            width={size.w}
            height={size.h}
            reduceMotion={reduceMotion}
            disabled={revealed}
            onFullyRevealed={handleRevealed}
          />
        ) : null}

        {!revealed ? (
          <p className="bst__hint bst__hint--heat" aria-hidden>
            HOLD TO REVEAL
          </p>
        ) : null}
      </div>
    </div>
  );
});
