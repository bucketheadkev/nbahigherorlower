import {
  TRIVIA_QUESTIONS,
  type TriviaDifficulty,
  type TriviaQuestion,
} from './questions';

export type { TriviaDifficulty, TriviaQuestion };
export { TRIVIA_QUESTIONS } from './questions';

/** Cash bonus for a correct easy answer (in-game Cash, not real money). */
export const TRIVIA_BONUS_EASY = 10_000_000;
/** Cash bonus for a correct medium answer. */
export const TRIVIA_BONUS_MEDIUM = 25_000_000;
/** Cash bonus for a correct hard answer. */
export const TRIVIA_BONUS_HARD = 45_000_000;

export const TRIVIA_BONUS_BY_DIFFICULTY: Record<TriviaDifficulty, number> = {
  easy: TRIVIA_BONUS_EASY,
  medium: TRIVIA_BONUS_MEDIUM,
  hard: TRIVIA_BONUS_HARD,
};

/** Seconds to answer before the question times out. */
export const TIMER_SECONDS = 15;

/** Pick a random unused question for the given difficulty, or null if none remain. */
export function pickTriviaQuestion(
  difficulty: TriviaDifficulty,
  excludeIds: string[],
): TriviaQuestion | null {
  const excluded = new Set(excludeIds);
  const pool = TRIVIA_QUESTIONS.filter((q) => q.difficulty === difficulty && !excluded.has(q.id));
  if (pool.length === 0) return null;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? null;
}

export function triviaBonusFor(difficulty: TriviaDifficulty): number {
  return TRIVIA_BONUS_BY_DIFFICULTY[difficulty];
}

export {
  decideTriviaGate,
  isTriviaEligibleFromSettledTotal,
  lockSettledTriviaTotal,
  type TriviaEligibility,
  type TriviaGateDecision,
} from './triviaGate';
