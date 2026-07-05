import type { GameMode } from '@/types/game';

const BEST_STREAK_KEY = 'nba-higher-lower-best-streak';
const MODE_BEST_PREFIX = 'nba-higher-lower-best-';

export function getBestStreak(): number {
  if (typeof window === 'undefined') return 0;
  const value = localStorage.getItem(BEST_STREAK_KEY);
  return value ? parseInt(value, 10) : 0;
}

export function setBestStreak(streak: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BEST_STREAK_KEY, String(streak));
}

export function getModeBestStreak(mode: GameMode): number {
  if (typeof window === 'undefined') return 0;
  const value = localStorage.getItem(`${MODE_BEST_PREFIX}${mode}`);
  return value ? parseInt(value, 10) : 0;
}

export function setModeBestStreak(mode: GameMode, streak: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${MODE_BEST_PREFIX}${mode}`, String(streak));
}

export function updateBestStreaks(mode: GameMode, streak: number): number {
  const currentBest = getBestStreak();
  const newBest = Math.max(currentBest, streak);
  if (newBest > currentBest) setBestStreak(newBest);

  const modeBest = getModeBestStreak(mode);
  if (streak > modeBest) setModeBestStreak(mode, streak);

  return newBest;
}
