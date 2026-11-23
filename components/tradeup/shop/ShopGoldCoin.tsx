'use client';

interface ShopGoldCoinProps {
  className?: string;
}

/**
 * Shared gradient / symbol defs — one copy for the whole Shop.
 * Per-coin useId() defs were duplicating ~50 SVG trees and hitching Coins paint.
 */
export function ShopGoldCoinSprite() {
  return (
    <svg
      className="shop-coin-sprite"
      aria-hidden
      width={0}
      height={0}
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <linearGradient id="shop-gc-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c89220" />
          <stop offset="0.35" stopColor="#8a5a0c" />
          <stop offset="0.7" stopColor="#5a3808" />
          <stop offset="1" stopColor="#3a2406" />
        </linearGradient>
        <linearGradient id="shop-gc-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3c0" />
          <stop offset="0.3" stopColor="#f0c050" />
          <stop offset="0.65" stopColor="#b87814" />
          <stop offset="1" stopColor="#6a4208" />
        </linearGradient>
        <radialGradient id="shop-gc-face" cx="0.34" cy="0.28" r="0.78">
          <stop offset="0" stopColor="#fff8d8" />
          <stop offset="0.35" stopColor="#ffd86a" />
          <stop offset="0.72" stopColor="#d49218" />
          <stop offset="1" stopColor="#8a5808" />
        </radialGradient>
        <linearGradient id="shop-gc-shine" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="0.45" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id="shop-gc-engr" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#fffdf2" />
          <stop offset="0.55" stopColor="#ffe6a0" />
          <stop offset="1" stopColor="#d4a040" />
        </linearGradient>
        <symbol id="shop-gc-symbol" viewBox="0 0 64 72">
          <path
            d="M6 28 C6 28 6 46 32 48 C58 46 58 28 58 28 L58 36 C58 36 58 54 32 56 C6 54 6 36 6 36 Z"
            fill="url(#shop-gc-side)"
          />
          <ellipse cx="32" cy="36" rx="26" ry="10" fill="url(#shop-gc-side)" opacity="0.85" />
          <ellipse cx="32" cy="28" rx="26.5" ry="14.5" fill="url(#shop-gc-rim)" />
          <ellipse cx="32" cy="27" rx="22.5" ry="12.2" fill="url(#shop-gc-face)" />
          <ellipse
            cx="32"
            cy="27"
            rx="17.5"
            ry="9.4"
            fill="none"
            stroke="rgba(90,55,10,0.42)"
            strokeWidth="1.4"
          />
          <ellipse
            cx="32"
            cy="27"
            rx="17.5"
            ry="9.4"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.7"
            strokeDasharray="3 2.2"
          />
          <g transform="translate(32 27) scale(1 0.62)">
            <text
              x="0"
              y="4.2"
              textAnchor="middle"
              fontFamily="Avenir Next Condensed, Avenir Next, Helvetica Neue, sans-serif"
              fontSize="13"
              fontWeight="900"
              letterSpacing="-0.04em"
              fill="url(#shop-gc-engr)"
            >
              1B
            </text>
          </g>
          <ellipse cx="24" cy="21.5" rx="9" ry="4.2" fill="url(#shop-gc-shine)" />
        </symbol>
      </defs>
    </svg>
  );
}

/**
 * Shop coin drawn in 3/4 perspective — thick gold rim + elliptical face.
 * Instances reference the shared sprite (no per-coin gradient trees).
 */
export function ShopGoldCoin({ className }: ShopGoldCoinProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 72"
      width="64"
      height="72"
      aria-hidden
    >
      <use href="#shop-gc-symbol" width="64" height="72" />
    </svg>
  );
}
