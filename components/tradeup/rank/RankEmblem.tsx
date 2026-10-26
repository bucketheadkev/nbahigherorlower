'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import type { RankDef } from '@/lib/tradeup/rank/config';

/** Points for an n-pointed star/burst polygon, first point straight up. */
function starPoints(cx: number, cy: number, outer: number, inner: number, n: number, turn = 0): string {
  const out: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (Math.PI * i) / n + turn;
    out.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return out.join(' ');
}

const SHIELD = 'M50 8 L84 20 V46 C84 68 69 83 50 92 C31 83 16 68 16 46 V20 Z';
const SHIELD_IN = 'M50 17 L76 27 V46 C76 63 65 75 50 82 C35 75 24 63 24 46 V27 Z';

function Sparkle({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  return (
    <path
      d={`M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`}
      fill={fill}
    />
  );
}

function Rookie({ id, c }: { id: string; c: RankDef }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4e8ec" />
          <stop offset="0.55" stopColor={c.color} />
          <stop offset="1" stopColor={c.deep} />
        </linearGradient>
        <radialGradient id={`${id}core`} cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#5d6670" />
          <stop offset="1" stopColor="#22272d" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="40" fill={`url(#${id}rim)`} stroke="#eef1f4" strokeOpacity="0.55" strokeWidth="2" />
      <circle cx="50" cy="50" r="31" fill={`url(#${id}core)`} />
      <circle cx="50" cy="50" r="31" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.5" />
      <path d="M33 57 L50 44 L67 57" fill="none" stroke="#eef1f4" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 34 A28 28 0 0 1 44 22" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

function Pro({ id, c }: { id: string; c: RankDef }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}rim`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#f2c79a" />
          <stop offset="0.5" stopColor={c.color} />
          <stop offset="1" stopColor={c.deep} />
        </linearGradient>
        <linearGradient id={`${id}core`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a4925" />
          <stop offset="1" stopColor="#2a1407" />
        </linearGradient>
      </defs>
      <path d={SHIELD} fill={`url(#${id}rim)`} stroke="#ffe0bd" strokeOpacity="0.6" strokeWidth="2" strokeLinejoin="round" />
      <path d={SHIELD_IN} fill={`url(#${id}core)`} />
      {[
        [24, 30],
        [76, 30],
        [50, 21],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill="#f6d2a8" />
      ))}
      <path d="M35 49 L50 38 L65 49" fill="none" stroke="#f6d2a8" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M35 64 L50 53 L65 64" fill="none" stroke="#f6d2a8" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 26 L46 17" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

function AllStar({ id, c }: { id: string; c: RankDef }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}rim`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#b9ffdc" />
          <stop offset="0.5" stopColor={c.color} />
          <stop offset="1" stopColor={c.deep} />
        </linearGradient>
        <linearGradient id={`${id}core`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f6b43" />
          <stop offset="1" stopColor="#03200f" />
        </linearGradient>
        <linearGradient id={`${id}star`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#9dffd0" />
        </linearGradient>
        <filter id={`${id}glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <path d={SHIELD} fill={`url(#${id}rim)`} stroke="#d8ffeb" strokeOpacity="0.7" strokeWidth="2" strokeLinejoin="round" />
      <path d={SHIELD_IN} fill={`url(#${id}core)`} />
      <polygon points={starPoints(50, 50, 21, 9, 5)} fill={c.color} filter={`url(#${id}glow)`} opacity="0.9" />
      <polygon points={starPoints(50, 50, 19, 8, 5)} fill={`url(#${id}star)`} stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
      <Sparkle x={31} y={33} s={4} fill="#d8ffeb" />
      <Sparkle x={69} y={66} s={3.4} fill="#d8ffeb" />
      <path d="M22 26 L46 17" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

function Superstar({ id, c }: { id: string; c: RankDef }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}rim`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#cfe4ff" />
          <stop offset="0.45" stopColor={c.color} />
          <stop offset="1" stopColor={c.deep} />
        </linearGradient>
        <radialGradient id={`${id}core`} cx="0.5" cy="0.4" r="0.65">
          <stop offset="0" stopColor="#2a63d6" />
          <stop offset="1" stopColor="#081a40" />
        </radialGradient>
        <linearGradient id={`${id}star`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#bfe0ff" />
        </linearGradient>
        <filter id={`${id}glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      <polygon points={starPoints(50, 50, 47, 37, 12)} fill={`url(#${id}rim)`} stroke="#dcebff" strokeOpacity="0.6" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="31" fill={`url(#${id}core)`} stroke="#9cc6ff" strokeWidth="2" />
      <circle cx="50" cy="50" r="25" fill="none" stroke="#9cc6ff" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="3 4" />
      <polygon points={starPoints(50, 51, 22, 9, 5)} fill="#7fb6ff" filter={`url(#${id}glow)`} />
      <polygon points={starPoints(50, 51, 19, 7.8, 5)} fill={`url(#${id}star)`} stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
      <Sparkle x={22} y={22} s={5} fill="#e4f0ff" />
      <Sparkle x={80} y={24} s={3.6} fill="#e4f0ff" />
      <Sparkle x={79} y={79} s={4.2} fill="#e4f0ff" />
    </>
  );
}

