'use client';

import type { PerkId } from '@/lib/tradeup/perks';

interface PerkIconProps {
  id: PerkId;
  className?: string;
  /** Rendered tile size in px. */
  size?: number;
}

const PERK_ART: Record<PerkId, string> = {
  double_draft: '/images/perks/perk-double-draft.webp',
  xray: '/images/perks/perk-xray.webp',
  player_swap: '/images/perks/perk-swap.webp',
};

/**
 * Shared Classic + Shop perk marks — authored icon tiles
 * (Double Draft = cobalt cards, X-Ray = green scouting lens, Swap = orange jersey exchange).
 */
export function PerkIcon({ id, className, size = 28 }: PerkIconProps) {
  return (
    <span
      className={`perk-tile perk-tile--${id}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PERK_ART[id]} alt="" width={384} height={384} decoding="async" draggable={false} />
    </span>
  );
}
