/**
 * In-game Bank. Game cash only — not real money.
 *
 * The balance is achievement rewards (derived from the local + cloud achievement save,
 * so one challenge never pays twice) plus an on-device ledger for guest Rollover, Run Bonuses
 * and rank rewards.
 */

import { getBillionRuns } from './billionRuns';
import {
  ACHIEVEMENT_UNLOCKED_EVENT,
  buildChallengeProgressList,
  type ChallengeProgress,
} from './challenges';

/** Internal payout bands. Never shown to players. */
export type RewardTier = 'rookie' | 'pro' | 'allstar' | 'mvp' | 'legend';

export const TIER_CASH: Record<RewardTier, number> = {
  rookie: 50_000,
  pro: 100_000,
  allstar: 150_000,
  mvp: 250_000,
  legend: 1_000_000,
};

/** Server copy: public.achievement_cash_reward() in supabase/migrations/20261018_7_achievement_payouts.sql. */
const CHALLENGE_TIER: Record<string, RewardTier> = {
  'halfway-home': 'rookie',
  'closing-in': 'rookie',
  'h2h-first-win': 'rookie',

  'near-miss-950m': 'pro',
  'all-in': 'pro',
  'league-tour': 'pro',
  'generational-wealth': 'pro',
  'h2h-statement': 'pro',

  'no-second-chances': 'allstar',
  'just-enough': 'allstar',
  'hit-1-05b': 'allstar',
  'billion-and-beyond': 'allstar',
  'no-headliners': 'allstar',
  'double-trouble': 'allstar',
  'triple-threat': 'allstar',
  'back-to-back-billions': 'allstar',
  'h2h-billion': 'allstar',
  'h2h-three-wins': 'allstar',

  'hit-1b': 'mvp',
  'elite-company': 'mvp',
  'two-hundred-m-club': 'mvp',
  'balanced-books': 'mvp',
  'five-star-portfolio': 'mvp',
  'top-of-the-market': 'mvp',
  'clutch-investment': 'mvp',
  'perfect-range': 'mvp',
  'three-peat': 'mvp',
  'h2h-clean-sweep': 'mvp',

  'ten-billion-runs': 'legend',
};

export const BANK_SEEN_STORAGE_KEY = 'oneb_bank_paid_seen_v1';

/** Unknown or removed IDs pay nothing, matching the server. */
export function challengeReward(id: string): number {
  const tier = CHALLENGE_TIER[id];
  return tier ? TIER_CASH[tier] : 0;
}

/** Whole-dollar cash label with commas, e.g. $25,000. */
export function formatCash(value: number): string {
  const n = Math.max(0, Math.round(value));
  return `$${n.toLocaleString('en-US')}`;
}

function completedIds(list: ChallengeProgress[] = buildChallengeProgressList()): string[] {
  return list.filter((item) => item.complete).map((item) => item.id);
}

/**
 * On-device Cash movements beyond achievements (Rollover, Run Bonuses, rank rewards). The
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
    | 'cash_table_refund';
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

function localLedgerTotal(): number {
  return readLocalLedger().reduce((sum, e) => sum + e.amount, 0);
}

export function getBankBalance(): number {
  const earned = completedIds().reduce((sum, id) => sum + challengeReward(id), 0);
  return Math.max(0, earned + localLedgerTotal());
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

/** Completed achievements whose cash this device has not celebrated yet. */
export function getUncelebratedPayouts(): string[] {
  const seen = readSeen();
  return completedIds().filter((id) => !seen.has(id));
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


