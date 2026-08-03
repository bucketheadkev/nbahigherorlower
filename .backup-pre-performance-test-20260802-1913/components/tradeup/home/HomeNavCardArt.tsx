import { getHeadshotUrl } from '@/lib/tradeup/playerHeadshots';

type CollagePlayer = {
  id: string;
  name: string;
  top: string;
  left: string;
  rotate: number;
  scale: number;
  opacity: number;
  blur?: number;
  z: number;
};

const TRADING_COLLAGE: CollagePlayer[] = [
  { id: 'jokic', name: 'Nikola Jokic', top: '6%', left: '2%', rotate: -14, scale: 0.78, opacity: 0.42, blur: 0.5, z: 1 },
  { id: 'wemby', name: 'Victor Wembanyama', top: '4%', left: '58%', rotate: 10, scale: 0.82, opacity: 0.48, z: 2 },
  { id: 'anthony_edwards', name: 'Anthony Edwards', top: '18%', left: '72%', rotate: 16, scale: 0.72, opacity: 0.38, blur: 1, z: 1 },
  { id: 'tatum', name: 'Jayson Tatum', top: '28%', left: '-4%', rotate: -8, scale: 0.88, opacity: 0.52, z: 3 },
  { id: 'doncic', name: 'Luka Doncic', top: '32%', left: '38%', rotate: -3, scale: 1, opacity: 0.62, z: 4 },
  { id: 'giannis', name: 'Giannis Antetokounmpo', top: '22%', left: '18%', rotate: 6, scale: 0.9, opacity: 0.5, z: 3 },
  { id: 'durant', name: 'Kevin Durant', top: '48%', left: '68%', rotate: 12, scale: 0.8, opacity: 0.44, blur: 0.5, z: 2 },
  { id: 'caruso', name: 'Alex Caruso', top: '52%', left: '8%', rotate: -11, scale: 0.74, opacity: 0.4, z: 2 },
  { id: 'haliburton', name: 'Tyrese Haliburton', top: '58%', left: '42%', rotate: 5, scale: 0.86, opacity: 0.46, blur: 0.5, z: 2 },
  { id: 'knueppel', name: 'Kon Knueppel', top: '62%', left: '78%', rotate: -9, scale: 0.7, opacity: 0.36, blur: 1, z: 1 },
  { id: 'embiid', name: 'Joel Embiid', top: '68%', left: '22%', rotate: -6, scale: 0.76, opacity: 0.4, z: 1 },
  { id: 'wallace', name: 'Cason Wallace', top: '70%', left: '55%', rotate: 8, scale: 0.72, opacity: 0.38, blur: 1, z: 1 },
];

function CourtTexture() {
  return (
    <svg className="home-nav-art-court" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <pattern id="nav-court-wood" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#1a1410" />
          <rect width="8" height="1" fill="#221a14" opacity="0.6" />
        </pattern>
        <radialGradient id="nav-court-glow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="rgba(52,211,153,0.18)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0)" />
        </radialGradient>
      </defs>
      <rect width="200" height="200" fill="url(#nav-court-wood)" />
      <rect width="200" height="200" fill="url(#nav-court-glow)" />
      <g stroke="rgba(255,255,255,0.07)" strokeWidth="0.75" fill="none">
        <rect x="24" y="30" width="152" height="140" rx="2" />
        <circle cx="100" cy="100" r="22" />
        <line x1="100" y1="30" x2="100" y2="170" />
        <path d="M24 100 Q52 100 52 72 M24 100 Q52 100 52 128" />
        <path d="M176 100 Q148 100 148 72 M176 100 Q148 100 148 128" />
      </g>
      <g stroke="rgba(52,211,153,0.35)" strokeWidth="1.2" fill="none" opacity="0.7">
        <path d="M58 88 L72 100 L58 112" />
        <path d="M142 88 L128 100 L142 112" />
        <path d="M88 58 L100 72 L112 58" opacity="0.5" />
      </g>
    </svg>
  );
}

function TradeArrows() {
  return (
    <svg className="home-nav-art-arrows" viewBox="0 0 200 200" aria-hidden>
      <g stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <path d="M36 54 L52 54 M44 46 L52 54 L44 62" />
        <path d="M164 146 L148 146 M156 138 L148 146 L156 154" />
        <path d="M155 48 L168 62 M168 48 L168 62 L155 62" opacity="0.6" />
      </g>
      <g fill="rgba(52,211,153,0.25)">
        <circle cx="100" cy="100" r="28" />
      </g>
    </svg>
  );
}

