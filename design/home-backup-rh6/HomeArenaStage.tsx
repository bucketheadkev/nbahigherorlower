'use client';

/**
 * Mid-hero — perspective night court + hoop + wealth rise.
 * Designed SVG (not a photo plate). Decorative only.
 */
export function HomeArenaStage() {
  return (
    <div className="rh6-stage" aria-hidden>
      <div className="rh6-stage__bloom" />
      <div className="rh6-stage__lights" />
      <svg className="rh6-stage__court" viewBox="0 0 360 230" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="rh6-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14356a" stopOpacity="0.35" />
            <stop offset="55%" stopColor="#0a2454" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#041028" stopOpacity="0.98" />
          </linearGradient>
          <linearGradient id="rh6-plank" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0d2a58" />
            <stop offset="50%" stopColor="#163f78" />
            <stop offset="100%" stopColor="#0d2a58" />
          </linearGradient>
          <linearGradient id="rh6-rise" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#15b872" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#29e490" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#4ef5a8" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="rh6-ball" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff8a3d" />
            <stop offset="100%" stopColor="#c44512" />
          </linearGradient>
          <radialGradient id="rh6-spot" cx="50%" cy="20%" r="60%">
            <stop offset="0%" stopColor="rgba(120,180,255,0.35)" />
            <stop offset="100%" stopColor="rgba(120,180,255,0)" />
          </radialGradient>
        </defs>

        <ellipse cx="180" cy="48" rx="110" ry="36" fill="url(#rh6-spot)" />

        {/* Outer court plane */}
        <path
          d="M18 178 L180 62 L342 178 L180 214 Z"
          fill="url(#rh6-floor)"
          stroke="rgba(160,200,255,0.35)"
          strokeWidth="1.4"
        />
        {/* Inner paint */}
        <path
          d="M78 178 L180 92 L282 178 L180 200 Z"
          fill="url(#rh6-plank)"
          opacity="0.95"
        />
        {/* Lane */}
        <path
          d="M128 178 L128 140 Q180 118 232 140 L232 178"
          fill="rgba(4,16,40,0.35)"
          stroke="rgba(220,232,255,0.4)"
          strokeWidth="1.5"
        />
        <path
          d="M108 178 Q180 108 252 178"
          fill="none"
          stroke="rgba(220,232,255,0.28)"
          strokeWidth="1.4"
        />
        <circle cx="180" cy="156" r="9" fill="none" stroke="rgba(220,232,255,0.35)" strokeWidth="1.2" />
        {/* Free-throw hash marks */}
        <path d="M128 152 h-10 M232 152 h10 M128 164 h-8 M232 164 h8" stroke="rgba(220,232,255,0.25)" strokeWidth="1.2" />

        {/* Wealth rise */}
        <g className="rh6-stage__bars">
          <rect className="rh6-stage__bar rh6-stage__bar--1" x="128" y="138" width="12" height="38" rx="2.5" fill="url(#rh6-rise)" />
          <rect className="rh6-stage__bar rh6-stage__bar--2" x="146" y="120" width="12" height="56" rx="2.5" fill="url(#rh6-rise)" />
          <rect className="rh6-stage__bar rh6-stage__bar--3" x="164" y="102" width="12" height="74" rx="2.5" fill="url(#rh6-rise)" />
          <rect className="rh6-stage__bar rh6-stage__bar--4" x="182" y="86" width="12" height="90" rx="2.5" fill="url(#rh6-rise)" />
          <rect className="rh6-stage__bar rh6-stage__bar--5" x="200" y="72" width="12" height="104" rx="2.5" fill="url(#rh6-rise)" />
          <rect className="rh6-stage__bar rh6-stage__bar--6" x="218" y="58" width="12" height="118" rx="2.5" fill="url(#rh6-rise)" />
        </g>

        {/* Hoop + backboard */}
        <g className="rh6-stage__hoop">
          <rect x="166" y="28" width="28" height="18" rx="2" fill="#d7e2f5" opacity="0.55" />
          <rect x="174" y="44" width="12" height="22" rx="1.5" fill="#b8c7de" opacity="0.7" />
          <ellipse cx="180" cy="66" rx="26" ry="8" fill="none" stroke="#e55622" strokeWidth="3.6" />
          <ellipse cx="180" cy="66" rx="20" ry="5.5" fill="none" stroke="rgba(255,180,120,0.45)" strokeWidth="1.2" />
          <path
            d="M158 68 Q180 96 202 68"
            fill="none"
            stroke="rgba(232,240,255,0.5)"
            strokeWidth="1.3"
            strokeDasharray="3.5 2.5"
          />
        </g>

        {/* Ball */}
        <g className="rh6-stage__ball">
          <circle cx="248" cy="152" r="14" fill="url(#rh6-ball)" />
          <path
            d="M248 138 Q256 152 248 166 M234 152 h28 M239 143 Q248 152 257 161 M239 161 Q248 152 257 143"
            fill="none"
            stroke="rgba(40,12,0,0.45)"
            strokeWidth="1.2"
          />
          <ellipse cx="244" cy="146" rx="4" ry="2.5" fill="rgba(255,255,255,0.25)" />
        </g>
      </svg>
      <div className="rh6-stage__glow" />
    </div>
  );
}
