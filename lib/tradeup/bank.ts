/**
 * In-game Bank. Game cash only — not real money.
 *
 * Achievement / challenge Cash rewards are retired. Guest display uses the on-device
 * ledger only (trivia, run bonuses, rank rewards). Signed-in players use the server ledger.
 */

import { getBillionRuns } from './billionRuns';
import { ACHIEVEMENT_UNLOCKED_EVENT } from './challenges';

/** Internal payout bands (historical). Achievement Cash is retired — always $0. */
export type RewardTier = 'rookie' | 'pro' | 'allstar' | 'mvp' | 'legend';

export const TIER_CASH: Record<RewardTier, number> = {
  rookie: 50_000,
  pro: 100_000,
  allstar: 150_000,
  mvp: 250_000,
  legend: 1_000_000,
};

export const BANK_SEEN_STORAGE_KEY = 'oneb_bank_paid_seen_v1';

/** Retired — challenges/achievements no longer pay Bank cash (always 0). */
export function challengeReward(_id: string): number {
  return 0;
}

/** Whole-dollar cash label with commas, e.g. $25,000. */
export function formatCash(value: number): string {
  const n = Math.max(0, Math.round(value));
  return `$${n.toLocaleString('en-US')}`;
}

/**
 * On-device Cash movements (Rollover, Run Bonuses, rank rewards, trivia). The
 * cash_table_* kinds are history from the retired guest wagers. Signed-in players'
 * authoritative balance is the server ledger.
 */
export const LOCAL_LEDGER_STORAGE_KEY = 'oneb_bank_ledger_v1';

export interface LocalLedgerEntry {
  ref: string;
  amount: number;
  kind:
    | 'classic_run_bonus'
    | 'run_bonus'
    | 'rank_reward'
    | 'cash_table_wager'
    | 'cash_table_payout'
    | 'cash_table_refund'
    /** Guest/local trivia run bonuses. Cloud sync needs a later SQL migration. */
    | 'trivia_bonus';
  at: number;
}

function readLocalLedger(): LocalLedgerEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_LEDGER_STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (e): e is LocalLedgerEntry =>
            Boolean(e) && typeof e.ref === 'string' && Number.isFinite(e.amount),
        )
      : [];
  } catch {
    return [];
  }
}

/** Appends once per (kind, ref). Returns false when already recorded. */
export function appendLocalLedger(entry: Omit<LocalLedgerEntry, 'at'>): boolean {
  if (typeof window === 'undefined') return false;
  const entries = readLocalLedger();
  if (entries.some((e) => e.ref === entry.ref && e.kind === entry.kind)) return false;
  entries.push({ ...entry, at: Date.now() });
  try {
    localStorage.setItem(LOCAL_LEDGER_STORAGE_KEY, JSON.stringify(entries.slice(-200)));
  } catch {
    return false;
  }
  return true;
}

export function getLocalLedgerRefs(kind: LocalLedgerEntry['kind']): Set<string> {
  return new Set(readLocalLedger().filter((e) => e.kind === kind).map((e) => e.ref));
}

export function getLocalLedgerTotal(): number {
  return readLocalLedger().reduce((sum, e) => sum + e.amount, 0);
}

/** Sum of one local-ledger kind (e.g. trivia_bonus while server post is in flight). */
export function getLocalLedgerTotalByKind(kind: LocalLedgerEntry['kind']): number {
  return readLocalLedger()
    .filter((e) => e.kind === kind)
    .reduce((sum, e) => sum + Math.max(0, Math.round(e.amount)), 0);
}

/** Drop a ledger row once the server has the same credit (avoids double-count). */
export function removeLocalLedgerEntry(kind: LocalLedgerEntry['kind'], ref: string): boolean {
  if (typeof window === 'undefined' || !ref) return false;
  const entries = readLocalLedger();
  const next = entries.filter((e) => !(e.kind === kind && e.ref === ref));
  if (next.length === entries.length) return false;
  try {
    localStorage.setItem(LOCAL_LEDGER_STORAGE_KEY, JSON.stringify(next.slice(-200)));
  } catch {
    return false;
  }
  return true;
}

/**
 * Device-only Cash still owed on top of the server ledger (trivia waiting to sync).
 * Cleared per-ref after `post_my_trivia_bonus` succeeds.
 */
export function getPermanentDeviceBankCredit(): number {
  return getLocalLedgerTotalByKind('trivia_bonus');
}

