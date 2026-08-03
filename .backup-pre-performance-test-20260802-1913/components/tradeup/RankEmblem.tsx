'use client';

import { useId, type ReactNode } from 'react';
import type { RankId } from '@/lib/tradeup/ranks';

type EmblemSize = 'sm' | 'md' | 'lg' | 'hero';

interface RankEmblemProps {
  rankId: RankId;
  size?: EmblemSize;
  className?: string;
  title?: string;
}

const SIZE_CLASS: Record<EmblemSize, string> = {
  sm: 'rank-emblem--sm',
  md: 'rank-emblem--md',
  lg: 'rank-emblem--lg',
  hero: 'rank-emblem--hero',
};

interface MetalIds {
  rim: string;
  face: string;
  shine: string;
  core: string;
}

function HexFrame({
  ids,
  strokeExtra,
}: {
  ids: MetalIds;
  strokeExtra?: string;
}) {
  return (
    <>
      <path
        d="M32 4.5 54.5 17.5v27L32 57.5 9.5 44.5v-27L32 4.5Z"
        fill={`url(#${ids.face})`}
        stroke={`url(#${ids.rim})`}
        strokeWidth="2"
      />
      <path
        d="M32 10.5 48.5 20v22L32 51.5 15.5 42V20L32 10.5Z"
        fill="none"
        stroke={`url(#${ids.shine})`}
        strokeWidth="1.1"
        opacity="0.7"
      />
      {strokeExtra ? (
        <path
          d="M32 4.5 54.5 17.5v27L32 57.5 9.5 44.5v-27L32 4.5Z"
          fill="none"
          stroke={strokeExtra}
          strokeWidth="1.2"
          opacity="0.55"
        />
      ) : null}
    </>
  );
}

function SvgShell({
  children,
  title,
  ids,
  stops,
}: {
  children: ReactNode;
  title?: string;
  ids: MetalIds;
  stops: { rim: [string, string]; face: [string, string, string]; shine: string; core: [string, string] };
}) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={ids.rim} x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor={stops.rim[0]} />
          <stop offset="1" stopColor={stops.rim[1]} />
        </linearGradient>
        <linearGradient id={ids.face} x1="16" y1="8" x2="48" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor={stops.face[0]} />
          <stop offset="0.48" stopColor={stops.face[1]} />
          <stop offset="1" stopColor={stops.face[2]} />
        </linearGradient>
        <linearGradient id={ids.shine} x1="20" y1="10" x2="44" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor={stops.shine} stopOpacity="0.95" />
          <stop offset="1" stopColor={stops.shine} stopOpacity="0.15" />
        </linearGradient>
        <radialGradient id={ids.core} cx="32" cy="28" r="16" gradientUnits="userSpaceOnUse">
          <stop stopColor={stops.core[0]} />
          <stop offset="1" stopColor={stops.core[1]} />
        </radialGradient>
      </defs>
      {children}
    </svg>
  );
}

function IronMark({ ids }: { ids: MetalIds }) {
  return (
    <SvgShell
      ids={ids}
      stops={{
        rim: ['#c5c9d1', '#4a4f5a'],
        face: ['#8b919c', '#5c6370', '#2e333c'],
        shine: '#e6e8ed',
        core: ['#9aa1ad', '#3a404a'],
      }}
    >
      <HexFrame ids={ids} />
      <path d="M24 24h16v16H24z" fill={`url(#${ids.core})`} stroke={`url(#${ids.rim})`} strokeWidth="1.3" />
      <path d="M28 28h8M28 32h8M28 36h5" stroke="#d7dae0" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
    </SvgShell>
  );
}

function BronzeMark({ ids }: { ids: MetalIds }) {
  return (
    <SvgShell
      ids={ids}
      stops={{
        rim: ['#e0b07a', '#7a4a22'],
        face: ['#c8843f', '#9a5a28', '#5c3414'],
        shine: '#f0d0a4',
        core: ['#d49a55', '#6e3c18'],
      }}
    >
      <HexFrame ids={ids} />
      <circle cx="32" cy="32" r="10" fill={`url(#${ids.core})`} stroke={`url(#${ids.rim})`} strokeWidth="1.4" />
      <path d="M32 24.5v15M24.5 32h15" stroke="#f6e0c0" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
    </SvgShell>
  );
}

function SilverMark({ ids }: { ids: MetalIds }) {
  return (
    <SvgShell
      ids={ids}
      stops={{
        rim: ['#f4f7fb', '#7d8796'],
        face: ['#dce3ec', '#9aa7b8', '#5a6574'],
        shine: '#ffffff',
        core: ['#eef3f9', '#6e7b8c'],
      }}
    >
      <HexFrame ids={ids} />
      <path
        d="M32 20 40 32 32 44 24 32Z"
        fill={`url(#${ids.core})`}
        stroke={`url(#${ids.rim})`}
        strokeWidth="1.4"
      />
      <path d="M32 24.5v15" stroke="#fff" strokeWidth="1.3" opacity="0.7" />
    </SvgShell>
  );
}

