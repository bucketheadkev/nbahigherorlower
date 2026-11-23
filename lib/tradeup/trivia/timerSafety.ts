/**
 * Classic Trivia countdown helpers (Fix B).
 * Expiration must be handled outside React setState updaters.
 */

/** Next displayed second + whether the round should auto-resolve as a timeout. */
export function tickTriviaCountdown(seconds: number): {
  next: number;
  expired: boolean;
} {
  if (seconds <= 1) return { next: 0, expired: true };
  return { next: seconds - 1, expired: false };
}

/**
 * Synchronous once-guard so finish(null) / answer submit run only once
 * across timer ticks, rapid taps, and Skip/Continue races.
 */
export function createTriviaSettleGuard() {
  let settled = false;
  return {
    /** Returns true the first time only; later calls are no-ops. */
    claim(): boolean {
      if (settled) return false;
      settled = true;
      return true;
    },
    get settled() {
      return settled;
    },
    reset() {
      settled = false;
    },
  };
}

export type TriviaSettleGuard = ReturnType<typeof createTriviaSettleGuard>;