export function NavCardArtTrading() {
  return (
    <div className="home-nav-art home-nav-art--trading">
      <CourtTexture />
      <TradeArrows />
      <div className="home-nav-art-glow home-nav-art-glow--trade" aria-hidden />
      <div className="home-nav-art-players" aria-hidden>
        {TRADING_COLLAGE.map((player) => {
          const src = getHeadshotUrl(player.id, player.name);
          if (!src) return null;
          return (
            <div
              key={player.id}
              className="home-nav-art-player"
              style={{
                top: player.top,
                left: player.left,
                zIndex: player.z,
                opacity: player.opacity,
                transform: `rotate(${player.rotate}deg) scale(${player.scale})`,
                filter: player.blur ? `blur(${player.blur}px)` : undefined,
              }}
            >
              <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NavCardArtStore() {
  return (
    <svg className="home-nav-art home-nav-art--store" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="nav-store-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5d77a" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
        <linearGradient id="nav-store-crate" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3d3428" />
          <stop offset="100%" stopColor="#1a1612" />
        </linearGradient>
        <filter id="nav-store-blur">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <rect width="200" height="200" fill="#0c0e12" />
      <rect x="0" y="0" width="200" height="200" fill="rgba(245,215,122,0.04)" />

      {/* Background coins — faded */}
      <g opacity="0.35" filter="url(#nav-store-blur)">
        <circle cx="28" cy="42" r="14" fill="url(#nav-store-gold)" opacity="0.5" />
        <text x="28" y="46" textAnchor="middle" fill="#1a1208" fontSize="10" fontWeight="700">+</text>
        <circle cx="168" cy="58" r="12" fill="url(#nav-store-gold)" opacity="0.45" />
        <circle cx="175" cy="155" r="16" fill="url(#nav-store-gold)" opacity="0.4" />
        <circle cx="22" cy="148" r="11" fill="url(#nav-store-gold)" opacity="0.35" />
      </g>

      {/* Mystery crate — mid left */}
      <g transform="translate(18,72) rotate(-8)" opacity="0.55">
        <rect width="44" height="36" rx="3" fill="url(#nav-store-crate)" stroke="rgba(245,215,122,0.25)" strokeWidth="1" />
        <rect x="8" y="10" width="28" height="4" rx="1" fill="rgba(245,215,122,0.2)" />
        <text x="22" y="28" textAnchor="middle" fill="rgba(245,215,122,0.5)" fontSize="14" fontWeight="700">?</text>
      </g>

      {/* Reward pack — center back */}
      <g transform="translate(72,38) rotate(4)" opacity="0.5">
        <rect width="56" height="72" rx="4" fill="#1e2430" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <rect x="8" y="12" width="40" height="28" rx="2" fill="rgba(96,165,250,0.15)" stroke="rgba(96,165,250,0.3)" strokeWidth="0.75" />
        <path d="M28 52 L28 64 M22 58 L34 58" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
      </g>

      {/* Lightning upgrade */}
      <g transform="translate(128,28) rotate(12)" opacity="0.65">
        <path d="M20 8 L8 32 H18 L14 52 L32 24 H22 Z" fill="rgba(250,204,21,0.35)" stroke="rgba(250,204,21,0.6)" strokeWidth="1" strokeLinejoin="round" />
      </g>

      {/* Trophy — foreground right */}
      <g transform="translate(130,88) rotate(6)" opacity="0.7">
        <path d="M16 4 H24 V12 C24 20 20 24 20 24 C20 24 16 20 16 12 Z" fill="rgba(245,215,122,0.25)" stroke="rgba(245,215,122,0.45)" strokeWidth="1" />
        <path d="M12 12 C12 18 8 20 4 18 M28 12 C28 18 32 20 36 18" stroke="rgba(245,215,122,0.4)" strokeWidth="1" fill="none" />
        <rect x="14" y="24" width="12" height="4" fill="rgba(245,215,122,0.3)" />
        <rect x="10" y="28" width="20" height="5" rx="1" fill="rgba(245,215,122,0.2)" stroke="rgba(245,215,122,0.35)" strokeWidth="0.75" />
      </g>

      {/* Shield perk */}
      <g transform="translate(38,118) rotate(-10)" opacity="0.55">
        <path d="M20 4 L34 10 V22 C34 32 20 38 20 38 C20 38 6 32 6 22 V10 Z" fill="rgba(96,165,250,0.12)" stroke="rgba(96,165,250,0.35)" strokeWidth="1" />
        <path d="M14 22 L18 26 L28 16" stroke="rgba(96,165,250,0.5)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </g>

      {/* Premium badge */}
      <g transform="translate(148,130) rotate(8)" opacity="0.6">
        <circle cx="16" cy="16" r="15" fill="rgba(239,68,68,0.15)" stroke="rgba(239,68,68,0.4)" strokeWidth="1" />
        <path d="M16 8 L18 14 L24 14 L19 18 L21 24 L16 20 L11 24 L13 18 L8 14 L14 14 Z" fill="rgba(239,68,68,0.35)" />
      </g>

      {/* Collection cards stack */}
      <g transform="translate(78,108) rotate(-4)" opacity="0.65">
        <rect x="4" y="8" width="36" height="48" rx="3" fill="#252830" stroke="rgba(255,255,255,0.1)" strokeWidth="0.75" transform="rotate(-6 22 32)" />
        <rect x="8" y="4" width="36" height="48" rx="3" fill="#2a3040" stroke="rgba(255,255,255,0.14)" strokeWidth="0.75" transform="rotate(3 26 28)" />
        <rect x="12" y="0" width="36" height="48" rx="3" fill="#303848" stroke="rgba(245,215,122,0.25)" strokeWidth="1" />
        <rect x="18" y="8" width="24" height="16" rx="2" fill="rgba(255,255,255,0.06)" />
      </g>

      {/* Foreground coin */}
      <g transform="translate(92,148)" opacity="0.75">
        <circle cx="20" cy="20" r="18" fill="url(#nav-store-gold)" opacity="0.55" stroke="rgba(245,215,122,0.5)" strokeWidth="1" />
        <text x="20" y="25" textAnchor="middle" fill="#1a1208" fontSize="14" fontWeight="800">cr</text>
      </g>
    </svg>
  );
}

export function NavCardArtFranchise() {
  return (
    <svg className="home-nav-art home-nav-art--franchise" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="nav-franchise-spot" cx="50%" cy="0%" r="80%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <filter id="nav-franchise-blur">
          <feGaussianBlur stdDeviation="0.8" />
        </filter>
      </defs>
      <rect width="200" height="200" fill="#0a0c10" />
      <rect width="200" height="200" fill="url(#nav-franchise-spot)" />

      {/* Arena lighting beams */}
      <g opacity="0.12">
        <path d="M100 0 L60 200" stroke="rgba(255,255,255,0.3)" strokeWidth="20" />
        <path d="M100 0 L140 200" stroke="rgba(255,255,255,0.2)" strokeWidth="16" />
      </g>

      {/* Court diagram — background */}
      <g transform="translate(8,95) rotate(-6)" opacity="0.35" filter="url(#nav-franchise-blur)">
        <rect width="90" height="60" rx="2" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.75" />
        <circle cx="45" cy="30" r="10" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.75" />
        <line x1="45" y1="0" x2="45" y2="60" stroke="rgba(255,255,255,0.1)" strokeWidth="0.75" />
        <path d="M0 30 Q20 30 20 18 M0 30 Q20 30 20 42" stroke="rgba(255,255,255,0.1)" strokeWidth="0.75" fill="none" />
      </g>

      {/* Play diagram */}
      <g transform="translate(118,18) rotate(8)" opacity="0.45">
        <circle cx="20" cy="20" r="4" fill="rgba(239,68,68,0.4)" />
        <circle cx="50" cy="12" r="4" fill="rgba(239,68,68,0.3)" />
        <circle cx="58" cy="38" r="4" fill="rgba(239,68,68,0.3)" />
        <path d="M20 20 Q35 8 50 12 M50 12 L58 38" stroke="rgba(239,68,68,0.35)" strokeWidth="1" strokeDasharray="3 2" fill="none" />
      </g>

      {/* Starting lineup board */}
      <g transform="translate(52,32) rotate(-2)" opacity="0.65">
        <rect width="96" height="72" rx="3" fill="#141820" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <text x="48" y="14" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="6" fontWeight="600" letterSpacing="1">STARTING FIVE</text>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} transform={`translate(${8 + i * 18},22)`}>
            <rect width="14" height="18" rx="2" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
            <circle cx="7" cy="8" r="4" fill="rgba(255,255,255,0.08)" />
            <rect x="3" y="14" width="8" height="2" rx="0.5" fill="rgba(255,255,255,0.1)" />
          </g>
        ))}
        <rect x="8" y="54" width="80" height="3" rx="1" fill="rgba(52,211,153,0.2)" />
        <rect x="8" y="54" width="52" height="3" rx="1" fill="rgba(52,211,153,0.45)" />
      </g>

      {/* Analytics chart */}
      <g transform="translate(14,42) rotate(-12)" opacity="0.4" filter="url(#nav-franchise-blur)">
        <rect width="48" height="36" rx="2" fill="#12151c" stroke="rgba(255,255,255,0.08)" strokeWidth="0.75" />
        <polyline points="8,28 16,22 24,24 32,14 40,18" stroke="rgba(96,165,250,0.5)" strokeWidth="1.5" fill="none" />
      </g>

      {/* Clipboard */}
      <g transform="translate(148,72) rotate(10)" opacity="0.55">
        <rect x="4" y="8" width="32" height="40" rx="2" fill="#1a1e26" stroke="rgba(255,255,255,0.12)" strokeWidth="0.75" />
        <rect x="12" y="4" width="16" height="8" rx="2" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.75" />
        <line x1="10" y1="22" x2="30" y2="22" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        <line x1="10" y1="28" x2="26" y2="28" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <line x1="10" y1="34" x2="28" y2="34" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      </g>

      {/* Championship rings */}
      <g transform="translate(156,138) rotate(6)" opacity="0.5">
        <ellipse cx="12" cy="14" rx="10" ry="8" fill="none" stroke="rgba(245,215,122,0.35)" strokeWidth="2" />
        <ellipse cx="22" cy="16" rx="10" ry="8" fill="none" stroke="rgba(245,215,122,0.25)" strokeWidth="1.5" />
        <ellipse cx="32" cy="14" rx="10" ry="8" fill="none" stroke="rgba(245,215,122,0.2)" strokeWidth="1.5" />
      </g>

      {/* Trophy — foreground */}
      <g transform="translate(24,118) rotate(-8)" opacity="0.7">
        <path d="M18 6 H26 V14 C26 22 22 26 22 26 C22 26 18 22 18 14 Z" fill="rgba(245,215,122,0.2)" stroke="rgba(245,215,122,0.45)" strokeWidth="1" />
        <path d="M14 14 C14 20 10 22 6 20 M30 14 C30 20 34 22 38 20" stroke="rgba(245,215,122,0.35)" strokeWidth="1" fill="none" />
        <rect x="16" y="26" width="12" height="4" fill="rgba(245,215,122,0.25)" />
        <rect x="12" y="30" width="20" height="5" rx="1" fill="rgba(245,215,122,0.15)" stroke="rgba(245,215,122,0.3)" strokeWidth="0.75" />
      </g>

      {/* Salary cap doc */}
      <g transform="translate(128,148) rotate(4)" opacity="0.45">
        <rect width="40" height="32" rx="2" fill="#161a22" stroke="rgba(255,255,255,0.1)" strokeWidth="0.75" />
        <text x="20" y="12" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="5" fontWeight="600">CAP SHEET</text>
        <rect x="6" y="16" width="28" height="2" rx="0.5" fill="rgba(239,68,68,0.3)" />
        <rect x="6" y="21" width="20" height="2" rx="0.5" fill="rgba(255,255,255,0.1)" />
        <rect x="6" y="26" width="24" height="2" rx="0.5" fill="rgba(255,255,255,0.08)" />
      </g>

      {/* Team logo silhouettes */}
      <g opacity="0.2">
        <circle cx="172" cy="28" r="12" fill="rgba(239,68,68,0.3)" />
        <circle cx="175" cy="28" r="8" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <rect x="8" y="168" width="16" height="16" rx="8" fill="rgba(96,165,250,0.25)" />
      </g>

      {/* Strategy board accent */}
      <g transform="translate(88,158)" opacity="0.35">
        <rect width="64" height="36" rx="2" fill="#10141a" stroke="rgba(255,255,255,0.08)" strokeWidth="0.75" />
        <circle cx="20" cy="18" r="6" fill="none" stroke="rgba(52,211,153,0.3)" strokeWidth="0.75" />
        <circle cx="44" cy="18" r="6" fill="none" stroke="rgba(52,211,153,0.2)" strokeWidth="0.75" />
      </g>
    </svg>
  );
}
