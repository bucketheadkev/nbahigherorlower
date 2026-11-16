'use client';

/**
 * Wins board backdrop — black championship floor, gold rim light, faint court geometry.
 * Static: nothing animates or scrolls.
 */
export function LeaderboardBackdrop() {
  return (
    <div className="arena-atmo wb-backdrop" aria-hidden>
      <div className="wb-backdrop__void" />
      <div className="wb-backdrop__flare" />
      <div className="wb-backdrop__rim" />
      <svg className="wb-backdrop__court" viewBox="0 0 400 860" preserveAspectRatio="xMidYMin slice">
        <g fill="none" strokeWidth="1.25">
          <path d="M28 96H372" />
          <rect x="148" y="96" width="104" height="168" rx="2" />
          <path d="M148 264a52 52 0 0 0 104 0" />
          <circle cx="200" cy="132" r="8" />
          <path d="M48 96v96a152 152 0 0 0 304 0V96" />
          <path d="M28 640H372" />
          <circle cx="200" cy="640" r="54" />
          <circle cx="200" cy="640" r="16" />
          <path d="M28 96V860M372 96V860" />
        </g>
      </svg>
      <div className="wb-backdrop__vignette" />
    </div>
  );
}
