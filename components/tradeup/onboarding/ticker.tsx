'use client';

import { useLayoutEffect, useRef } from 'react';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';

/** Quart-out. CSS twin: cubic-bezier(0.25, 1, 0.5, 1). */
export const EASE_OUT: [number, number, number, number] = [0.25, 1, 0.5, 1];

const easeOutQuart = (p: number) => 1 - Math.pow(1 - p, 4);
/** Gentler tail than quart — no crawl at the end of a long climb. CSS twin: cubic-bezier(0.5, 1, 0.89, 1). */
export const easeOutQuad = (p: number) => 1 - (1 - p) * (1 - p);
export const EASE_OUT_QUAD: [number, number, number, number] = [0.5, 1, 0.89, 1];

export function money(value: number): string {
  return `$${Math.max(0, Math.round(value)).toLocaleString('en-US')}`;
}

/**
 * Whole-dollar counter. Writes digits straight to the DOM so a climbing
 * figure never re-renders its parents on every frame.
 */
export function TickerNumber({
  value,
  duration = 800,
  easing = easeOutQuart,
  className,
}: {
  value: number;
  duration?: number;
  easing?: (p: number) => number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const shown = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    if (from === null || from === value || getPrefersReducedMotion()) {
      shown.current = value;
      el.textContent = money(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const next = Math.round(from + (value - from) * easing(p));
      shown.current = next;
      el.textContent = money(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration, easing, value]);

  return <span ref={ref} className={className} />;
}
