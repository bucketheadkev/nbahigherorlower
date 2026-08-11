'use client';

import Image from 'next/image';

/** Official $1B logo mark (transparent crop). */
export const BALLION_LOGO_SRC = '/images/1b-logo.png?v=2';
/** Splash / launch mark — $1B RUN on brand navy. */
export const BALLION_SPLASH_LOGO_SRC = '/images/1b-run-splash.png?v=1';

const SIZE_CLASS = {
  hero: 'tradeup-logo--hero',
  md: 'tradeup-logo--md',
  sm: 'tradeup-logo--sm',
  xs: 'tradeup-logo--xs',
} as const;

export type BallionLogoSize = keyof typeof SIZE_CLASS;

interface BallionLogoProps {
  size?: BallionLogoSize;
  className?: string;
  priority?: boolean;
}

/** Official $1B logo — headers, loading, watermarks. */
export function BallionLogo({
  size = 'md',
  className = '',
  priority = false,
}: BallionLogoProps) {
  return (
    <div
      className={`tradeup-logo ballion-logo oneb-logo ${SIZE_CLASS[size]}${
        className ? ` ${className}` : ''
      }`}
      aria-hidden={size === 'xs'}
    >
      <Image
        src={BALLION_LOGO_SRC}
        alt="$1B logo"
        fill
        sizes={
          size === 'hero'
            ? '(max-width: 640px) 72vw, 18rem'
            : size === 'md'
              ? '10rem'
              : size === 'sm'
                ? '6.5rem'
                : '3.5rem'
        }
        priority={priority}
        className="tradeup-logo__img ballion-logo__img"
      />
    </div>
  );
}

/** @deprecated Use BallionLogo — kept so existing imports keep working. */
export const TradeUpLogo = BallionLogo;
export type TradeUpLogoSize = BallionLogoSize;
