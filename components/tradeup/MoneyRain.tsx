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

function buildBills(count: number, durationSec: number, burst: boolean): BillSeed[] {
  const out: BillSeed[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i * 0.6180339887) % 1;
    const u = (i * 0.3819660113) % 1;
    const v = (i * 0.7548776662) % 1;
    const depth = i % 3;
    // Ambient rain stays dim inside the arena; celebration keeps punch.
    const ambientOpacity =
      depth === 0 ? 0.42 + u * 0.08 : depth === 1 ? 0.26 + u * 0.08 : 0.13 + u * 0.07;
    out.push({
      left: t * 100,
      width: burst ? 14 + u * 10 : depth === 0 ? 13 + u * 7 : depth === 1 ? 11 + u * 6 : 9 + u * 5,
      duration: burst ? durationSec : 10 + v * 11,
      delay: burst ? u * 0.28 : -((i * 0.41) % 15),
      drift: (u - 0.5) * (burst ? 48 : 34),
      spin: (v - 0.5) * (burst ? 60 : 40),
      sway: (t - 0.5) * (burst ? 22 : 16),
      opacity: burst ? 0.62 + u * 0.35 : ambientOpacity,
    });
  }
  return out;
}

/** Simple $1B green bills with a centered $. */
export function MoneyRain({
  intense = false,
  durationMs = 3000,
}: {
  intense?: boolean;
  /** Intense mode fall length (default 3s for billion celebration). */
  durationMs?: number;
}) {
  const durationSec = Math.max(1, durationMs / 1000);
  const bills = useMemo(
    () => buildBills(intense ? 140 : 60, durationSec, intense),
    [intense, durationSec],
  );

  return (
    <div className={`money-rain${intense ? ' money-rain--intense' : ''}`} aria-hidden>
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
              animationIterationCount: intense ? 1 : undefined,
              animationFillMode: intense ? 'forwards' : undefined,
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
