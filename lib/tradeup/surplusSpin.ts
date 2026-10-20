/**
 * Surplus Spin — after a Classic run over $1B the player either banks the surplus
 * (team value − $1B) or risks it on one weighted multiplier spin. In-game Cash only.
 *
 * Signed-in players: the server prices the run, rolls, and pays exactly once
 * (supabase/migrations/20261018_1_surplus_spin.sql — the authoritative odds table).
 * Guests: the same rules run on this device; the decision is saved before the reel moves.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { appendLocalLedger, BANK_CHANGED_EVENT, RUN_BONUS_GOAL } from './bank';

export interface SurplusOdd {
  /** Multiplier × 10, so 0.5× stays an integer. */
  tenths: number;
  /** Weight out of ODDS_TOTAL. */
  weight: number;
}

/** Mirror of public.surplus_spin_odds. Rebalance both together. */
export const SURPLUS_ODDS: readonly SurplusOdd[] = [
  { tenths: 0, weight: 3500 },
  { tenths: 5, weight: 2300 },
  { tenths: 10, weight: 2000 },
  { tenths: 20, weight: 1300 },
  { tenths: 30, weight: 450 },
  { tenths: 40, weight: 200 },
  { tenths: 50, weight: 110 },
  { tenths: 60, weight: 60 },
  { tenths: 70, weight: 35 },
  { tenths: 80, weight: 20 },
  { tenths: 90, weight: 15 },
  { tenths: 100, weight: 10 },
];

export const ODDS_TOTAL = SURPLUS_ODDS.reduce((sum, o) => sum + o.weight, 0);

/** Average payout per $1 of surplus risked (0.945 — banking is never worse on average). */
export const EXPECTED_MULTIPLIER =
  SURPLUS_ODDS.reduce((sum, o) => sum + (o.tenths / 10) * o.weight, 0) / ODDS_TOTAL;

export type SurplusChoice = 'bank' | 'spin';

export interface SurplusState {
  status: 'none' | 'pending' | 'resolved';
  runRef: string;
  runValue: number;
  surplus: number;
  choice?: SurplusChoice;
  multiplierTenths?: number;
  payout?: number;
}

export function surplusFor(runValue: number): number {
  return Math.max(0, Math.round(runValue) - RUN_BONUS_GOAL);
}

/** Whole dollars, rounded down (0.5× of an odd surplus drops the half dollar). */
export function payoutFor(surplus: number, tenths: number): number {
  return Math.floor((surplus * tenths) / 10);
}

export function formatMultiplier(tenths: number): string {
  return `${tenths % 10 === 0 ? tenths / 10 : (tenths / 10).toFixed(1)}×`;
}

export function oddsPercent(weight: number): string {
  const pct = (weight / ODDS_TOTAL) * 100;
  return `${Number(pct.toFixed(pct >= 1 ? 1 : 2))}%`;
}

export type MultiplierTier = 'common' | 'mid' | 'rare';

export function multiplierTier(tenths: number): MultiplierTier {
  if (tenths >= 50) return 'rare';
  if (tenths >= 30) return 'mid';
  return 'common';
}

function pickWeighted(roll: number): number {
  let pick = roll % ODDS_TOTAL;
  for (const odd of SURPLUS_ODDS) {
    if (pick < odd.weight) return odd.tenths;
    pick -= odd.weight;
  }
  return 10;
}

function secureRoll(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
}

/** One weighted roll (tenths) using the device's secure random source. */
export function rollMultiplier(): number {
  return pickWeighted(secureRoll());
}

/** Dev-only `?surplusPreview=<run value>[&mult=<tenths>]` — simulated, never credited. */
export function readSurplusPreview(): { runValue: number; forced: number | null } | null {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const runValue = Number(params.get('surplusPreview'));
    if (!Number.isFinite(runValue) || surplusFor(runValue) <= 0) return null;
    const mult = params.get('mult');
    const forced = mult != null && SURPLUS_ODDS.some((o) => o.tenths === Number(mult)) ? Number(mult) : null;
    return { runValue, forced };
  } catch {
    return null;
  }
}

/* ── Guest (on-device) ───────────────────────────────────────── */

const LOCAL_KEY = 'oneb_surplus_v1';
const MAX_LOCAL = 40;

type LocalRecord = Omit<SurplusState, 'status'> & {
  status: 'pending' | 'resolved';
  at: number;
};

function readLocal(): Record<string, LocalRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LocalRecord>) : {};
  } catch {
    return {};
  }
}