function GoldMark({ ids }: { ids: MetalIds }) {
  return (
    <SvgShell
      ids={ids}
      stops={{
        rim: ['#ffe9a0', '#9a6b12'],
        face: ['#f2d26a', '#d4a824', '#8a6a12'],
        shine: '#fff6d0',
        core: ['#ffe08a', '#b8891a'],
      }}
    >
      <HexFrame ids={ids} />
      <path
        d="M32 21 35.2 28.4l8 .6-6.2 5.2 2 7.8L32 37.8l-7 4.2 2-7.8-6.2-5.2 8-.6L32 21Z"
        fill={`url(#${ids.core})`}
        stroke={`url(#${ids.rim})`}
        strokeWidth="1.15"
      />
    </SvgShell>
  );
}

function PlatinumMark({ ids }: { ids: MetalIds }) {
  return (
    <SvgShell
      ids={ids}
      stops={{
        rim: ['#e8f7ff', '#6a90b0'],
        face: ['#d7ecf8', '#8fb4cc', '#4a6d86'],
        shine: '#f2fbff',
        core: ['#dff4ff', '#5f88a6'],
      }}
    >
      <HexFrame ids={ids} strokeExtra="rgba(56,189,248,0.55)" />
      <circle cx="32" cy="32" r="11" fill={`url(#${ids.core})`} stroke={`url(#${ids.rim})`} strokeWidth="1.35" />
      <path
        d="M32 23.5 36.2 32 32 40.5 27.8 32Z"
        fill="rgba(255,255,255,0.55)"
        stroke="rgba(186,230,253,0.9)"
        strokeWidth="1"
      />
    </SvgShell>
  );
}

function DiamondMark({ ids }: { ids: MetalIds }) {
  return (
    <SvgShell
      ids={ids}
      stops={{
        rim: ['#e0f2fe', '#3b82f6'],
        face: ['#bae6fd', '#60a5fa', '#1d4ed8'],
        shine: '#f0f9ff',
        core: ['#7dd3fc', '#2563eb'],
      }}
    >
      <HexFrame ids={ids} strokeExtra="rgba(125,211,252,0.7)" />
      <path
        d="M22 28h20l-4 8H26l-4-8Z"
        fill={`url(#${ids.core})`}
        stroke="#e0f2fe"
        strokeWidth="1.2"
      />
      <path d="M26 28 32 20 38 28" fill="rgba(224,242,254,0.85)" stroke="#f0f9ff" strokeWidth="1.1" />
      <path d="M32 20v24" stroke="rgba(255,255,255,0.55)" strokeWidth="1" />
    </SvgShell>
  );
}

function AceMark({ ids }: { ids: MetalIds }) {
  return (
    <SvgShell
      ids={ids}
      stops={{
        rim: ['#fef3c7', '#f59e0b'],
        face: ['#1e3a8a', '#172554', '#020617'],
        shine: '#38bdf8',
        core: ['#fbbf24', '#b45309'],
      }}
    >
      <HexFrame ids={ids} strokeExtra="rgba(251,191,36,0.75)" />
      <path
        d="M24.5 42 32 18.5 39.5 42"
        stroke={`url(#${ids.shine})`}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24.5 42 32 18.5 39.5 42"
        stroke={`url(#${ids.core})`}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M27.2 34.5h9.6" stroke="#fde68a" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="14.5" r="2.1" fill="#fbbf24" />
    </SvgShell>
  );
}

const MARKS: Record<RankId, (ids: MetalIds) => ReactNode> = {
  iron: (ids) => <IronMark ids={ids} />,
  bronze: (ids) => <BronzeMark ids={ids} />,
  silver: (ids) => <SilverMark ids={ids} />,
  gold: (ids) => <GoldMark ids={ids} />,
  platinum: (ids) => <PlatinumMark ids={ids} />,
  diamond: (ids) => <DiamondMark ids={ids} />,
  ace: (ids) => <AceMark ids={ids} />,
};

export function RankEmblem({ rankId, size = 'md', className = '', title }: RankEmblemProps) {
  const uid = useId().replace(/:/g, '');
  const ids: MetalIds = {
    rim: `rk-rim-${uid}`,
    face: `rk-face-${uid}`,
    shine: `rk-shine-${uid}`,
    core: `rk-core-${uid}`,
  };
  const mark = (MARKS[rankId] ?? MARKS.iron)(ids);

  return (
    <span className={`rank-emblem rank-emblem--${rankId} ${SIZE_CLASS[size]} ${className}`.trim()} title={title}>
      {mark}
    </span>
  );
}
