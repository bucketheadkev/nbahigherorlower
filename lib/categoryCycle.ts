import type { StatCategory } from '@/types/game';

/** Fixed category order for every run — cycles after the last one. */
export const CATEGORY_CYCLE: StatCategory[] = [
  'careerPoints',
  'careerAssists',
  'careerRebounds',
  'careerBlocks',
  'careerSteals',
  'championships',
  'allStars',
  'mvps',
  'draftPick',
  'height',
  'age',
  'careerEarnings',
  'instagramFollowers',
];

export function getCategoryForStreak(streak: number): StatCategory {
  const index = ((streak % CATEGORY_CYCLE.length) + CATEGORY_CYCLE.length) % CATEGORY_CYCLE.length;
  return CATEGORY_CYCLE[index];
}

export function getNextCategoryAfterCorrect(currentStreak: number): StatCategory {
  return getCategoryForStreak(currentStreak + 1);
}

export const CATEGORY_COUNT = CATEGORY_CYCLE.length;

export const ROUND_TIME_SECONDS = 60;
export const GAME_OVER_ANSWER_SECONDS = 5;
