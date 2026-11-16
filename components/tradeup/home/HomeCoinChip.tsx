'use client';

import { animate, useMotionValue, useMotionValueEvent } from 'framer-motion';
import { useEffect, useState, type MouseEventHandler } from 'react';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { RunCoinIcon } from '../xp/RunCoinIcon';

interface HomeCoinChipProps {
  value: number;
  label: string;
  plusLabel: string;
  onPlus?: MouseEventHandler<HTMLButtonElement>;
}

/** Approved coin pill — silver-blue 1B coin, balance, orange +. */
export function HomeCoinChip({ value, label, plusLabel, onPlus }: HomeCoinChipProps) {
  const safe = Math.max(0, Math.round(value));
  const mv = useMotionValue(safe);
  const [shown, setShown] = useState(safe);

  useMotionValueEvent(mv, 'change', (v) => setShown(Math.round(v)));

  useEffect(() => {
    if (getPrefersReducedMotion()) {
      mv.set(safe);
      setShown(safe);
      return;
    }
    const ctrl = animate(mv, safe, { type: 'spring', stiffness: 140, damping: 24 });
    return () => ctrl.stop();
  }, [safe, mv]);

  return (
    <div className="home-coin" role="status" aria-label={`${label}: ${safe}`}>
      <RunCoinIcon className="home-coin__icon" size={28} />
      <strong className="home-coin__value">{shown.toLocaleString('en-US')}</strong>
      {onPlus ? (
        <button type="button" className="home-coin__plus ui-tap" aria-label={plusLabel} onClick={onPlus}>
          <span aria-hidden>+</span>
        </button>
      ) : null}
    </div>
  );
}
