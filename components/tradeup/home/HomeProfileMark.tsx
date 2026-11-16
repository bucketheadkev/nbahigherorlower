'use client';

import type { MouseEventHandler } from 'react';

interface HomeProfileMarkProps {
  label: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

/** Circular profile mark — gold ring, light avatar (reference). */
export function HomeProfileMark({ label, onClick }: HomeProfileMarkProps) {
  const body = (
    <svg className="home-profile__svg" viewBox="0 0 48 48" width="48" height="48" aria-hidden>
      <defs>
        <linearGradient id="home-profile-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset="0.5" stopColor="#f0a020" />
          <stop offset="1" stopColor="#c87810" />
        </linearGradient>
        <linearGradient id="home-profile-face" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#9ec5ff" />
          <stop offset="1" stopColor="#5a8fd4" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22.5" fill="url(#home-profile-face)" stroke="url(#home-profile-ring)" strokeWidth="2.4" />
      <circle cx="24" cy="19" r="7.2" fill="#f4f8ff" />
      <path d="M9.5 39c2.2-8 8.2-11.5 14.5-11.5S36.3 31 38.5 39" fill="#f4f8ff" />
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
    <button type="button" className="home-profile home-profile--btn ui-tap" aria-label={label} onClick={onClick}>
      {body}
    </button>
  );
}
