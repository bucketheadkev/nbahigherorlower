'use client';

import { memo, useId, type CSSProperties } from 'react';
import type { ChestId } from '@/lib/tradeup/franchise/config';

/**
 * The 1B Run chest: one flat illustrated shape (lid, base, emblem) for every chest. Only the
 * body colors, illuminated edges and accents change per tier. Drawn in a 260 × 200 box as three
 * layers (inner light, lid, base) so the opening can lift the lid and raise a jersey between them.
 */

interface ChestTheme {
  body: [string, string, string];
  side: [string, string];
  lidTop: [string, string];
  lidFront: [string, string];
  rim: string;
  rimLight: string;
  band: string;
  bandLight: string;
  accent: [string, string];
  /** r, g, b for CSS glows around the chest. */
  glow: string;
  seam: string;
}

export const CHEST_THEMES: Record<ChestId, ChestTheme> = {
  starter: {
    body: ['#16295a', '#0c1a3d', '#070f27'],
    side: ['#1f3a78', '#0d1b41'],
    lidTop: ['#3a64b4', '#1b3a78'],
    lidFront: ['#1a3572', '#0d1d46'],
    rim: '#5fb2ff',
    rimLight: '#bfe2ff',
    band: '#33a0ff',
    bandLight: '#8fd2ff',
    accent: ['#ffd27a', '#ff7a1a'],
    glow: '45, 135, 255',
    seam: '#060d22',
  },
  pro: {
    body: ['#14802f', '#0b4f1d', '#052a0f'],
    side: ['#1a983b', '#0a3e18'],
    lidTop: ['#45d96f', '#14903a'],
    lidFront: ['#127a2e', '#08451b'],
    rim: '#55ff86',
    rimLight: '#dcffe6',
    band: '#2cf063',
    bandLight: '#b6ffcb',
    accent: ['#d6ffe0', '#3cf274'],
    glow: '46, 240, 110',
    seam: '#042010',
  },
  all_star: {
    body: ['#124cc0', '#0a2d7e', '#061a4c'],
    side: ['#185cdc', '#0a2b76'],
    lidTop: ['#5594ff', '#1b55cc'],
    lidFront: ['#1648b4', '#0a2b72'],
    rim: '#58a2ff',
    rimLight: '#dbeaff',
    band: '#2f86ff',
    bandLight: '#a9cdff',
    accent: ['#dcebff', '#4d98ff'],
    glow: '60, 140, 255',
    seam: '#04123a',
  },
  superstar: {
    body: ['#c4931a', '#7d5c09', '#3d2c03'],
    side: ['#dcab24', '#6e5108'],
    lidTop: ['#ffdc55', '#cc9b16'],
    lidFront: ['#b08414', '#5e4506'],
    rim: '#ffe46e',
    rimLight: '#fff7d6',
    band: '#ffd23a',
    bandLight: '#fff0a8',
    accent: ['#fff6cf', '#ffcf33'],
    glow: '255, 205, 50',
    seam: '#2c1f02',
  },
  legend: {
    body: ['#5f22b6', '#3b137a', '#1d0840'],
    side: ['#7230d2', '#331168'],
    lidTop: ['#ad6dff', '#5c25c2'],
    lidFront: ['#521ca0', '#2b0e5c'],
    rim: '#bb80ff',
    rimLight: '#f1e4ff',
    band: '#a65fff',
    bandLight: '#dcc0ff',
    accent: ['#efe2ff', '#b673ff'],
    glow: '170, 95, 255',
    seam: '#160631',
  },
  goat: {
    body: ['#b8161f', '#780c13', '#3b0508'],
    side: ['#d41e28', '#620a10'],
    lidTop: ['#ff6169', '#c41b25'],
    lidFront: ['#a0131c', '#58080e'],
    rim: '#ff5a64',
    rimLight: '#ffdcde',
    band: '#ff3644',
    bandLight: '#ffadb3',
    accent: ['#ffdcde', '#ff4855'],
    glow: '255, 60, 72',
    seam: '#2c0306',
  },
};

export function chestGlowStyle(chest: ChestId): CSSProperties {
  return { '--chest-glow': CHEST_THEMES[chest].glow, '--chest-rim': CHEST_THEMES[chest].rim } as CSSProperties;
}

