'use client';

import type { PerkId } from '@/lib/tradeup/perks';
import { PerkIcon } from '../perks/PerkIcon';

interface ShopPerkIconProps {
  id: PerkId;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const PX: Record<NonNullable<ShopPerkIconProps['size']>, number> = {
  sm: 44,
  md: 54,
  lg: 66,
};

/** Shop inventory + pack cards — the shared perk tile at shop sizes. */
export function ShopPerkIcon({ id, size = 'md', className }: ShopPerkIconProps) {
  return (
    <PerkIcon
      id={id}
      size={PX[size]}
      className={`rh10-perk rh10-perk--${size}${className ? ` ${className}` : ''}`}
    />
  );
}
