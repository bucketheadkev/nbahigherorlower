/**
 * Trivia Bank Cash.
 *
 * Permanent accounts: server issues a challenge (trivia_issue) and pays only via
 * trivia_answer after a correct choice. Clients never assert correctness alone.
 *
 * Guests: local ledger only (same amounts) — no Bank leaderboard sync.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isPermanentAuthUser } from '@/lib/account/userKind';
import {
  announceOptimisticBankCredit,
  appendLocalLedger,
  BANK_CHANGED_EVENT,
  getLocalLedgerRefs,
  removeLocalLedgerEntry,
} from '@/lib/tradeup/bank';
import { TRIVIA_BONUS_BY_DIFFICULTY, type TriviaDifficulty } from './index';

export const TRIVIA_PAID_STORAGE_KEY = 'oneb_trivia_paid_v1';

const MISSING_RPC = new Set(['PGRST202', '42883']);

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

export interface TriviaChallengePayload {
  challengeId: string;
  questionId: string;
  difficulty: TriviaDifficulty;
  prompt: string;
  choices: [string, string, string, string];
  expiresAt: string;
}

/** Server-issued question (no correctIndex). Falls back to null if RPC missing / guest. */
export async function issueTriviaChallenge(
  runRef: string,
  difficulty: TriviaDifficulty,
): Promise<TriviaChallengePayload | null> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user || !isPermanentAuthUser(user)) return null;

    // Text overload accepts the canonical session UUID string.
    const { data, error } = await supabase.rpc('trivia_issue', {
      p_client_run_id: runRef,
      p_difficulty: difficulty,
    });
    if (error) {
      if (error.code && MISSING_RPC.has(error.code)) return null;
      console.warn('[bank-trivia] issue', error.message);
      return null;
    }
    const row = (data ?? {}) as Record<string, unknown>;
    const choices = row.choices;
    if (!Array.isArray(choices) || choices.length !== 4) return null;
    return {
      challengeId: String(row.challenge_id ?? ''),
      questionId: String(row.question_id ?? ''),
      difficulty,
      prompt: String(row.prompt ?? ''),
      choices: choices as [string, string, string, string],
      expiresAt: String(row.expires_at ?? ''),
    };
  } catch (err) {
    console.warn('[bank-trivia] issue error', err);
    return null;
  }
}

/**
 * Submit answer to a server challenge. Pays Bank Cash only if correct.
 * Returns amount paid (0 if wrong / expired / duplicate).
 */
export async function answerTriviaChallenge(
  challengeId: string,
  choiceIndex: number | null,
  runRef: string,
  difficulty: TriviaDifficulty,
): Promise<number> {
  if (!challengeId || choiceIndex == null) return 0;
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc('trivia_answer', {
      p_challenge_id: challengeId,
      p_choice_index: choiceIndex,
    });
    if (error) {
      console.warn('[bank-trivia] answer', error.message);
      return 0;
    }
    const row = (data ?? {}) as Record<string, unknown>;
    const paid = Math.max(0, Math.floor(Number(row.paid) || 0));
    if (paid > 0) {
      markPaid(paidRef(runRef, difficulty));
      announceOptimisticBankCredit(paid);
      removeLocalLedgerEntry('trivia_bonus', paidRef(runRef, difficulty));
      window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
    }
    return paid;
  } catch (err) {
    console.warn('[bank-trivia] answer error', err);
    return 0;
  }
}

/**
 * Guest / offline optimistic pay. Permanent accounts should use answerTriviaChallenge.
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
  announceOptimisticBankCredit(amount);
  window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
  return amount;
}

/**
 * Legacy local rows cannot be posted via the rejected post_my_trivia_bonus path.
 * Clears stale device rows once the secure RPCs are live so Home doesn't stay inflated.
 */
export async function flushPendingTriviaBonuses(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const refs = [...getLocalLedgerRefs('trivia_bonus')];
  if (refs.length === 0) return 0;
  try {
    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user || !isPermanentAuthUser(user)) return 0;

    // Probe: if trivia_answer exists, drop unsyncable optimistic rows (require re-play).
    const { error } = await supabase.rpc('post_my_trivia_bonus', {
      p_source_ref: 'probe',
      p_difficulty: 'easy',
    });
    if (error?.code && MISSING_RPC.has(error.code)) return 0;
    // use_trivia_answer or other → clear local-only leftovers that can never sync.
    let cleared = 0;
    for (const ref of refs) {
      if (removeLocalLedgerEntry('trivia_bonus', ref)) cleared += 1;
    }
    if (cleared > 0) window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
    return cleared;
  } catch {
    return 0;
  }
}