function writeLocal(records: Record<string, LocalRecord>): void {
  const kept = Object.values(records)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_LOCAL);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(Object.fromEntries(kept.map((r) => [r.runRef, r]))));
}

function toState(record: LocalRecord | undefined, runRef: string): SurplusState {
  if (!record) return { status: 'none', runRef, runValue: 0, surplus: 0 };
  const { at: _at, ...state } = record;
  return state;
}

/** Records a qualifying run as pending (idempotent). */
export function openLocalSurplus(runRef: string, runValue: number): SurplusState {
  const surplus = surplusFor(runValue);
  if (surplus <= 0 || typeof window === 'undefined') {
    return { status: 'none', runRef, runValue, surplus: 0 };
  }
  const records = readLocal();
  if (!records[runRef]) {
    records[runRef] = { status: 'pending', runRef, runValue: Math.round(runValue), surplus, at: Date.now() };
    writeLocal(records);
  }
  return toState(records[runRef], runRef);
}

export function latestPendingLocalSurplus(): SurplusState | null {
  const pending = Object.values(readLocal())
    .filter((r) => r.status === 'pending')
    .sort((a, b) => b.at - a.at)[0];
  return pending ? toState(pending, pending.runRef) : null;
}

/** Decides and pays once. The outcome is persisted before it is returned. */
export function resolveLocalSurplus(runRef: string, choice: SurplusChoice): SurplusState {
  const records = readLocal();
  const record = records[runRef];
  if (!record || record.status === 'resolved') return toState(record, runRef);
  const tenths = choice === 'spin' ? rollMultiplier() : 10;
  const payout = payoutFor(record.surplus, tenths);
  records[runRef] = { ...record, status: 'resolved', choice, multiplierTenths: tenths, payout };
  writeLocal(records);
  if (payout > 0) appendLocalLedger({ ref: runRef, amount: payout, kind: 'classic_run_bonus' });
  window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
  return toState(records[runRef], runRef);
}

/* ── Signed-in (server) ──────────────────────────────────────── */

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);
/** A stalled request must surface as an error with Retry, never an endlessly disabled panel. */
const SURPLUS_RPC_TIMEOUT_MS = 12_000;

export type ServerSurplusResult =
  | { ok: true; state: SurplusState }
  | { ok: false; reason: 'unavailable' | 'error' };

function fromServer(data: unknown, runRef: string): SurplusState {
  const row = (data ?? {}) as Record<string, unknown>;
  const status = row.status === 'pending' || row.status === 'resolved' ? row.status : 'none';
  const choice = row.choice === 'bank' || row.choice === 'spin' ? row.choice : undefined;
  return {
    status,
    runRef: typeof row.client_run_id === 'string' ? row.client_run_id : runRef,
    runValue: Number(row.run_value) || 0,
    surplus: Number(row.surplus) || 0,
    choice,
    multiplierTenths: row.multiplier_tenths == null ? undefined : Number(row.multiplier_tenths),
    payout: row.payout == null ? undefined : Number(row.payout),
  };
}

async function callSurplus(
  fn: string,
  args: Record<string, unknown> | undefined,
  runRef: string,
): Promise<ServerSurplusResult> {
  try {
    let timer = 0;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error('timeout')), SURPLUS_RPC_TIMEOUT_MS);
    });
    const { data, error } = await Promise.race([getSupabaseBrowserClient().rpc(fn, args), timeout]).finally(
      () => window.clearTimeout(timer),
    );
    if (error) {
      if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return { ok: false, reason: 'unavailable' };
      console.error(`[surplus] ${fn} failed`, error.message);
      return { ok: false, reason: 'error' };
    }
    return { ok: true, state: fromServer(data, runRef) };
  } catch (err) {
    console.error(`[surplus] ${fn} error`, err);
    return { ok: false, reason: 'error' };
  }
}

export function fetchServerSurplus(runRef: string): Promise<ServerSurplusResult> {
  return callSurplus('get_surplus_decision', { p_client_run_id: runRef }, runRef);
}

export function fetchPendingServerSurplus(): Promise<ServerSurplusResult> {
  return callSurplus('get_pending_surplus', undefined, '');
}

export async function resolveServerSurplus(
  runRef: string,
  choice: SurplusChoice,
): Promise<ServerSurplusResult> {
  const result = await callSurplus('resolve_surplus', { p_client_run_id: runRef, p_choice: choice }, runRef);
  if (result.ok && typeof window !== 'undefined') window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
  return result;
}
