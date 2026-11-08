'use client';

import { memo, useId, useLayoutEffect, useRef, useState } from 'react';
import { contrastOnPrimary } from '@/lib/tradeup/teamColors';
import { jerseyInitials, jerseySurname } from './CourtJersey';

const FLIP_MS = 420;

/* The reference shirt, traced (viewBox 114 × 142, the PG seat's shirt at 1 px = 1 unit). */
const BODY =
  'M36 0L78 0C84 0.5 90.5 3.5 92.5 8C93.8 13 96.5 19.5 99 23.5C102 27.5 108 33 112.6 37Q114 39 113.4 43C112 47 108 58 106.6 70L106.8 125C107 131 106.5 135 101 139.5Q97 142 91 142L23 142Q17 142 13 139.5C7.5 135 7 131 7.2 125L7.4 70C6 58 2 47 0.6 43Q0 39 1.4 37C6 33 12 27.5 15 23.5C17.5 19.5 20.2 13 21.5 8C23.5 3.5 30 0.5 36 0Z';
const BACK_EDGE = 'M36 0L78 0';
const ARMHOLES =
  'M37 0C30 0.5 23.5 3.5 21.5 8C20.2 13 17.5 19.5 15 23.5C12 27.5 6 33 1.4 37Q0 39 0.6 43M77 0C84 0.5 90.5 3.5 92.5 8C93.8 13 96.5 19.5 99 23.5C102 27.5 108 33 112.6 37Q114 39 113.4 43';
const HEM = 'M7.2 125C7 131 7.5 135 13 139.5Q17 142 23 142L91 142Q97 142 101 139.5C106.5 135 107 131 106.8 125';
const FOLDS = 'M12 52C19 80 21 108 17 132M102 52C95 80 93 108 97 132';

/** Front: deep scoop with the inside of the back showing. Back: shallow collar. */
const NECK = {
  front: {
    opening: 'M35 0.4L79 0.4C78 10 70 21.5 57 21.5C44 21.5 36 10 35 0.4Z',
    collar: 'M35 0.4C36 10 44 21.5 57 21.5C70 21.5 78 10 79 0.4',
  },
  back: {
    opening: 'M35 0.4L79 0.4C78 5 70 8.4 57 8.4C44 8.4 36 5 35 0.4Z',
    collar: 'M35 0.4C36 5 44 8.4 57 8.4C70 8.4 78 5 79 0.4',
  },
};

function hexRgb(hex: string): [number, number, number] | null {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(rgb: [number, number, number]) {
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
}

/**
 * Trim = the team's secondary. When the secondary is too close to the primary to read as trim,
 * the trim is white. Piping (a thin white edge on the trim) only where it adds contrast.
 */
function jerseyPalette(primary: string, accent: string) {
  const p = hexRgb(primary);
  const a = hexRgb(accent);
  const distance = p && a ? Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]) : 0;
  const trim = distance < 70 ? '#ffffff' : accent;
  const t = hexRgb(trim);
  const piping = p && t && luminance(p) < 0.7 && luminance(t) < 0.7 ? '#ffffff' : null;
  return { body: primary, trim, piping, ink: contrastOnPrimary(primary) };
}

const EMPTY = { body: '#7b7d83', trim: '#f4f5f7', piping: null as string | null, ink: '#ffffff' };

