'use client';

/**
 * Leaderboard backdrop: deep navy into near-black, an emerald light over the podium, two faint
 * arena beams, and the court drawn in barely-there lines. Static — nothing animates or scrolls.
 */
export function LeaderboardBackdrop() {
  return (
    <div className="arena-atmo lbx-backdrop" aria-hidden>
      <div className="lbx-backdrop__base" />
      <div className="lbx-backdrop__beam is-left" />
      <div className="lbx-backdrop__beam is-right" />
      <svg className="lbx-backdrop__court" viewBox="0 0 400 860" preserveAspectRatio="xMidYMin slice">
        <g fill="none" strokeWidth="1.4">
          {/* Baseline, key and free-throw circle under the podium */}
          <path d="M20 120H380" />
          <rect x="140" y="120" width="120" height="190" />
          <path d="M140 310a60 60 0 0 0 120 0" />
          <path d="M140 310a60 60 0 0 1 120 0" strokeDasharray="6 7" />
          <path d="M44 120v108a156 156 0 0 0 312 0V120" />
          <circle cx="200" cy="150" r="9" />
          <path d="M176 136h48" />
          {/* Half-court line and center circle further down */}
          <path d="M20 700H380" />
          <circle cx="200" cy="700" r="60" />
          <circle cx="200" cy="700" r="20" />
          <path d="M20 120V860M380 120V860" />
        </g>
      </svg>
      <div className="lbx-backdrop__crown" />
      <div className="lbx-backdrop__vignette" />
    </div>
  );
}