/** Unique gradient ids for one chest on screen. */
export function useChestIds(): string {
  return `ch${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

export function ChestDefs({ id, chest }: { id: string; chest: ChestId }) {
  const t = CHEST_THEMES[chest];
  const v = (y1: string, y2: string, a: string, b: string, c?: string) => (
    <>
      <stop offset="0" stopColor={a} />
      {c ? <stop offset={y1} stopColor={b} /> : null}
      <stop offset={y2} stopColor={c ?? b} />
    </>
  );
  return (
    <svg className="chest-defs" width="0" height="0" aria-hidden>
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.5" stopColor="#ffc531" />
          <stop offset="1" stopColor="#d98a0c" />
        </linearGradient>
        <linearGradient id={`${id}-silver`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#e6ecf6" />
          <stop offset="1" stopColor="#b9c5da" />
        </linearGradient>
        <linearGradient id={`${id}-ball`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9a3c" />
          <stop offset="1" stopColor="#e2560f" />
        </linearGradient>
        <clipPath id={`${id}-ball-clip`}>
          <path d="M-21 27a21 21 0 0 0 42 0Z" />
        </clipPath>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          {v('0.55', '1', t.body[0], t.body[1], t.body[2])}
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="0" y2="1">
          {v('1', '1', t.side[0], t.side[1])}
        </linearGradient>
        <linearGradient id={`${id}-lid-top`} x1="0" y1="0" x2="0" y2="1">
          {v('1', '1', t.lidTop[0], t.lidTop[1])}
        </linearGradient>
        <linearGradient id={`${id}-lid-front`} x1="0" y1="0" x2="0" y2="1">
          {v('1', '1', t.lidFront[0], t.lidFront[1])}
        </linearGradient>
        <linearGradient id={`${id}-accent`} x1="0" y1="0" x2="0" y2="1">
          {v('1', '1', t.accent[0], t.accent[1])}
        </linearGradient>
        <linearGradient id={`${id}-lit`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c8790e" stopOpacity="0.7" />
          <stop offset="0.55" stopColor="#ffb52e" stopOpacity="0.92" />
          <stop offset="1" stopColor="#ffe9a8" />
        </linearGradient>
        <radialGradient id={`${id}-mouth`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset="0.35" stopColor="#ffd25a" />
          <stop offset="1" stopColor="#ff9f1a" stopOpacity="0" />
        </radialGradient>
        {/* A darker center panel, as in the reference: light at the edges, deep in the middle. */}
        <linearGradient id={`${id}-panel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000000" stopOpacity="0.18" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.42" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>
    </svg>
  );
}

export function ChestEmblem({ id }: { id: string }) {
  return (
    <>
      <path
        d="M-12 -21.5h24l2.6-10.4-7.4 5.2L0-34l-7.2 7.3-7.4-5.2L-12-21.5Z"
        fill={`url(#${id}-gold)`}
        stroke="#7a4a06"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <circle cx="-14.6" cy="-32.6" r="1.7" fill={`url(#${id}-gold)`} />
      <circle cx="0" cy="-35.4" r="1.9" fill={`url(#${id}-gold)`} />
      <circle cx="14.6" cy="-32.6" r="1.7" fill={`url(#${id}-gold)`} />
      <text className="chest-emblem__text" x="0" y="-1" fontSize="27" fill={`url(#${id}-silver)`}>
        1B
      </text>
      <text className="chest-emblem__text" x="0" y="23" fontSize="25" fill={`url(#${id}-silver)`}>
        RUN
      </text>
      <g clipPath={`url(#${id}-ball-clip)`}>
        <path d="M-21 27a21 21 0 0 0 42 0Z" fill={`url(#${id}-ball)`} />
        <path
          d="M0 27v22M-21 27c8 2 11 8 10.5 19M21 27c-8 2-11 8-10.5 19M-19.5 36.5c13 3 26 3 39 0"
          fill="none"
          stroke="#2a1205"
          strokeWidth="1.7"
        />
      </g>
    </>
  );
}

export function ChestMouth({ id, className = '' }: { id: string; className?: string }) {
  return (
    <svg className={`chest-layer chest-layer--mouth ${className}`} viewBox="0 0 260 200" aria-hidden>
      <ellipse cx="130" cy="80" rx="122" ry="16" fill={`url(#${id}-mouth)`} />
      <rect x="22" y="76" width="216" height="6" rx="3" fill="#ffe7a0" />
    </svg>
  );
}

