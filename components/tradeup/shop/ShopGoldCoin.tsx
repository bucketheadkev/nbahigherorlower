'use client';

interface ShopGoldCoinProps {
  className?: string;
}

/** Kept so existing Shop markup compiles — raster coins need no shared SVG defs. */
export function ShopGoldCoinSprite() {
  return null;
}

/** Polished gold 1B coin lying flat, seen from three-quarter height — the stacking sprite. */
export function ShopGoldCoin({ className }: ShopGoldCoinProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`shop-coin3d${className ? ` ${className}` : ''}`}
      src="/images/coins/coin-tilt.webp"
      alt=""
      width={360}
      height={260}
      draggable={false}
      decoding="async"
      aria-hidden
    />
  );
}
