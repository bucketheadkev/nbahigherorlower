'use client';

import { formatCredits } from '@/lib/tradeup/credits';

interface CreditsBadgeProps {
  credits: number;
  size?: 'default' | 'large';
}

export function CreditsBadge({ credits, size = 'default' }: CreditsBadgeProps) {
  return (
    <div
      className={`credits-badge${size === 'large' ? ' credits-badge--large' : ''}`}
      aria-label={`${credits} credits`}
    >
      <span className="credits-badge-icon" aria-hidden>
        ◆
      </span>
      <span className="credits-badge-value">{formatCredits(credits)}</span>
      <span className="credits-badge-label">credits</span>
    </div>
  );
}
