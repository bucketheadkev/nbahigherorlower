'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  MoneyRain,
  RESULTS_POUR_FALL_MS,
  RESULTS_POUR_STAGGER_MS,
  RESULTS_POUR_TOTAL_MS,
} from './MoneyRain';

const CONFETTI_COLORS = [
  '#ff375f',
  '#ff9f0a',
  '#ffd60a',
  '#30d158',
  '#64d2ff',
  '#5e5ce6',
  '#bf5af2',
  '#ff6482',
  '#40c8e0',
  '#ffffff',
];

type ConfettiShape = 'square' | 'rect' | 'circle' | 'strip';

type ConfettiSeed = {
  left: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  color: string;
  w: number;
  h: number;
  shape: ConfettiShape;
  opacity: number;
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledLanePercents(count: number, rand: () => number): number[] {
  const cols = Math.ceil(Math.sqrt(count * 1.4));
  const rows = Math.ceil(count / cols);
  const cells: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = ((c + 0.5) / cols) * 100;
      const jitter = (rand() - 0.5) * (100 / cols) * 0.6;
      cells.push(Math.max(1, Math.min(99, x + jitter)));
    }
  }
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  return cells.slice(0, count);
}

function buildConfetti(count: number): ConfettiSeed[] {
  const out: ConfettiSeed[] = [];
  const shapes: ConfettiShape[] = ['square', 'rect', 'circle', 'strip'];
  const rand = mulberry32(0xcfe771);
  const lanes = shuffledLanePercents(count, rand);
  const fallSec = RESULTS_POUR_FALL_MS / 1000;
  const staggerSec = RESULTS_POUR_STAGGER_MS / 1000;
  for (let i = 0; i < count; i += 1) {
    const u = rand();
    const v = rand();
    const w = rand();
    const shape = shapes[Math.floor(rand() * shapes.length)]!;
    let width = 7 + u * 6;
    let height = 7 + v * 6;
    if (shape === 'rect') {
      width = 6 + u * 4;
      height = 9 + v * 5;
    } else if (shape === 'strip') {
      width = 3 + u * 2;
      height = 10 + v * 6;
    } else if (shape === 'circle') {
      width = 6 + u * 5;
      height = width;
    } else {
      width = 7 + u * 5;
      height = width;
    }
    const t = count <= 1 ? 0 : i / (count - 1);
    out.push({
      left: lanes[i] ?? 50,
      delay: (1 - t) * staggerSec * (0.8 + u * 0.35) + v * 0.1,
      duration: fallSec * (0.9 + w * 0.2),
      drift: (u - 0.5) * 36 + (w - 0.5) * 14,
      spin: (v - 0.5) * 420,
      color: CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)]!,
      w: width,
      h: height,
      shape,
      opacity: 0.78 + u * 0.18,
    });
  }
  return out;
}

/**
 * Result celebration — staggered money + confetti fill the screen,
 * each piece falls top→bottom then fades. Shared total window.
 */
export function BillionCelebration({
  durationMs = RESULTS_POUR_TOTAL_MS,
}: {
  durationMs?: number;
}) {
  const [alive, setAlive] = useState(true);
  const [fading, setFading] = useState(false);
  const bits = useMemo(() => buildConfetti(78), []);

  useEffect(() => {
    const fadeAt = Math.max(0, durationMs - 650);
    const fadeT = window.setTimeout(() => setFading(true), fadeAt);
    const endT = window.setTimeout(() => setAlive(false), durationMs);
    return () => {
      window.clearTimeout(fadeT);
      window.clearTimeout(endT);
    };
  }, [durationMs]);

  if (!alive) return null;

  return (
    <div
      className={`billion-celebration${fading ? ' is-fading' : ''}`}
      aria-hidden
    >
      <MoneyRain intense />
      <div className="billion-celebration__confetti">
        {bits.map((bit, i) => (
          <span
            key={i}
            className={`billion-celebration__bit billion-celebration__bit--${bit.shape}`}
            style={
              {
                left: `${bit.left}%`,
                width: `${bit.w}px`,
                height: `${bit.h}px`,
                animationDuration: `${bit.duration}s`,
                animationDelay: `${bit.delay}s`,
                animationIterationCount: 1,
                animationFillMode: 'forwards',
                ['--confetti-drift' as string]: `${bit.drift}px`,
                ['--confetti-spin' as string]: `${bit.spin}deg`,
                ['--confetti-opacity' as string]: String(bit.opacity),
                background: bit.color,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