/** One line, shrunk until the whole surname fits across the back. */
function Surname({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const fit = () => {
      const maxW = box.clientWidth;
      const maxH = box.clientHeight;
      if (maxW < 4 || maxH < 4) return;
      let lo = 4;
      let hi = Math.max(5, Math.min(maxH * 0.62, maxW * 0.3));
      let best = lo;
      while (hi - lo > 0.2) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = `${mid}px`;
        if (el.scrollWidth <= maxW + 0.5 && el.scrollHeight <= maxH + 0.5) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      el.style.fontSize = `${best}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text]);
  return (
    <span ref={ref} className="aj__surname">
      {text}
    </span>
  );
}

/**
 * The Classic arena jersey, drawn as vector art from the reference shirt so it is sharp at any
 * size. Empty: the reference's gray mesh with white trim. Filled: team primary body, secondary
 * trim. Tapping turns it around its center (initials on the front, surname on the back); the
 * face changes at the halfway point, while the shirt is edge-on.
 */
export const ArenaJersey = memo(function ArenaJersey({
  position,
  playerName,
  colors,
  flipped = false,
  landing = false,
}: {
  position: string;
  playerName: string | null;
  colors?: { primary: string; accent: string } | null;
  flipped?: boolean;
  landing?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const [turning, setTurning] = useState(false);
  const [face, setFace] = useState<'front' | 'back'>(flipped ? 'back' : 'front');
  const prevFlipped = useRef(flipped);

  useLayoutEffect(() => {
    if (prevFlipped.current === flipped) return;
    prevFlipped.current = flipped;
    setTurning(true);
    const half = window.setTimeout(() => setFace(flipped ? 'back' : 'front'), FLIP_MS / 2);
    const done = window.setTimeout(() => setTurning(false), FLIP_MS);
    return () => {
      window.clearTimeout(half);
      window.clearTimeout(done);
      setFace(flipped ? 'back' : 'front');
      setTurning(false);
    };
  }, [flipped]);

  const filled = Boolean(playerName);
  const palette = filled && colors ? jerseyPalette(colors.primary, colors.accent) : EMPTY;
  const shownFace = filled ? face : 'front';
  const neck = NECK[shownFace];
  const clip = `aj-clip-${uid}`;
  const mesh = `aj-mesh-${uid}`;
  const side = `aj-side-${uid}`;
  const fall = `aj-fall-${uid}`;
  const chest = `aj-chest-${uid}`;
  const pit = `aj-pit-${uid}`;

  return (
    <span
      className={`aj aj--${position.toLowerCase()}${filled ? ' is-filled' : ' is-empty'}${
        shownFace === 'back' ? ' is-back' : ''
      }${filled && landing ? ' is-landing' : ''}${turning ? ' is-turning' : ''}`}
      style={{ ['--aj-ink' as string]: palette.ink }}
      aria-hidden
    >
      <span className="aj__card">
        <svg className="aj__art" viewBox="0 0 114 142" preserveAspectRatio="none" overflow="visible">
          <defs>
            <clipPath id={clip}>
              <path d={BODY} />
            </clipPath>
            <pattern id={mesh} width="2.4" height="2.4" patternUnits="userSpaceOnUse">
              <circle cx="0.6" cy="0.6" r="0.55" fill="#000" fillOpacity="0.26" />
              <circle cx="1.8" cy="1.8" r="0.55" fill="#000" fillOpacity="0.26" />
              <circle cx="1.8" cy="0.6" r="0.36" fill="#fff" fillOpacity="0.09" />
            </pattern>
            <linearGradient id={side} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#000" stopOpacity="0.5" />
              <stop offset="0.13" stopColor="#000" stopOpacity="0.12" />
              <stop offset="0.3" stopColor="#000" stopOpacity="0" />
              <stop offset="0.7" stopColor="#000" stopOpacity="0" />
              <stop offset="0.87" stopColor="#000" stopOpacity="0.14" />
              <stop offset="1" stopColor="#000" stopOpacity="0.54" />
            </linearGradient>
            <radialGradient id={chest} cx="0.46" cy="0.42" r="0.5">
              <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
              <stop offset="0.6" stopColor="#fff" stopOpacity="0.05" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={pit} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#000" stopOpacity="0.32" />
              <stop offset="1" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={fall} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.08" />
              <stop offset="0.3" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.78" stopColor="#000" stopOpacity="0.08" />
              <stop offset="1" stopColor="#000" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <path className="aj__body" d={BODY} fill={palette.body} />
          <g clipPath={`url(#${clip})`}>
            <rect width="114" height="142" fill={`url(#${mesh})`} />
            <path d={FOLDS} fill="none" stroke="#000" strokeOpacity="0.07" strokeWidth="7" strokeLinecap="round" />
            <rect width="114" height="142" fill={`url(#${side})`} />
            <rect width="114" height="142" fill={`url(#${fall})`} />
            <rect width="114" height="142" fill={`url(#${chest})`} />
            <ellipse cx="9" cy="50" rx="14" ry="24" fill={`url(#${pit})`} />
            <ellipse cx="105" cy="50" rx="14" ry="24" fill={`url(#${pit})`} />
            <path d={HEM} fill="none" stroke="#000" strokeOpacity="0.16" strokeWidth="9" />
            <path d={HEM} fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="3.6" />
            <path d={neck.opening} fill={palette.body} />
            <path d={neck.opening} fill="#000" fillOpacity="0.66" />
            {palette.piping ? (
              <>
                <path d={ARMHOLES} fill="none" stroke={palette.piping} strokeWidth="16" />
                <path d={neck.collar} fill="none" stroke={palette.piping} strokeWidth="9.2" />
                <path d={BACK_EDGE} fill="none" stroke={palette.piping} strokeWidth="4.4" />
              </>
            ) : null}
            <path d={ARMHOLES} fill="none" stroke={palette.trim} strokeWidth="13.6" />
            <path d={neck.collar} fill="none" stroke={palette.trim} strokeWidth="7" />
            <path d={BACK_EDGE} fill="none" stroke={palette.trim} strokeWidth="4" />
          </g>
        </svg>
        {playerName ? (
          <span className="aj__text">
            {shownFace === 'back' ? <Surname text={jerseySurname(playerName)} /> : jerseyInitials(playerName)}
          </span>
        ) : null}
      </span>
    </span>
  );
});
