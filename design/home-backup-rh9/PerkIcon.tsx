'use client';

import { useId } from 'react';
import type { PerkId } from '@/lib/tradeup/perks';

interface PerkIconProps {
  id: PerkId;
  className?: string;
  /** Pixel size of the SVG view box render. */
  size?: number;
}

/**
 * Shared Classic + Shop perk marks.
 * X-Ray = eyeball with a dollar slash; Double Draft / Swap keep their marks, colored.
 */
export function PerkIcon({ id, className, size = 28 }: PerkIconProps) {
  const uid = useId().replace(/:/g, '');
  const common = {
    className,
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    'aria-hidden': true as const,
    focusable: false as const,
  };

  if (id === 'xray') {
    const iris = `${uid}-iris`;
    return (
      <svg {...common}>
        <defs>
          <radialGradient id={iris} cx="0.45" cy="0.4" r="0.7">
            <stop offset="0" stopColor="#b8ffe0" />
            <stop offset="0.45" stopColor="#2af0a8" />
            <stop offset="1" stopColor="#0a7a52" />
          </radialGradient>
        </defs>
        <ellipse cx="16" cy="16" rx="13.2" ry="8.4" fill="#061810" stroke="#7dffc4" strokeWidth="1.6" />
        <ellipse cx="16" cy="16" rx="7.2" ry="7.2" fill={`url(#${iris})`} />
        <circle cx="16" cy="16" r="3.1" fill="#04120c" />
        <circle cx="14.2" cy="14.2" r="1.1" fill="#ffffff" opacity="0.9" />
        <g transform="rotate(-28 16 16)">
          <text
            x="16"
            y="20.5"
            textAnchor="middle"
            fill="#ffe566"
            stroke="#8a6200"
            strokeWidth="0.6"
            fontSize="16"
            fontWeight="900"
            fontFamily="Avenir Next Condensed, Avenir Next, Helvetica Neue, sans-serif"
          >
            $
          </text>
        </g>
      </svg>
    );
  }

  if (id === 'double_draft') {
    const dd = `${uid}-dd`;
    return (
      <svg {...common}>
        <defs>
          <linearGradient id={dd} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9ec0ff" />
            <stop offset="1" stopColor="#3a6dff" />
          </linearGradient>
        </defs>
        <rect x="3.5" y="5" width="11.5" height="22" rx="2.4" fill={`url(#${dd})`} opacity="0.95" />
        <rect x="17" y="5" width="11.5" height="22" rx="2.4" fill="#d7e6ff" stroke="#6ea0ff" strokeWidth="1.4" />
        <path
          d="M20.2 12.2h5.2M22.8 9.6v5.2M20.2 19.4h5.2"
          fill="none"
          stroke="#1a3a9a"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6.6 12.2h5.2M9.2 9.6v5.2M6.6 19.4h5.2"
          fill="none"
          stroke="#102868"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const swap = `${uid}-swap`;
  return (
    <svg {...common}>
      <defs>
        <linearGradient id={swap} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd08a" />
          <stop offset="1" stopColor="#ff6a2a" />
        </linearGradient>
      </defs>
      <path
        d="M6 11.5h14.5l-3.2-3.4M26 20.5H11.5l3.2 3.4"
        fill="none"
        stroke={`url(#${swap})`}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.2" cy="11.5" r="2.2" fill="#fff0d0" />
      <circle cx="23.8" cy="20.5" r="2.2" fill="#ffb060" />
    </svg>
  );
}
