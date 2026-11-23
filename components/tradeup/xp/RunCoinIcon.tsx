'use client';

import { useId } from 'react';

interface RunCoinIconProps {
  className?: string;
  size?: number;
  title?: string;
  /** Hub coin pill uses gold; rewards keep the default silver/blue. */
  tone?: 'silver' | 'gold';
}

/**
 * Premium 1B Run coin — silver/blue metal by default, optional gold tone.
 * Unique gradient ids per instance so multiple coins on one screen stay sharp.
 */
export function RunCoinIcon({ className, size = 32, title, tone = 'silver' }: RunCoinIconProps) {
  const uid = useId().replace(/:/g, '');
  const face = `${uid}-face`;
  const rim = `${uid}-rim`;
  const shine = `${uid}-shine`;
  const engr = `${uid}-engr`;
  const gold = tone === 'gold';

  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      <defs>
        <radialGradient id={face} cx="0.32" cy="0.28" r="0.78">
          {gold ? (
            <>
              <stop offset="0" stopColor="#fff6d6" />
              <stop offset="0.4" stopColor="#ffd56a" />
              <stop offset="0.78" stopColor="#d4921a" />
              <stop offset="1" stopColor="#8a5a08" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#f2f7ff" />
              <stop offset="0.45" stopColor="#b7c9e8" />
              <stop offset="0.82" stopColor="#6f8ab8" />
              <stop offset="1" stopColor="#3a5078" />
            </>
          )}
        </radialGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          {gold ? (
            <>
              <stop offset="0" stopColor="#fff8e4" />
              <stop offset="0.35" stopColor="#f0c65a" />
              <stop offset="0.7" stopColor="#b87a12" />
              <stop offset="1" stopColor="#6a4508" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.35" stopColor="#c5d6f2" />
              <stop offset="0.7" stopColor="#7a94c0" />
              <stop offset="1" stopColor="#2f4060" />
            </>
          )}
        </linearGradient>
        <linearGradient id={shine} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.85)" />
          <stop offset="0.4" stopColor="rgba(255,255,255,0.15)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id={engr} x1="0.5" y1="0" x2="0.5" y2="1">
          {gold ? (
            <>
              <stop offset="0" stopColor="#fffdf5" />
              <stop offset="0.55" stopColor="#fff0c2" />
              <stop offset="1" stopColor="#e8c878" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#fff6e8" />
              <stop offset="0.55" stopColor="#ffb45a" />
              <stop offset="1" stopColor="#e06a10" />
            </>
          )}
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14.6" fill={`url(#${rim})`} />
      <circle cx="16" cy="16" r="11.8" fill={`url(#${face})`} />
      <circle
        cx="16"
        cy="16"
        r="9.2"
        fill="none"
        stroke={gold ? 'rgba(90,55,10,0.4)' : 'rgba(40,60,100,0.35)'}
        strokeWidth="1.1"
      />
      <circle
        cx="16"
        cy="16"
        r="9.2"
        fill="none"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="0.6"
        strokeDasharray="2.2 1.6"
      />
      <text
        x="16"
        y="19.2"
        textAnchor="middle"
        fontFamily="Avenir Next, SF Pro Display, Helvetica Neue, Arial, sans-serif"
        fontSize="8.5"
        fontWeight="900"
        letterSpacing="-0.04em"
        fill={`url(#${engr})`}
      >
        1B
      </text>
      <ellipse cx="12.2" cy="10.4" rx="5.2" ry="3.2" fill={`url(#${shine})`} />
    </svg>
  );
}
