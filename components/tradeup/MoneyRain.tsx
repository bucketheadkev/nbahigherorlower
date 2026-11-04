'use client';

import { useMemo, type CSSProperties } from 'react';

type BillSeed = {
  left: number;
  width: number;
  duration: number;
  delay: number;
  drift: number;
  spin: number;
  sway: number;
  opacity: number;
};

const BILL_RATIO = 2.35;

/** Staggered rain: pieces start across time so the screen fills vertically. */
export const RESULTS_POUR_STAGGER_MS = 1500;
export const RESULTS_POUR_FALL_MS = 2400;
export const RESULTS_POUR_TOTAL_MS = RESULTS_POUR_STAGGER_MS + RESULTS_POUR_FALL_MS;

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
  const cols = Math.ceil(Math.sqrt(count * 1.35));
  const rows = Math.ceil(count / cols);
  const cells: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = ((c + 0.5) / cols) * 100;
      const jitter = (rand() - 0.5) * (100 / cols) * 0.55;
      cells.push(Math.max(1, Math.min(99, x + jitter)));
    }
  }
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  return cells.slice(0, count);
}

function buildBills(count: number, burst: boolean): BillSeed[] {
  const out: BillSeed[] = [];
  const rand = mulberry32(burst ? 0x51f00d : 0xc0ffee);
  const lanes = shuffledLanePercents(count, rand);
  const fallSec = RESULTS_POUR_FALL_MS / 1000;
  const staggerSec = RESULTS_POUR_STAGGER_MS / 1000;
  for (let i = 0; i < count; i += 1) {
    const u = rand();
    const v = rand();
    const w = rand();
    const depth = i % 3;
    const delay = burst
      ? (count <= 1 ? 0 : (i / (count - 1)) * staggerSec * (0.85 + u * 0.3))
      : -((i * 0.41) % 15);
    out.push({
      left: lanes[i] ?? 50,
      width: burst
        ? depth === 0
          ? 14 + u * 9
          : depth === 1
            ? 12 + u * 7
            : 10 + u * 6
        : depth === 0
          ? 13 + u * 7
          : depth === 1
            ? 11 + u * 6
            : 9 + u * 5,
      duration: burst ? fallSec * (0.92 + v * 0.16) : 10 + v * 11,
      delay,
      drift: (u - 0.5) * (burst ? 28 : 34) + (w - 0.5) * (burst ? 12 : 0),
      spin: (v - 0.5) * (burst ? 48 : 40),
      sway: (w - 0.5) * (burst ? 14 : 16),
      opacity: burst
        ? depth === 0
          ? 0.78 + u * 0.16
          : depth === 1
            ? 0.6 + u * 0.16
            : 0.42 + u * 0.14
        : depth === 0
          ? 0.42 + u * 0.08
          : depth === 1
            ? 0.26 + u * 0.08
            : 0.13 + u * 0.07,
    });
  }
  return out;
}

type CalmSeed = {
  left: number;
  width: number;
  fall: number;
  delay: number;
  flutter: number;
  flutterDelay: number;
  sway: number;
  tilt: number;
  opacity: number;
};

const CALM_COUNT = 22;

/** Sparse, slow, paper-like bills. Three depth layers: far ones are smaller, dimmer and slower. */
function buildCalmBills(): CalmSeed[] {
  const rand = mulberry32(0x1b5eed);
  const lanes = shuffledLanePercents(CALM_COUNT, rand);
  return lanes.map((left, i) => {
    const depth = i % 3;
    const u = rand();
    const fall = (depth === 0 ? 15 : depth === 1 ? 19 : 24) + rand() * 6;
    return {
      left,
      width: (depth === 0 ? 30 : depth === 1 ? 24 : 18) + u * 6,
      fall,
      delay: -((i / CALM_COUNT) * fall + rand() * 2),
      flutter: 2.4 + rand() * 2,
      flutterDelay: -rand() * 4,
      sway: 10 + rand() * 18,
      tilt: 8 + rand() * 22,
      opacity: depth === 0 ? 0.5 + u * 0.12 : depth === 1 ? 0.34 + u * 0.1 : 0.2 + u * 0.08,
    };
  });
}

/** Simple $1B green bills with a centered $. `calm` is the slow home-screen drift. */
export function MoneyRain({
  intense = false,
  mega = false,
  calm = false,
}: {
  intense?: boolean;
  /** Extra-dense pour (1v1 win celebration). */
  mega?: boolean;
  calm?: boolean;
  durationMs?: number;
}) {
  const count = mega ? 140 : intense ? 70 : 60;
  const bills = useMemo(() => (calm ? [] : buildBills(count, intense || mega)), [calm, count, intense, mega]);
  const calmBills = useMemo(() => (calm ? buildCalmBills() : []), [calm]);

  if (calm) {
    return (
      <div className="money-rain money-rain--calm" aria-hidden>
        {calmBills.map((bill, i) => (
          <span
            key={i}
            className="money-rain__drop"
            style={
              {
                left: `${bill.left}%`,
                animationDuration: `${bill.fall}s`,
                animationDelay: `${bill.delay}s`,
                ['--bill-opacity' as string]: String(bill.opacity),
              } as CSSProperties
            }
          >
            <span
              className="money-rain__note"
              style={
                {
                  width: `${bill.width}px`,
                  height: `${bill.width / BILL_RATIO}px`,
                  animationDuration: `${bill.flutter}s`,
                  animationDelay: `${bill.flutterDelay}s`,
                  ['--bill-sway' as string]: `${bill.sway}px`,
                  ['--bill-tilt' as string]: `${bill.tilt}deg`,
                } as CSSProperties
              }
            />
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`money-rain${intense || mega ? ' money-rain--intense' : ''}${
        mega ? ' money-rain--mega' : ''
      }`}
      aria-hidden
    >
      {bills.map((bill, i) => (
        <span
          key={i}
          className="money-rain__bill"
          style={
            {
              left: `${bill.left}%`,
              width: `${bill.width}px`,
              height: `${bill.width / BILL_RATIO}px`,
              animationDuration: `${bill.duration}s`,
              animationDelay: `${bill.delay}s`,
              animationIterationCount: intense || mega ? 1 : undefined,
              animationFillMode: intense || mega ? 'forwards' : undefined,
              ['--bill-drift' as string]: `${bill.drift}px`,
              ['--bill-sway' as string]: `${bill.sway}deg`,
              ['--bill-spin' as string]: `${bill.spin}deg`,
              ['--bill-opacity' as string]: String(bill.opacity),
              ['--bill-mark' as string]: `${bill.width * 0.46}px`,
            } as CSSProperties
          }
        >
          <span className="money-rain__mark">$</span>
        </span>
      ))}
    </div>
  );
}
