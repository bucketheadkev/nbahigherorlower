'use client';

import { useId, type MouseEventHandler, type PointerEventHandler } from 'react';

interface HomeProfileMarkProps {
  label: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
}

/** Premium circular profile — gold bezel, cool face, soft inner glow. */
export function HomeProfileMark({ label, onClick, onPointerDown }: HomeProfileMarkProps) {
  const uid = useId().replace(/:/g, '');
  const ring = `${uid}-ring`;
  const face = `${uid}-face`;
  const gloss = `${uid}-gloss`;

  const body = (
    <svg className="home-profile__svg" viewBox="0 0 48 48" width="48" height="48" aria-hidden>
      <defs>
        <linearGradient id={ring} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe4a8" />
          <stop offset="0.45" stopColor="#f0a820" />
          <stop offset="1" stopColor="#b86a08" />
        </linearGradient>
        <radialGradient id={face} cx="0.35" cy="0.28" r="0.85">
          <stop offset="0" stopColor="#c8dcff" />
          <stop offset="0.55" stopColor="#6e9ad8" />
          <stop offset="1" stopColor="#2f5288" />
        </radialGradient>
        <linearGradient id={gloss} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="0.45" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22.8" fill={`url(#${ring})`} />
      <circle cx="24" cy="24" r="19.6" fill={`url(#${face})`} />
      <circle cx="24" cy="24" r="19.6" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      <ellipse cx="18.5" cy="14.5" rx="9" ry="5.5" fill={`url(#${gloss})`} />
      <circle cx="24" cy="18.8" r="7.1" fill="#f7faff" />
      <path d="M10.2 39.2c2.1-8.2 8-11.8 13.8-11.8s11.7 3.6 13.8 11.8" fill="#f7faff" />
      <circle cx="24" cy="24" r="22.8" fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth="0.8" />
    </svg>
  );

  if (!onClick) {
    return (
      <span className="home-profile" aria-label={label}>
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="home-profile home-profile--btn ui-tap"
      aria-label={label}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {body}
    </button>
  );
}
