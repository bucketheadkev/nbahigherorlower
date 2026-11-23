'use client';

import { ShopGoldCoin } from './ShopGoldCoin';

export type CoinPileTier = 50 | 600 | 1200 | 2600 | 6000 | 17000;

interface ShopCoinPileProps {
  coins: number;
  className?: string;
  featured?: boolean;
}

/** Map catalog amounts to visual abundance tiers. */
export function coinPileTier(coins: number): CoinPileTier {
  if (coins >= 17000) return 17000;
  if (coins >= 6000) return 6000;
  if (coins >= 2600) return 2600;
  if (coins >= 1200) return 1200;
  if (coins >= 600) return 600;
  return 50;
}

/**
 * Placement in the isometric stage.
 * x/y % of stage · s = width % · z stacking · spin face rotation
 */
type Spec = { x: number; y: number; s: number; z: number; spin?: number };

/**
 * Reference-style compositions by pack size.
 */
const PILES: Record<CoinPileTier, Spec[]> = {
  50: [
    { x: 42, y: 56, s: 54, z: 1, spin: -18 },
    { x: 60, y: 46, s: 58, z: 2, spin: 14 },
  ],
  600: [
    { x: 50, y: 74, s: 48, z: 1, spin: -6 },
    { x: 50, y: 58, s: 50, z: 2, spin: 4 },
    { x: 50, y: 44, s: 50, z: 3, spin: -3 },
    { x: 50, y: 30, s: 48, z: 4, spin: 8 },
  ],
  1200: [
    { x: 50, y: 78, s: 48, z: 1, spin: -4 },
    { x: 50, y: 64, s: 50, z: 2, spin: 3 },
    { x: 50, y: 50, s: 52, z: 3, spin: -2 },
    { x: 50, y: 36, s: 50, z: 4, spin: 5 },
    { x: 50, y: 24, s: 48, z: 5, spin: -6 },
  ],
  2600: [
    { x: 32, y: 78, s: 40, z: 1, spin: -14 },
    { x: 32, y: 64, s: 42, z: 2, spin: 6 },
    { x: 32, y: 50, s: 42, z: 3, spin: -4 },
    { x: 32, y: 38, s: 40, z: 4, spin: 8 },
    { x: 58, y: 74, s: 40, z: 1, spin: 10 },
    { x: 58, y: 60, s: 42, z: 2, spin: -8 },
    { x: 58, y: 46, s: 42, z: 3, spin: 4 },
    { x: 72, y: 58, s: 36, z: 2, spin: 18 },
    { x: 46, y: 30, s: 38, z: 5, spin: -10 },
  ],
  6000: [
    { x: 30, y: 84, s: 36, z: 1, spin: -10 },
    { x: 30, y: 72, s: 38, z: 2, spin: 4 },
    { x: 30, y: 60, s: 38, z: 3, spin: -6 },
    { x: 30, y: 48, s: 40, z: 4, spin: 8 },
    { x: 30, y: 36, s: 38, z: 5, spin: -2 },
    { x: 30, y: 26, s: 36, z: 6, spin: 12 },
    { x: 62, y: 82, s: 36, z: 1, spin: 8 },
    { x: 62, y: 70, s: 38, z: 2, spin: -6 },
    { x: 62, y: 58, s: 38, z: 3, spin: 4 },
    { x: 62, y: 46, s: 40, z: 4, spin: -10 },
    { x: 62, y: 34, s: 38, z: 5, spin: 6 },
    { x: 62, y: 24, s: 36, z: 6, spin: -4 },
    { x: 46, y: 40, s: 34, z: 4, spin: 16 },
  ],
  17000: [
    { x: 18, y: 86, s: 30, z: 1, spin: -18 },
    { x: 34, y: 88, s: 32, z: 1, spin: -4 },
    { x: 50, y: 90, s: 32, z: 1, spin: 6 },
    { x: 66, y: 88, s: 32, z: 1, spin: 14 },
    { x: 80, y: 84, s: 30, z: 1, spin: 22 },
    { x: 24, y: 74, s: 34, z: 2, spin: -12 },
    { x: 40, y: 76, s: 36, z: 2, spin: 2 },
    { x: 56, y: 76, s: 36, z: 2, spin: 10 },
    { x: 72, y: 72, s: 34, z: 2, spin: 18 },
    { x: 30, y: 62, s: 36, z: 3, spin: -8 },
    { x: 48, y: 64, s: 38, z: 3, spin: 4 },
    { x: 64, y: 60, s: 36, z: 3, spin: 12 },
    { x: 36, y: 50, s: 38, z: 4, spin: -6 },
    { x: 54, y: 50, s: 40, z: 4, spin: 8 },
    { x: 70, y: 48, s: 34, z: 4, spin: 16 },
    { x: 42, y: 38, s: 38, z: 5, spin: -2 },
    { x: 60, y: 36, s: 38, z: 5, spin: 10 },
    { x: 50, y: 26, s: 36, z: 6, spin: 4 },
    { x: 58, y: 18, s: 32, z: 7, spin: -8 },
  ],
};

/** Lower tiers stay visually smaller than the 17k mountain. */
const STAGE_SCALE: Record<CoinPileTier, number> = {
  50: 0.72,
  600: 0.7,
  1200: 0.74,
  2600: 0.82,
  6000: 0.92,
  17000: 1,
};

/**
 * Gold 3D coin piles — isometric stacks matching the reference storefront.
 */
export function ShopCoinPile({ coins, className, featured = false }: ShopCoinPileProps) {
  const tier = coinPileTier(coins);
  const specs = PILES[tier];
  const scale = STAGE_SCALE[tier];
  // Cap painted coins — 17k pile had 19 SVGs and hitching Shop open on web.
  const shown = specs.length > 10 ? specs.filter((_, i) => i % 2 === 0).slice(0, 10) : specs;

  return (
    <span
      className={`shop-pile shop-pile--${tier}${featured ? ' is-featured' : ''}${className ? ` ${className}` : ''}`}
      data-tier={tier}
      aria-hidden
      style={{ ['--pile-scale' as string]: String(scale) }}
    >
      <span className="shop-pile__stage">
        <span className="shop-pile__glow" />
        {tier >= 2600 ? <span className="shop-pile__spark shop-pile__spark--a" /> : null}
        {tier >= 6000 ? <span className="shop-pile__spark shop-pile__spark--b" /> : null}
        {tier >= 17000 ? <span className="shop-pile__spark shop-pile__spark--c" /> : null}
        {shown.map((c, i) => (
          <span
            key={`${tier}-${i}`}
            className="shop-pile__coin"
            style={{
              left: `${c.x}%`,
              top: `${c.y}%`,
              width: `${c.s}%`,
              zIndex: c.z,
              transform: `translate(-50%, -50%) rotate(${c.spin ?? 0}deg)`,
            }}
          >
            <ShopGoldCoin />
          </span>
        ))}
      </span>
    </span>
  );
}
