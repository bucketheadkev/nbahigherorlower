/**
 * Trivia Cash payouts for Classic runs.
 *
 * Guests: credited via the on-device local ledger (`trivia_bonus`).
 * Signed-in: still credited locally so the client balance updates immediately.
 *
 * TODO: Cloud sync for signed-in players needs a later SQL migration that posts
 * through public.bank_post(..., 'trivia_bonus', ref, ...). There is no client-callable
 * bank_post RPC today (bank_post is revoked from anon/authenticated). Do not create
 * that migration until product asks for it — local ledger alone is enough for guests
 * and for provisional signed-in credit.
 */

import {
  appendLocalLedger,
  BANK_CHANGED_EVENT,
  getLocalLedgerRefs,
} from '@/lib/tradeup/bank';
import { TRIVIA_BONUS_BY_DIFFICULTY, type TriviaDifficulty } from './index';

/** Answered / paid trivia refs so the same run+difficulty never double-pays. */
export const TRIVIA_PAID_STORAGE_KEY = 'oneb_trivia_paid_v1';

function paidRef(runRef: string, difficulty: TriviaDifficulty): string {
  return `trivia:${runRef}:${difficulty}`;
}

function readPaidRefs(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const parsed = JSON.parse(localStorage.getItem(TRIVIA_PAID_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

function markPaid(ref: string): void {
  if (typeof window === 'undefined') return;
  const paid = readPaidRefs();
  paid.add(ref);
  try {
    localStorage.setItem(TRIVIA_PAID_STORAGE_KEY, JSON.stringify([...paid]));
  } catch {
    /* private mode */
  }
}

export function hasPaidTriviaBonus(runRef: string, difficulty: TriviaDifficulty): boolean {
  const ref = paidRef(runRef, difficulty);
  if (readPaidRefs().has(ref)) return true;
  return getLocalLedgerRefs('trivia_bonus').has(ref);
}

/**
 * Credits a trivia Cash bonus once per (runRef, difficulty) when `correct` is true.
 * Returns the amount credited (0 if wrong, already paid, or SSR).
 */
export function payTriviaBonus(
  runRef: string,
  difficulty: TriviaDifficulty,
  correct: boolean,
): number {
  if (typeof window === 'undefined' || !correct || !runRef) return 0;
  const ref = paidRef(runRef, difficulty);
  if (hasPaidTriviaBonus(runRef, difficulty)) return 0;

  const amount = TRIVIA_BONUS_BY_DIFFICULTY[difficulty];
  if (!(amount > 0)) return 0;

  const appended = appendLocalLedger({ ref, amount, kind: 'trivia_bonus' });
  if (!appended) return 0;

  markPaid(ref);
  window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
  // TODO(server): when trivia_bonus bank_post exists, sync signed-in payouts here.
  return amount;
}
