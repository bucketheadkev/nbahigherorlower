'use client';

import type { PlayerTier } from '@/lib/tradeup/tiers';
import { TIER_STYLES } from '@/lib/tradeup/tierStyles';

interface TierBadgeProps {
  tier: PlayerTier;
  size?: 'default' | 'large' | 'hero' | 'subtle' | 'asset' | 'asset-prominent' | 'asset-featured';
}

export function TierBadge({ tier, size = 'default' }: TierBadgeProps) {
  const style = TIER_STYLES[tier];
  const sizeClass =
    size === 'hero'
      ? ' tier-badge--hero'
      : size === 'large'
        ? ' tier-badge--large'
        : size === 'asset-prominent'
          ? ' tier-badge--asset-prominent'
          : size === 'asset-featured'
            ? ' tier-badge--asset-featured'
            : size === 'asset'
            ? ' tier-badge--asset'
            : size === 'subtle'
              ? ' tier-badge--subtle'
              : '';

  const label =
    size === 'asset-prominent' || size === 'asset-featured' ? `${tier} TIER` : style.label;

  return (
    <span
      className={`tier-badge${sizeClass}`}
      style={
        {
          '--tier-color': style.color,
          '--tier-glow': style.glow,
          '--tier-border': style.border,
          '--tier-bg': style.bg,
        } as React.CSSProperties
      }
    >
      {label}
    </span>
  );
}