export function getBankBalance(): number {
  // Achievements no longer contribute; guest Cash is ledger-only.
  return Math.max(0, getLocalLedgerTotal());
}

function readSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(BANK_SEEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

/** Retired — no achievement Cash celebrations. */
export function getUncelebratedPayouts(): string[] {
  return [];
}

export function markPayoutsCelebrated(ids: string[]): void {
  if (typeof window === 'undefined' || ids.length === 0) return;
  const seen = readSeen();
  for (const id of ids) seen.add(id);
  try {
    localStorage.setItem(BANK_SEEN_STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    /* private mode */
  }
}

/**
 * Dev-only `?bankPreview=<dollars>`: shows that balance everywhere for design review.
 * Never written to the ledger, never sent to the server, ignored in production.
 */
export function readBankPreview(): number | null {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null;
  try {
    const raw = new URLSearchParams(window.location.search).get('bankPreview');
    const value = raw == null ? NaN : Number(raw.replace(/[$,_]/g, ''));
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  } catch {
    return null;
  }
}

/** Fired whenever the balance may have changed. */
export const BANK_CHANGED_EVENT = ACHIEVEMENT_UNLOCKED_EVENT;

/**
 * Signed-in Bank Money bump before the server ledger catches up.
 * `useBankBalance` registers a handler so credits land even if no React
 * subscriber is mounted yet (queued until bind).
 */
type OptimisticBankHandler = (amount: number) => void;
let optimisticBankHandler: OptimisticBankHandler | null = null;
let pendingOptimisticBank = 0;

/** Register / clear the Bank display optimistic-credit sink (from `useBankBalance`). */
export function bindOptimisticBankCredit(handler: OptimisticBankHandler | null): void {
  optimisticBankHandler = handler;
  if (handler && pendingOptimisticBank > 0) {
    const queued = pendingOptimisticBank;
    pendingOptimisticBank = 0;
    handler(queued);
  }
}

/** Ask the Bank display to credit Cash immediately (signed-in optimistic path). */
export function announceOptimisticBankCredit(amount: number): void {
  if (typeof window === 'undefined' || !(amount > 0)) return;
  const n = Math.round(amount);
  if (optimisticBankHandler) {
    optimisticBankHandler(n);
  } else {
    pendingOptimisticBank += n;
  }
}

/** Classic runs over this goal earn their surplus (see surplusSpin). */
export const RUN_BONUS_GOAL = 1_000_000_000;

export function runBonusFor(total: number): number {
  return Math.max(0, Math.round(total) - RUN_BONUS_GOAL);
}

/** Fired with `BankPayoutDetail` for non-achievement Cash that should be celebrated. */
export const BANK_PAYOUT_EVENT = 'oneb:bank-payout';

export interface BankPayoutDetail {
  kind: 'run_bonus';
  /** Unique per payout so repeated events are celebrated once. */
  ref: string;
  amount: number;
  /** Run total that earned a run bonus. */
  runTotal?: number;
}

export function announcePayout(detail: BankPayoutDetail): void {
  if (typeof window === 'undefined' || !(detail.amount > 0)) return;
  window.dispatchEvent(new CustomEvent(BANK_PAYOUT_EVENT, { detail }));
}

const RUN_BONUS_CATCH_UP_KEY = 'oneb_run_bonus_catchup_v1';
/** Bank launch (Oct 17, 2026 00:00 Pacific) — matches the server backfill window. */
const BANK_LAUNCH_AT = Date.UTC(2026, 9, 17, 7, 0, 0);

/**
 * One-time payout for $1B+ runs saved on this device before run bonuses existed.
 * Runs after this point are paid by the game itself, so the flag prevents double pay.
 */
export function catchUpRunBonuses(): number {
  if (typeof window === 'undefined') return 0;
  try {
    if (localStorage.getItem(RUN_BONUS_CATCH_UP_KEY)) return 0;
    localStorage.setItem(RUN_BONUS_CATCH_UP_KEY, String(Date.now()));
  } catch {
    return 0;
  }
  let total = 0;
  for (const run of getBillionRuns()) {
    if (run.completedAt < BANK_LAUNCH_AT) continue;
    const amount = runBonusFor(run.teamValue);
    if (amount > 0 && appendLocalLedger({ ref: run.id, amount, kind: 'classic_run_bonus' })) {
      total += amount;
      announcePayout({ kind: 'run_bonus', ref: run.id, amount, runTotal: run.teamValue });
    }
  }
  if (total > 0) window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
  return total;
}
