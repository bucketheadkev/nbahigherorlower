'use client';

import type { PerkId } from '@/lib/tradeup/perks';
import { PerkIcon } from '../perks/PerkIcon';

interface ShopPerkIconProps {
  id: PerkId;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const PX: Record<NonNullable<ShopPerkIconProps['size']>, number> = {
  sm: 22,
  md: 30,
  lg: 36,
};

/** Hex-framed perk mark — Shop inventory + pack cards. Uses shared PerkIcon art. */
export function ShopPerkIcon({ id, size = 'md', className }: ShopPerkIconProps) {
  return (
    <span
      className={`shop-perk-ico shop-perk-ico--${id} shop-perk-ico--${size}${className ? ` ${className}` : ''}`}
      aria-hidden
    >
      <span className="shop-perk-ico__glow" />
      <span className="shop-perk-ico__face">
        <PerkIcon id={id} size={PX[size]} />
      </span>
    </span>
  );
}
