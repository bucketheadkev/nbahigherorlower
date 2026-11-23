'use client';

/**
 * Premium Shop environment — dark court atmosphere with drifting gold light.
 * Lightweight CSS-only motion; disabled under reduced-motion.
 * Mote count kept low so Shop open / Coins tab never hitch on paint.
 */
export function ShopAtmosphere() {
  return (
    <div className="shop-atmo" aria-hidden>
      <div className="shop-atmo__base" />
      <div className="shop-atmo__court" />
      <div className="shop-atmo__rim" />
      <div className="shop-atmo__spot shop-atmo__spot--l" />
      <div className="shop-atmo__spot shop-atmo__spot--r" />
      <div className="shop-atmo__sheen" />
      <div className="shop-atmo__gold">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`shop-atmo__mote shop-atmo__mote--${i + 1}`} />
        ))}
      </div>
    </div>
  );
}
