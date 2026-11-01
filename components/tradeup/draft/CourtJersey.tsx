'use client';

import { memo, useId, useLayoutEffect, useRef, useState } from 'react';

/**
 * Basketball tank top in a 100×130 box (the court seat's own proportions, so it is never
 * stretched): narrow straps, a scooped neck, deep armholes. The back has the higher neckline.
 */
const FRONT_PATH =
  'M24 3H38C40 17 45 24 50 24C55 24 60 17 62 3H76C77 22 84 36 93 40V122Q93 127 88 127H12Q7 127 7 122V40C16 36 23 22 24 3Z';
const BACK_PATH =
  'M24 3H38C40 10 45 13 50 13C55 13 60 10 62 3H76C77 22 84 36 93 40V122Q93 127 88 127H12Q7 127 7 122V40C16 36 23 22 24 3Z';
/** Ribbed trim: stroked along the neck and armhole edges and clipped to the body, so it reads
    as a band sewn inside the edge. */
const FRONT_TRIM = 'M38 3C40 17 45 24 50 24C55 24 60 17 62 3M24 3C23 22 16 36 7 40M76 3C77 22 84 36 93 40';
const BACK_TRIM = 'M38 3C40 10 45 13 50 13C55 13 60 10 62 3M24 3C23 22 16 36 7 40M76 3C77 22 84 36 93 40';

function JerseyShape({ back = false }: { back?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const d = back ? BACK_PATH : FRONT_PATH;
  const trim = back ? BACK_TRIM : FRONT_TRIM;
  return (
    <svg className="jersey__shape" viewBox="0 0 100 130" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <clipPath id={`jersey-clip-${uid}`}>
          <path d={d} />
        </clipPath>
        {/* Shading only darkens (sides and hem), so the team color itself is never washed out. */}
        <linearGradient id={`jersey-light-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id={`jersey-round-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000000" stopOpacity="0.22" />
          <stop offset="0.2" stopColor="#000000" stopOpacity="0" />
          <stop offset="0.8" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      <path className="jersey__body" d={d} />
      <g clipPath={`url(#jersey-clip-${uid})`}>
        <path className="jersey__piping" d={trim} />
        <path className="jersey__trim" d={trim} />
        <rect width="100" height="130" fill={`url(#jersey-round-${uid})`} />
        <rect width="100" height="130" fill={`url(#jersey-light-${uid})`} />
      </g>
      <path className="jersey__edge" d={d} />
    </svg>
  );
}

const FLIP_MS = 380;

/** One line, shrunk until the whole surname fits across the jersey (Antetokounmpo included). */
function JerseySurname({ text }: { text: string }) {
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
      let hi = Math.max(5, Math.min(maxH * 0.62, maxW * 0.34));
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
    <span ref={ref} className="jersey__surname">
      {text}
    </span>
  );
}

/** First and last initials (LeBron James → LJ). */
export function jerseyInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

/** Everything after the first name ("Payton II", "World Peace"); single names stay whole. */
export function jerseySurname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return (parts[0] ?? '').toUpperCase();
  return parts.slice(1).join(' ').toUpperCase();
}

/**
 * Court jersey. Empty: navy with the position. Filled: team colors (from the parent's
 * --slot-* variables), initials on the front, surname on the back. No numbers, ever.
 */
export const CourtJersey = memo(function CourtJersey({
  position,
  playerName,
  flipped = false,
  landing = false,
}: {
  position: string;
  playerName: string | null;
  flipped?: boolean;
  /** Just placed: a quick premium reveal in the team colors. */
  landing?: boolean;
}) {
  if (!playerName) {
    return (
      <span className="jersey is-empty">
        <JerseyShape />
        <span className="jersey__text jersey__text--pos">{position}</span>
      </span>
    );
  }
  return <FilledJersey playerName={playerName} flipped={flipped} landing={landing} />;
});

/**
 * Filled jersey. The flip is a flat turn (squeeze to the edge, swap faces, open back out)
 * rather than a 3D card: 3D layers with backface culling rasterize blurry on iOS and fight
 * the landing scale. The back face (and its surname fitting) mounts on the first flip.
 */
function FilledJersey({ playerName, flipped, landing }: { playerName: string; flipped: boolean; landing: boolean }) {
  const [turning, setTurning] = useState<'to-back' | 'to-front' | null>(null);
  const [backMounted, setBackMounted] = useState(flipped);
  const prevFlipped = useRef(flipped);

  useLayoutEffect(() => {
    if (prevFlipped.current === flipped) return;
    prevFlipped.current = flipped;
    if (flipped) setBackMounted(true);
    setTurning(flipped ? 'to-back' : 'to-front');
    const timer = window.setTimeout(() => setTurning(null), FLIP_MS);
    return () => window.clearTimeout(timer);
  }, [flipped]);

  return (
    <span
      className={`jersey is-filled${flipped ? ' is-flipped' : ''}${landing ? ' is-landing' : ''}${
        turning ? ` is-turning is-turning-${turning}` : ''
      }`}
    >
      <span className="jersey__card">
        <span className="jersey__face jersey__face--front">
          <JerseyShape />
          <span className="jersey__text jersey__text--initials">{jerseyInitials(playerName)}</span>
        </span>
        {backMounted ? (
          <span className="jersey__face jersey__face--back">
            <JerseyShape back />
            <span className="jersey__text jersey__text--name">
              <JerseySurname text={jerseySurname(playerName)} />
            </span>
          </span>
        ) : null}
      </span>
    </span>
  );
}
