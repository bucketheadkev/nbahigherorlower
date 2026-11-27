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
 * A stack of flat-lying coins. x / y = centre of the bottom coin (% of the art box),
 * s = coin width (% of box width), n = coins tall.
 */
type Stack = { x: number; y: number; s: number; n: number };

/*
 * Sprite is 360×260 and the art box is ~4:3, so a coin s% wide is ~0.97·s% tall; its milled
 * edge is ~11% of that — the step between coins in a stack.
 */
const STEP = 0.105;

const PILES: Record<CoinPileTier, Stack[]> = {
  50: [
    { x: 41, y: 70, s: 50, n: 1 },
    { x: 60, y: 62, s: 52, n: 2 },
  ],
  600: [{ x: 50, y: 72, s: 58, n: 4 }],
  1200: [{ x: 50, y: 76, s: 58, n: 7 }],
  2600: [
    { x: 34, y: 72, s: 48, n: 6 },
    { x: 64, y: 80, s: 50, n: 4 },
  ],
  6000: [
    { x: 27, y: 74, s: 44, n: 6 },
    { x: 73, y: 74, s: 44, n: 5 },
    { x: 50, y: 82, s: 48, n: 8 },
  ],
  17000: [
    { x: 31, y: 68, s: 38, n: 6 },
    { x: 69, y: 68, s: 38, n: 7 },
    { x: 50, y: 74, s: 42, n: 9 },
    { x: 20, y: 86, s: 36, n: 1 },
    { x: 80, y: 86, s: 36, n: 2 },
  ],
};

/** Tiny deterministic wobble so stacks read as hand-stacked, not extruded. */
const wobble = (seed: number) => {
  const x = Math.sin(seed * 91.17) * 1e4;
  return (x - Math.floor(x) - 0.5) * 2.4;
};

/** Rendered gold 1B coins in neat stacks — bigger packs build taller, wider piles. */
export function ShopCoinPile({ coins, className, featured = false }: ShopCoinPileProps) {
  const tier = coinPileTier(coins);
  const stacks = [...PILES[tier]].sort((a, b) => a.y - b.y);

  return (
    <span
      className={`shop-pile shop-pile--${tier}${featured ? ' is-featured' : ''}${className ? ` ${className}` : ''}`}
      data-tier={tier}
      aria-hidden
    >
      <span className="shop-pile__stage">
        <span className="shop-pile__glow" />
        {stacks.map((st, si) => {
          const coinH = st.s * 0.97;
          return (
            <span key={si} className="shop-pile__stack" style={{ zIndex: si + 1 }}>
              <span
                className="shop-pile__shadow"
                style={{
                  left: `${st.x}%`,
                  top: `${(st.y + coinH * 0.28).toFixed(2)}%`,
                  width: `${(st.s * 1.08).toFixed(2)}%`,
                }}
              />
              {Array.from({ length: st.n }, (_, i) => {
                const top = i === st.n - 1;
                return (
                  <span
                    key={i}
                    className={`shop-pile__coin${top ? ' is-top' : ''}`}
                    style={{
                      left: `${(st.x + (i ? wobble(si * 31 + i) : 0)).toFixed(2)}%`,
                      top: `${(st.y - i * STEP * coinH).toFixed(2)}%`,
                      width: `${st.s}%`,
                      ['--gd' as string]: top ? `${-(si * 1.7 + (tier % 7) * 0.9)}s` : undefined,
                    }}
                  >
                    <ShopGoldCoin />
                    {top ? (
                      <span className="shop-pile__glint">
                        <i />
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </span>
          );
        })}
        {tier >= 2600 ? <span className="shop-pile__spark shop-pile__spark--a" /> : null}
        {tier >= 6000 ? <span className="shop-pile__spark shop-pile__spark--b" /> : null}
        {tier >= 17000 ? <span className="shop-pile__spark shop-pile__spark--c" /> : null}
      </span>
    </span>
  );
}
