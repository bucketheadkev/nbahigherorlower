'use client';

import { animate, useMotionValue, useMotionValueEvent } from 'framer-motion';
import { useEffect, useState, type MouseEventHandler } from 'react';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { RunCoinIcon } from '../xp/RunCoinIcon';

interface HomeCoinChipProps {
  value: number;
  label: string;
  plusLabel: string;
  /** Opens Shop — one handler for the entire pill (coin, balance, empty space, +). */
  onPlus?: MouseEventHandler<HTMLButtonElement>;
}

/** Hub coin pill — gold 1B coin, balance, + affordance. Whole chip opens Shop. */
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

  const body = (
    <>
      <RunCoinIcon className="home-coin__icon" size={24} tone="gold" />
      <strong className="home-coin__value">{shown.toLocaleString('en-US')}</strong>
      {onPlus ? (
        <span className="home-coin__plus" aria-hidden>
          <span className="home-coin__plus-mark">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
              <path d="M8 2.4v11.2M2.4 8h11.2" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
            </svg>
          </span>
        </span>
      ) : null}
    </>
  );

  if (onPlus) {
    return (
      <button
        type="button"
        className="home-coin ui-tap"
        aria-label={`${plusLabel}. ${label}: ${safe}`}
        onClick={onPlus}
      >
        {body}
      </button>
    );
  }

  return (
    <div className="home-coin" role="status" aria-label={`${label}: ${safe}`}>
      {body}
    </div>
  );
}
