import type { FCard, FPay, FState } from '@/lib/account/franchiseV5Cloud';
import { POSITIONS, type Slot } from './config';

/** Dollars for `fanSeconds` of exposure in a period of `periodSeconds`. Mirrors franchise_v5_period_pay. */
export function payFor(fanSeconds: number, periodSeconds: number, payPpm: number): number {
  if (periodSeconds <= 0) return 0;
  return Math.floor((Math.max(0, fanSeconds) * payPpm) / (1_000_000 * periodSeconds));
}

/** One full period at a constant fan count (the "every 12 hours" figure). */
export function fullPeriodPay(fans: number, payPpm: number): number {
  return Math.floor((Math.max(0, fans) * payPpm) / 1_000_000);
}

/**
 * The paycheck that will land at the end of the current period if the lineup stays as it is:
 * fan-seconds already banked this period, plus the current fans until the period ends.
 */
export function nextPaycheck(pay: FPay, payPpm: number): number {
  const periodSeconds = (pay.periodEnd - pay.periodStart) / 1000;
  const remaining = Math.max(0, (pay.periodEnd - pay.lastAt) / 1000);
  return payFor(pay.fanSeconds + pay.fans * remaining, periodSeconds, payPpm);
}

export function lineupCards(state: FState): Partial<Record<Slot, FCard>> {
  const out: Partial<Record<Slot, FCard>> = {};
  for (const slot of POSITIONS) {
    const card = state.cards.find((c) => c.id === state.lineup[slot]);
    if (card) out[slot] = card;
  }
  return out;
}

/** TOTAL FANS = PG + SG + SF + PF + C (active five only). */
export function totalFans(state: FState): number {
  return POSITIONS.reduce((sum, slot) => sum + (state.cards.find((c) => c.id === state.lineup[slot])?.fans ?? 0), 0);
}

export function formatClock(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}