function Legend({ id, c }: { id: string; c: RankDef }) {
  const wing = (
    <>
      <path d="M36 34 C24 22 10 20 2 24 C12 30 22 36 32 44 Z" />
      <path d="M34 47 C22 40 9 40 3 44 C13 50 23 54 33 56 Z" />
      <path d="M35 60 C25 57 14 59 8 64 C18 68 28 69 36 67 Z" />
    </>
  );
  return (
    <>
      <defs>
        <linearGradient id={`${id}rim`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#ecd6ff" />
          <stop offset="0.5" stopColor={c.color} />
          <stop offset="1" stopColor={c.deep} />
        </linearGradient>
        <linearGradient id={`${id}wing`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e2c4ff" stopOpacity="0.55" />
          <stop offset="1" stopColor={c.color} />
        </linearGradient>
        <linearGradient id={`${id}core`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a24a6" />
          <stop offset="1" stopColor="#1a0638" />
        </linearGradient>
        <linearGradient id={`${id}star`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e2c4ff" />
        </linearGradient>
        <filter id={`${id}glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      <g fill={`url(#${id}wing)`} stroke="#f1e2ff" strokeOpacity="0.5" strokeWidth="0.8">
        {wing}
      </g>
      <g fill={`url(#${id}wing)`} stroke="#f1e2ff" strokeOpacity="0.5" strokeWidth="0.8" transform="translate(100 0) scale(-1 1)">
        {wing}
      </g>
      <path d="M50 14 L72 24 V52 C72 69 62 80 50 88 C38 80 28 69 28 52 V24 Z" fill={`url(#${id}rim)`} stroke="#f5eaff" strokeOpacity="0.75" strokeWidth="2" strokeLinejoin="round" />
      <path d="M50 22 L65 29 V52 C65 64 58 73 50 79 C42 73 35 64 35 52 V29 Z" fill={`url(#${id}core)`} />
      <polygon points={starPoints(50, 50, 16, 6.6, 5)} fill={c.color} filter={`url(#${id}glow)`} />
      <polygon points={starPoints(50, 50, 14, 5.8, 5)} fill={`url(#${id}star)`} stroke="#ffffff" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M50 3 L55 10 L50 17 L45 10 Z" fill="#f1e2ff" stroke={c.color} strokeWidth="1" />
      <Sparkle x={50} y={68} s={3} fill="#f1e2ff" />
    </>
  );
}

function Goat({ id, c }: { id: string; c: RankDef }) {
  const leaves = (side: 1 | -1) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = ((side === 1 ? 205 : -25) + side * -22 * i) * (Math.PI / 180);
      const x = 50 + 37 * Math.cos(a);
      const y = 54 + 37 * Math.sin(a);
      const deg = (a * 180) / Math.PI + (side === 1 ? -60 : 60);
      return <ellipse key={`${side}${i}`} cx={x} cy={y} rx="3.4" ry="7.2" transform={`rotate(${deg} ${x} ${y})`} />;
    });
  return (
    <>
      <defs>
        <radialGradient id={`${id}rays`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.35" stopColor="#ffb3b8" />
          <stop offset="0.7" stopColor={c.color} />
          <stop offset="1" stopColor={c.deep} />
        </radialGradient>
        <linearGradient id={`${id}gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.45" stopColor="#ffd166" />
          <stop offset="1" stopColor="#b8780a" />
        </linearGradient>
        <linearGradient id={`${id}shield`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5a66" />
          <stop offset="1" stopColor="#6a0710" />
        </linearGradient>
        <filter id={`${id}glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <g className="rank-emblem__rays">
        <polygon points={starPoints(50, 54, 46, 30, 16)} fill={`url(#${id}rays)`} opacity="0.95" />
        <polygon points={starPoints(50, 54, 44, 36, 16, Math.PI / 16)} fill="none" stroke="#ffd166" strokeOpacity="0.45" strokeWidth="0.8" />
      </g>
      <g fill={`url(#${id}gold)`} stroke="#7a4d00" strokeOpacity="0.35" strokeWidth="0.6">
        {leaves(1)}
        {leaves(-1)}
      </g>
      <path d="M50 30 L69 37 V54 C69 67 61 75 50 81 C39 75 31 67 31 54 V37 Z" fill={`url(#${id}shield)`} stroke={`url(#${id}gold)`} strokeWidth="3" strokeLinejoin="round" />
      <polygon points={starPoints(50, 55, 14, 5.8, 5)} fill="#ffd166" filter={`url(#${id}glow)`} />
      <polygon points={starPoints(50, 55, 12, 5, 5)} fill={`url(#${id}gold)`} stroke="#fff6d6" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M32 31 L35 13 L43 22 L50 6 L57 22 L65 13 L68 31 Z" fill={`url(#${id}gold)`} stroke="#fff1c2" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="32" y="27" width="36" height="5" rx="1.5" fill="#b8780a" />
      <circle cx="50" cy="8" r="2.6" fill={c.color} stroke="#fff1c2" strokeWidth="0.8" />
      <circle cx="35" cy="14" r="2" fill={c.color} stroke="#fff1c2" strokeWidth="0.6" />
      <circle cx="65" cy="14" r="2" fill={c.color} stroke="#fff1c2" strokeWidth="0.6" />
      <circle cx="50" cy="29.5" r="1.8" fill="#ff3344" />
      <Sparkle x={14} y={20} s={4.5} fill="#fff1c2" />
      <Sparkle x={86} y={24} s={3.6} fill="#fff1c2" />
    </>
  );
}

const ART: Record<RankDef['id'], (p: { id: string; c: RankDef }) => ReactNode> = {
  rookie: Rookie,
  pro: Pro,
  allstar: AllStar,
  superstar: Superstar,
  legend: Legend,
  goat: Goat,
};

export function RankEmblem({ rank, size = 48, className = '' }: { rank: RankDef; size?: number; className?: string }) {
  const id = useId().replace(/[:]/g, '');
  const Art = ART[rank.id];
  return (
    <svg
      className={`rank-emblem rank-emblem--${rank.id} ${className}`.trim()}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ '--rank-color': rank.color } as CSSProperties}
      aria-hidden
    >
      <Art id={id} c={rank} />
    </svg>
  );
}
