'use client';

import { useId } from 'react';

/**
 * Arena exterior: domed roof with rim lights, glass curtain wall, entrance canopy and plaza.
 * `tone="ink"` draws it in the current text color (on a team-colored button).
 */
export function ArenaIcon({ className, tone = 'gold' }: { className?: string; tone?: 'gold' | 'ink' }) {
  const id = useId().replace(/:/g, '');
  const body = tone === 'gold' ? `url(#arena-body-${id})` : 'currentColor';
  const roof = tone === 'gold' ? `url(#arena-roof-${id})` : 'currentColor';
  const line = tone === 'gold' ? 'rgba(60, 22, 4, 0.55)' : 'rgba(0, 0, 0, 0.28)';
  const lamp = tone === 'gold' ? '#fff3cf' : 'currentColor';
  return (
    <svg className={className} viewBox="0 0 48 40" aria-hidden>
      {tone === 'gold' ? (
        <defs>
          <linearGradient id={`arena-roof-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd79a" />
            <stop offset="1" stopColor="#ff9a3d" />
          </linearGradient>
          <linearGradient id={`arena-body-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb25a" />
            <stop offset="0.6" stopColor="#f2741f" />
            <stop offset="1" stopColor="#b8460d" />
          </linearGradient>
        </defs>
      ) : null}
      {/* Dome */}
      <path d="M5 17.2C8.6 9.4 16 5.6 24 5.6s15.4 3.8 19 11.6Z" fill={roof} />
      <path d="M11 16.6c2.6-4.7 7.3-7.3 13-7.3s10.4 2.6 13 7.3" fill="none" stroke={line} strokeWidth="0.9" />
      {/* Roof rim with lights */}
      <rect x="3.5" y="16.8" width="41" height="3.2" rx="1.2" fill={roof} />
      {[8, 14, 20, 28, 34, 40].map((x) => (
        <circle key={x} cx={x} cy="18.4" r="0.75" fill={lamp} opacity={tone === 'gold' ? 0.95 : 0.6} />
      ))}
      {/* Glass curtain wall */}
      <path d="M5.5 20h37l-1.2 12.4H6.7Z" fill={body} />
      {[10, 14.5, 19, 29, 33.5, 38].map((x) => (
        <path key={x} d={`M${x} 20.6v11.4`} stroke={line} strokeWidth="0.8" />
      ))}
      <path d="M6 25.6h36" stroke={line} strokeWidth="0.7" />
      {/* Entrance + canopy */}
      <path d="M18.5 24.2h11l1.2 1.4H17.3Z" fill={roof} />
      <rect x="19.6" y="25.6" width="8.8" height="6.8" rx="0.6" fill={line} />
      <path d="M24 25.8v6.4" stroke={tone === 'gold' ? 'rgba(255, 220, 170, 0.6)' : 'rgba(255, 255, 255, 0.35)'} strokeWidth="0.6" />
      {/* Plaza steps */}
      <rect x="2" y="32.4" width="44" height="1.8" rx="0.9" fill={roof} />
      <rect x="6" y="34.6" width="36" height="1.4" rx="0.7" fill={body} opacity="0.75" />
    </svg>
  );
}
