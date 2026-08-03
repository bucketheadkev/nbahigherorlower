'use client';

import Image from 'next/image';

const LOGO_SRC = '/images/trade-up-logo.png?v=2';

const SIZE_CLASS = {
  hero: 'tradeup-logo--hero',
  md: 'tradeup-logo--md',
  sm: 'tradeup-logo--sm',
  xs: 'tradeup-logo--xs',
} as const;

export type TradeUpLogoSize = keyof typeof SIZE_CLASS;

interface TradeUpLogoProps {
  size?: TradeUpLogoSize;
  className?: string;
  priority?: boolean;
}

/** Official Trade Up logo mark — use on home, headers, loading, and watermarks. */
export function TradeUpLogo({
  size = 'md',
  className = '',
  priority = false,
}: TradeUpLogoProps) {
  return (
    <div
      className={`tradeup-logo ${SIZE_CLASS[size]}${className ? ` ${className}` : ''}`}
      aria-hidden={size === 'xs'}
    >
      <Image
        src={LOGO_SRC}
        alt="Trade Up"
        fill
        sizes={
          size === 'hero'
            ? '(max-width: 640px) 88vw, 22rem'
            : size === 'md'
              ? '12rem'
              : size === 'sm'
                ? '7rem'
                : '4rem'
        }
        priority={priority}
        className="tradeup-logo__img"
      />
    </div>
  );
}
