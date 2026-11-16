'use client';

/**
 * Crisp home atmosphere — layered SVG court geometry + navy lighting.
 * No photos, no hoop, no giant wordmark, no futuristic tunnel.
 */
export function HomeArenaBackdrop() {
  return (
    <div className="home-arena" aria-hidden>
      <div className="home-arena__base" />
      <div className="home-arena__light home-arena__light--a" />
      <div className="home-arena__light home-arena__light--b" />
      <div className="home-arena__light home-arena__light--c" />
      <div className="home-arena__stands" />
      <svg className="home-arena__court" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="home-court-stroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9ec5ff" stopOpacity="0.28" />
            <stop offset="0.55" stopColor="#5a9dff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#3d7fd6" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="home-floor" x1="0.5" y1="0.2" x2="0.5" y2="1">
            <stop offset="0" stopColor="#0d1c3a" stopOpacity="0.15" />
            <stop offset="1" stopColor="#061018" stopOpacity="0.55" />
          </linearGradient>
          <radialGradient id="home-spot" cx="0.5" cy="0.35" r="0.55">
            <stop offset="0" stopColor="#7eb6ff" stopOpacity="0.18" />
            <stop offset="1" stopColor="#7eb6ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Perspective floor wash */}
        <ellipse cx="195" cy="520" rx="210" ry="260" fill="url(#home-floor)" />
        <ellipse cx="195" cy="430" rx="160" ry="120" fill="url(#home-spot)" />

        {/* Floor planks (subtle converging lines) */}
        {[-120, -80, -40, 0, 40, 80, 120].map((dx, i) => (
          <path
            key={i}
            d={`M${195 + dx * 0.35} 180 L${195 + dx} 820`}
            fill="none"
            stroke="rgba(126,182,255,0.05)"
            strokeWidth="1"
          />
        ))}

        {/* Sidelines */}
        <path
          d="M42 150V790M348 150V790"
          fill="none"
          stroke="url(#home-court-stroke)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* Mid-court */}
        <path d="M42 470H348" fill="none" stroke="url(#home-court-stroke)" strokeWidth="1.6" />
        <circle cx="195" cy="470" r="58" fill="none" stroke="url(#home-court-stroke)" strokeWidth="1.6" />
        <circle cx="195" cy="470" r="7" fill="#7eb6ff" fillOpacity="0.2" />

        {/* Near key — geometry only */}
        <path d="M132 790V705h126v85" fill="none" stroke="url(#home-court-stroke)" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M132 705a63 63 0 0 1 126 0" fill="none" stroke="url(#home-court-stroke)" strokeWidth="1.6" />

        {/* Far key suggestion */}
        <path d="M145 150V210h100V150" fill="none" stroke="url(#home-court-stroke)" strokeWidth="1.2" opacity="0.55" />
        <path d="M145 210a50 50 0 0 0 100 0" fill="none" stroke="url(#home-court-stroke)" strokeWidth="1.2" opacity="0.55" />
      </svg>
      <div className="home-arena__veil" />
      <div className="home-arena__vignette" />
    </div>
  );
}
