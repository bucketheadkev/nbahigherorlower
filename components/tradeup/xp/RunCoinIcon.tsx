'use client';

interface RunCoinIconProps {
  className?: string;
  size?: number;
  title?: string;
  /** Kept for call-site compatibility — every coin is the polished gold 1B coin. */
  tone?: 'silver' | 'gold';
  /** Animated reflection sweep (off for dense lists). */
  glint?: boolean;
}

/** Pick the smallest bitmap that stays crisp at 3× density. */
function coinSrc(size: number): string {
  if (size * 3 <= 128) return '/images/coins/coin-sm.webp';
  if (size * 3 <= 256) return '/images/coins/coin.webp';
  return '/images/coins/coin@2x.webp';
}

/**
 * Premium 1B Run coin — rendered mirror-polished gold (raster), with a light sweep that
 * travels across the face. One shared art file, so every coin in the game matches.
 */
export function RunCoinIcon({ className, size = 32, title, glint = true }: RunCoinIconProps) {
  return (
    <span
      className={`gcoin${glint ? ' gcoin--glint' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="gcoin__img" src={coinSrc(size)} alt="" width={size} height={size} draggable={false} decoding="async" />
      {glint ? <span className="gcoin__sheen" /> : null}
    </span>
  );
}
