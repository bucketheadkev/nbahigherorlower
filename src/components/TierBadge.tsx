import type { AnswerTier } from '../types';
import './TierBadge.css';

interface Props {
  tier: AnswerTier;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  pulse?: boolean;
}

export function TierBadge({ tier, size = 'md', label, pulse = false }: Props) {
  return (
    <div className={`tier-badge tier-${tier} tier-size-${size} ${pulse ? 'tier-pulse' : ''}`}>
      <span className="tier-letter">{tier}</span>
      {label && <span className="tier-label">{label}</span>}
    </div>
  );
}