export function ChestLid({ id, chest, className = '' }: { id: string; chest: ChestId; className?: string }) {
  const t = CHEST_THEMES[chest];
  return (
    <svg className={`chest-layer chest-layer--lid ${className}`} viewBox="0 0 260 200" aria-hidden>
      <path d="M36 26H224L240 46H20Z" fill={`url(#${id}-lid-top)`} />
      <path d="M82 26H178L184 46H76Z" fill="#ffffff" opacity="0.08" />
      <path d="M82 26 76 46M178 26 184 46" stroke={t.seam} strokeWidth="1.4" />
      <rect x="20" y="46" width="220" height="34" fill={`url(#${id}-lid-front)`} />
      <rect x="20" y="46" width="56" height="34" fill={`url(#${id}-side)`} />
      <rect x="184" y="46" width="56" height="34" fill={`url(#${id}-side)`} />
      <path d="M76 46V80M184 46V80" stroke={t.seam} strokeWidth="1.6" />
      <g className="chest-lid__lit">
        <path d="M20 46H240V80H20Z" fill={`url(#${id}-lit)`} />
        <rect x="22" y="72" width="216" height="9" fill="#ffd36b" filter={`url(#${id}-glow)`} />
      </g>
      <path d="M20 46 36 26H224L240 46" fill="none" stroke={t.rim} strokeWidth="3" filter={`url(#${id}-glow)`} />
      <path d="M20 46 36 26H224L240 46" fill="none" stroke={t.rimLight} strokeWidth="1.3" />
      <path d="M20.7 46V80M239.3 46V80" stroke={t.rim} strokeWidth="1.4" />
      <rect x="20" y="73" width="56" height="7" fill={t.band} filter={`url(#${id}-glow)`} />
      <rect x="184" y="73" width="56" height="7" fill={t.band} filter={`url(#${id}-glow)`} />
      <rect x="20" y="75" width="56" height="4" fill={t.bandLight} />
      <rect x="184" y="75" width="56" height="4" fill={t.bandLight} />
    </svg>
  );
}

export function ChestBase({ id, chest, className = '' }: { id: string; chest: ChestId; className?: string }) {
  const t = CHEST_THEMES[chest];
  return (
    <svg className={`chest-layer chest-layer--base ${className}`} viewBox="0 0 260 200" aria-hidden>
      <path d="M20 80H240V176Q240 186 230 186H30Q20 186 20 176Z" fill={`url(#${id}-body)`} />
      <path d="M20 80H76L88 186H30Q20 186 20 176Z" fill={`url(#${id}-side)`} />
      <path d="M184 80H240V176Q240 186 230 186H172Z" fill={`url(#${id}-side)`} />
      <path d="M76 80H184L172 186H88Z" fill={`url(#${id}-panel)`} />
      <path d="M76 80 88 186M184 80 172 186" stroke={t.seam} strokeWidth="1.8" />
      <path d="M71.5 98 81 180M188.5 98 179 180" stroke={t.accent[1]} strokeWidth="5" filter={`url(#${id}-glow)`} opacity="0.85" />
      <path d="M71.5 98 81 180M188.5 98 179 180" stroke={`url(#${id}-accent)`} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M20.7 84V176M239.3 84V176" stroke={t.rim} strokeOpacity="0.7" strokeWidth="1.4" />
      <path d="M24 185.4H236" stroke={t.rim} strokeOpacity="0.45" strokeWidth="1.2" />
      <path className="chest-base__rim" d="M21 80.6H239" stroke={t.rimLight} strokeWidth="1.4" />
      <path className="chest-base__rim-lit" d="M21 80.6H239" stroke="#ffe39a" strokeWidth="2.4" />
      <g transform="translate(130 127) scale(1.13)">
        <ChestEmblem id={id} />
      </g>
    </svg>
  );
}

/** A closed chest (shop, intro). */
export const ChestArt = memo(function ChestArt({ chest, className = '' }: { chest: ChestId; className?: string }) {
  const id = useChestIds();
  return (
    <span className={`chest-art ${className}`} style={chestGlowStyle(chest)} aria-hidden>
      <ChestDefs id={id} chest={chest} />
      <ChestLid id={id} chest={chest} />
      <ChestBase id={id} chest={chest} />
    </span>
  );
});

/** Hexagonal neon label under a shop chest: PRO / CHEST. */
export function ChestLabel({ chest, name, sub }: { chest: ChestId; name: string; sub: string }) {
  return (
    <span className="chest-label" style={chestGlowStyle(chest)}>
      <strong>{name}</strong>
      <em>{sub}</em>
    </span>
  );
}
