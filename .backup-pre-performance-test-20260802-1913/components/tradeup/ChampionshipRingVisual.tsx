'use client';

import { useId } from 'react';

interface ChampionshipRingVisualProps {
  size?: 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
  animate?: boolean;
}

const SIZE_CLASS = {
  sm: 'champ-ring--sm',
  md: 'champ-ring--md',
  lg: 'champ-ring--lg',
  hero: 'champ-ring--hero',
} as const;

/** Larry O'Brien Championship Trophy mark for locker, celebration, and finals. */
export function ChampionshipRingVisual({
  size = 'md',
  className = '',
  animate = false,
}: ChampionshipRingVisualProps) {
  const uid = useId().replace(/:/g, '');
  const goldId = `lobGold-${uid}`;
  const ballId = `lobBall-${uid}`;
  const glowId = `lobGlow-${uid}`;

  return (
    <div
      className={`champ-ring champ-trophy ${SIZE_CLASS[size]}${animate ? ' champ-ring--animate' : ''}${
        className ? ` ${className}` : ''
      }`}
      aria-hidden
    >
      <svg viewBox="0 0 120 160" className="champ-ring__svg champ-trophy__svg">
        <defs>
          <linearGradient id={goldId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fff6d0" />
            <stop offset="28%" stopColor="#f0d06a" />
            <stop offset="62%" stopColor="#c9952a" />
            <stop offset="100%" stopColor="#8a6414" />
          </linearGradient>
          <radialGradient id={ballId} cx="42%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#ffe9a0" />
            <stop offset="55%" stopColor="#e0b145" />
            <stop offset="100%" stopColor="#9a6f18" />
          </radialGradient>
          <radialGradient id={glowId} cx="50%" cy="35%" r="55%">
            <stop offset="0%" stopColor="rgba(255, 230, 140, 0.5)" />
            <stop offset="100%" stopColor="rgba(255, 230, 140, 0)" />
          </radialGradient>
        </defs>

        <ellipse cx="60" cy="78" rx="42" ry="50" fill={`url(#${glowId})`} />

        {/* Net / rim cup */}
        <path
          d="M28 58 C28 42, 42 34, 60 34 C78 34, 92 42, 92 58 L86 78 C86 92, 74 100, 60 100 C46 100, 34 92, 34 78 Z"
          fill={`url(#${goldId})`}
          stroke="rgba(90,60,10,0.35)"
          strokeWidth="1.2"
        />
        <ellipse
          cx="60"
          cy="58"
          rx="28"
          ry="10"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="2"
        />
        <path
          d="M36 62 Q60 74 84 62"
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.4"
        />
        <path
          d="M38 70 Q60 82 82 70"
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1.2"
        />

        {/* Basketball on top */}
        <circle cx="60" cy="34" r="16" fill={`url(#${ballId})`} />
        <path
          d="M60 18 C52 24, 52 44, 60 50 C68 44, 68 24, 60 18"
          fill="none"
          stroke="rgba(90,60,10,0.45)"
          strokeWidth="1.3"
        />
        <path
          d="M46 28 C54 30, 66 30, 74 28"
          fill="none"
          stroke="rgba(90,60,10,0.4)"
          strokeWidth="1.2"
        />
        <path
          d="M46 40 C54 38, 66 38, 74 40"
          fill="none"
          stroke="rgba(90,60,10,0.35)"
          strokeWidth="1.1"
        />

        {/* Stem */}
        <rect x="54" y="98" width="12" height="22" rx="2" fill={`url(#${goldId})`} />
        <rect
          x="52"
          y="98"
          width="16"
          height="4"
          rx="1"
          fill="#f4d98a"
          opacity="0.7"
        />

        {/* Base */}
        <path
          d="M34 120 L86 120 L92 138 L28 138 Z"
          fill={`url(#${goldId})`}
          stroke="rgba(90,60,10,0.35)"
          strokeWidth="1"
        />
        <ellipse cx="60" cy="138" rx="34" ry="7" fill={`url(#${goldId})`} />
        <ellipse
          cx="60"
          cy="136"
          rx="26"
          ry="3.5"
          fill="rgba(255,255,255,0.18)"
        />
      </svg>
    </div>
  );
}
