/**
 * Classic Trivia eligibility gate (Fix C).
 *
 * Only the settled, fully evaluated lineup total may decide Trivia.
 * Never animated / partial / re-summed live totals.
 */

import { rolloverFor } from '../rollover';

export type TriviaEligibility = 'pending' | 'eligible' | 'ineligible';

export type TriviaGateDecision =
  /** Open Trivia for this completed run (once). */
  | { action: 'open'; runRef: string; settledTotal: number }
  /** Not eligible — continue Build Another without Trivia. */
  | { action: 'skip' }
  /** Evaluation not settled yet — do not open Trivia and do not leave results. */
  | { action: 'wait' }
  /** Duplicate Build Another / completion — ignore. */
  | { action: 'ignore' };

/** Same threshold as today: any Bank rollover above $1B unlocks Trivia. */
export function isTriviaEligibleFromSettledTotal(settledTotal: number): boolean {
  return rolloverFor(settledTotal) > 0;
}

/**
 * Lock the settled evaluation total the first time it arrives.
 * Later duplicate completion callbacks cannot replace it with a different number.
 */
export function lockSettledTriviaTotal(
  state: {
    evaluationSettled: boolean;
    settledTotal: number;
    eligibility: TriviaEligibility;
  },
  teamValue: number,
): {
  evaluationSettled: boolean;
  settledTotal: number;
  eligibility: TriviaEligibility;
  lockedNow: boolean;
} {
  if (state.evaluationSettled) {
    return { ...state, lockedNow: false };
  }
  const settledTotal = Math.round(teamValue);
  return {
    evaluationSettled: true,
    settledTotal,
    eligibility: isTriviaEligibleFromSettledTotal(settledTotal) ? 'eligible' : 'ineligible',
    lockedNow: true,
  };
}

/**
 * Build Another → Trivia decision. Eligibility is derived only from the locked
 * settled total and is not recomputed from live roster sums.
 */
export function decideTriviaGate(input: {
  isClassicRun: boolean;
  evaluationSettled: boolean;
  settledTotal: number;
  eligibility: TriviaEligibility;
  runRef: string | null | undefined;
  triviaOpened: boolean;
  triviaOpen: boolean;
}): TriviaGateDecision {
  if (!input.isClassicRun) return { action: 'skip' };
  if (input.triviaOpened || input.triviaOpen) return { action: 'ignore' };
  if (!input.evaluationSettled || input.eligibility === 'pending') {
    return { action: 'wait' };
  }
  if (input.eligibility !== 'eligible') return { action: 'skip' };
  if (!input.runRef) return { action: 'skip' };
  return {
    action: 'open',
    runRef: input.runRef,
    settledTotal: input.settledTotal,
  };
}
