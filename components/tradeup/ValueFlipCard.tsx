'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';

/** Spoken millions, e.g. "$200 million". Uses the already-calculated integer. */
export function formatMillionLabel(value: number): string {
  const millions = Math.round(value / 1_000_000);
  return `$${millions.toLocaleString('en-US')} million`;
}

interface ValueFlipCardProps {
  className: string;
  style?: CSSProperties;
  front: ReactNode;
  valueLabel: string | null;
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * Independent card flip. Front stays readable; the back is only the dollar value.
 * rotateY on the back keeps the text from appearing mirrored.
 */
export function ValueFlipCard({
  className,
  style,
  front,
  valueLabel,
  ariaLabel,
  disabled = false,
}: ValueFlipCardProps) {
  const [flipped, setFlipped] = useState(false);
  const canFlip = Boolean(valueLabel) && !disabled;

  return (
    <button
      type="button"
      className={`value-flip${flipped ? ' is-flipped' : ''} ${className}`}
      style={style}
      disabled={!canFlip}
      aria-pressed={canFlip ? flipped : undefined}
      aria-label={
        canFlip
          ? flipped
            ? `${ariaLabel}. ${valueLabel}. Tap to show the player.`
            : `${ariaLabel}. Tap to show value.`
          : ariaLabel
      }
      onClick={(event) => {
        event.stopPropagation();
        if (!canFlip) return;
        setFlipped((current) => !current);
      }}
    >
      <span className="value-flip__inner">
        <span className="value-flip__face value-flip__front">{front}</span>
        <span className="value-flip__face value-flip__back">{valueLabel}</span>
      </span>
    </button>
  );
}
