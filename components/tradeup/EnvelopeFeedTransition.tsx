'use client';

import { memo, useEffect, useRef } from 'react';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';
import { BALLION_LOGO_SRC } from './TradeUpLogo';

interface EnvelopeFeedTransitionProps {
  reduceMotion?: boolean;
  onComplete: () => void;
}

/**
 * Final cinematic: completed lineup envelope feeds into the valuation machine.
 * ~1.6s then hands off to the existing money screen.
 */
export const EnvelopeFeedTransition = memo(function EnvelopeFeedTransition({
  reduceMotion = false,
  onComplete,
}: EnvelopeFeedTransitionProps) {
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const ms = reduceMotion ? 200 : 1650;
    const tPulse1 = window.setTimeout(() => hapticLight(), reduceMotion ? 40 : 420);
    const tPulse2 = window.setTimeout(() => hapticLight(), reduceMotion ? 80 : 780);
    const tPulse3 = window.setTimeout(() => hapticMedium(), reduceMotion ? 120 : 1180);
    const tDone = window.setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onCompleteRef.current();
    }, ms);

    return () => {
      window.clearTimeout(tPulse1);
      window.clearTimeout(tPulse2);
      window.clearTimeout(tPulse3);
      window.clearTimeout(tDone);
    };
  }, [reduceMotion]);

  return (
    <div
      className={`envelope-feed${reduceMotion ? ' is-instant' : ''}`}
      aria-label="Feeding lineup into valuation"
      role="status"
    >
      <div className="envelope-feed__slot" aria-hidden>
        <span className="envelope-feed__rollers" />
        <span className="envelope-feed__mouth" />
      </div>

      <div className="envelope-feed__pack">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BALLION_LOGO_SRC} alt="" draggable={false} />
        <p>YOUR FIVE</p>
      </div>
    </div>
  );
});
