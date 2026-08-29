'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { MoneyRain } from './MoneyRain';

const CELEBRATION_MS = 3000;

/** Multi-color confetti palette (not green-only). */
const CONFETTI_HUES = [0, 28, 48, 145, 195, 265, 310, 35, 170, 220];

type ConfettiSeed = {
  left: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  hue: number;
  w: number;
  h: number;
};

function buildConfetti(count: number): ConfettiSeed[] {
  const out: ConfettiSeed[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i * 0.6180339887) % 1;
    const u = (i * 0.3819660113) % 1;
    const v = (i * 0.7548776662) % 1;
    out.push({
      left: t * 100,
      delay: u * 0.35,
      duration: CELEBRATION_MS / 1000,
      drift: (u - 0.5) * 120,
      spin: (v - 0.5) * 720,
      hue: CONFETTI_HUES[i % CONFETTI_HUES.length]!,
      w: 5 + v * 7,
      h: 8 + t * 10,
    });
  }
  return out;
}

/** Full-screen $1B celebration — money rain + multi-color confetti for 3s. */
export function BillionCelebration() {
  const [alive, setAlive] = useState(true);
  const bits = useMemo(() => buildConfetti(96), []);

  useEffect(() => {
    const t = window.setTimeout(() => setAlive(false), CELEBRATION_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (!alive) return null;

  return (
    <div className="billion-celebration" aria-hidden>
      <MoneyRain intense durationMs={CELEBRATION_MS} />
      <div className="billion-celebration__confetti">
        {bits.map((bit, i) => (
          <span
            key={i}
            className="billion-celebration__bit"
            style={
              {
                left: `${bit.left}%`,
                width: `${bit.w}px`,
                height: `${bit.h}px`,
                animationDuration: `${bit.duration}s`,
                animationDelay: `${bit.delay}s`,
                ['--confetti-drift' as string]: `${bit.drift}px`,
                ['--confetti-spin' as string]: `${bit.spin}deg`,
                background: `hsl(${bit.hue} 78% 56%)`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
