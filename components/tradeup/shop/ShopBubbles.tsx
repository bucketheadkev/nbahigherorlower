'use client';

/** Deterministic spread so server and client markup match. */
const BUBBLES = Array.from({ length: 18 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    left: 3 + r(1) * 94,
    size: 2 + Math.round(r(2) * 4),
    dur: 3.4 + r(3) * 3.2,
    delay: -r(4) * 6.6,
    drift: (r(5) - 0.5) * 26,
    alpha: 0.2 + r(6) * 0.35,
    green: r(7) > 0.72,
  };
});

/**
 * Small, quick bubbles rising behind the Shop cards. Pinned to the viewport (sticky) so they
 * keep rising while the store scrolls. Transform/opacity only — compositor work, no paint.
 */
export function ShopBubbles() {
  return (
    <div className="shop-bubbles" aria-hidden>
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className={`shop-bubbles__b${b.green ? ' is-green' : ''}`}
          style={{
            left: `${b.left.toFixed(2)}%`,
            width: b.size,
            height: b.size,
            animationDuration: `${b.dur.toFixed(2)}s`,
            animationDelay: `${b.delay.toFixed(2)}s`,
            ['--drift' as string]: `${b.drift.toFixed(1)}px`,
            ['--a' as string]: b.alpha.toFixed(2),
          }}
        />
      ))}
    </div>
  );
}
