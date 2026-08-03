import type { AnswerTier } from '../types';

export const TIER_ORDER: AnswerTier[] = ['F', 'D', 'C', 'B', 'A', 'S'];

const TIER_VALUE: Record<AnswerTier, number> = {
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
  F: 0,
};

export const TIER_LABELS: Record<AnswerTier, string> = {
  S: 'Clutch',
  A: 'Clean',
  B: 'Solid',
  C: 'Close',
  D: 'Barely',
  F: 'Brick',
};

export const TIER_HEADLINES: Record<AnswerTier, string> = {
  S: 'Elite IQ and wheels — complete package',
  A: 'Sharp reads with pace to match',
  B: 'Reliable scorer who knows the game',
  C: 'Got the answers, clock still winning',
  D: 'Right idea, need more reps',
  F: 'Back to film study',
};

/** Speed grade for a single correct answer (wrong always F). */
export function getAnswerTier(secondsLeft: number, isCorrect: boolean): AnswerTier {
  if (!isCorrect) return 'F';
  const s = Math.floor(secondsLeft);
  if (s >= 18) return 'S';
  if (s >= 14) return 'A';
  if (s >= 10) return 'B';
  if (s >= 5) return 'C';
  if (s >= 1) return 'D';
  return 'F';
}

export function getCorrectCount(history: AnswerTier[]): number {
  return history.filter((t) => t !== 'F').length;
}

function getSpeedScore(history: AnswerTier[]): number {
  const correct = history.filter((t) => t !== 'F');
  if (correct.length === 0) return 0;
  return correct.reduce((sum, t) => sum + TIER_VALUE[t], 0) / correct.length;
}

function getVolumeScore(correctCount: number): number {
  if (correctCount >= 12) return 5;
  if (correctCount >= 9) return 4;
  if (correctCount >= 6) return 3;
  if (correctCount >= 3) return 2;
  if (correctCount >= 1) return 1;
  return 0;
}

/** Max rank achievable from correct-answer count alone. */
function getVolumeCap(correctCount: number): AnswerTier {
  if (correctCount >= 12) return 'S';
  if (correctCount >= 8) return 'A';
  if (correctCount >= 5) return 'B';
  if (correctCount >= 3) return 'C';
  if (correctCount >= 1) return 'D';
  return 'F';
}

function getBlendedScore(history: AnswerTier[]): number {
  const total = history.length;
  if (total === 0) return 0;

  const correctCount = getCorrectCount(history);
  const speed = getSpeedScore(history);
  const volume = getVolumeScore(correctCount);
  const accuracy = (correctCount / total) * 5;

  return 0.4 * speed + 0.35 * volume + 0.25 * accuracy;
}

function scoreToTier(score: number): AnswerTier {
  if (score >= 4.3) return 'S';
  if (score >= 3.4) return 'A';
  if (score >= 2.6) return 'B';
  if (score >= 1.8) return 'C';
  if (score >= 1.0) return 'D';
  return 'F';
}

function minTier(a: AnswerTier, b: AnswerTier): AnswerTier {
  return compareTiers(a, b) <= 0 ? a : b;
}

/** Run rank blends speed, correct count, and accuracy. */
export function getRunTier(history: AnswerTier[]): AnswerTier {
  if (history.length === 0) return 'F';
  const correctCount = getCorrectCount(history);
  const fromScore = scoreToTier(getBlendedScore(history));
  const cap = getVolumeCap(correctCount);
  return minTier(fromScore, cap);
}

export interface RunBreakdown {
  correct: number;
  total: number;
  accuracyPct: number;
  speedTier: AnswerTier;
  volumeCap: AnswerTier;
}

export function getRunBreakdown(history: AnswerTier[]): RunBreakdown {
  const correct = getCorrectCount(history);
  const total = history.length;
  return {
    correct,
    total,
    accuracyPct: total > 0 ? Math.round((correct / total) * 100) : 0,
    speedTier: scoreToTier(getSpeedScore(history)),
    volumeCap: getVolumeCap(correct),
  };
}

export function compareTiers(a: AnswerTier, b: AnswerTier): number {
  return TIER_VALUE[a] - TIER_VALUE[b];
}

export function getNextTier(current: AnswerTier): AnswerTier | null {
  const idx = TIER_ORDER.indexOf(current);
  return idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
}

/** 0–1 progress toward the next run tier. */
export function getTierProgress(history: AnswerTier[]): number {
  const current = getRunTier(history);
  const next = getNextTier(current);
  if (!next || history.length === 0) return 1;

  const score = getBlendedScore(history);
  const currentThreshold = tierThreshold(current);
  const nextThreshold = tierThreshold(next);
  const range = nextThreshold - currentThreshold;
  if (range <= 0) return 1;
  return Math.min(1, Math.max(0, (score - currentThreshold) / range));
}

function tierThreshold(tier: AnswerTier): number {
  const map: Record<AnswerTier, number> = {
    F: 0,
    D: 1.0,
    C: 1.8,
    B: 2.6,
    A: 3.4,
    S: 4.3,
  };
  return map[tier];
}

export function getDifficultyForQuestion(questionNumber: number): 'easy' | 'medium' | 'hard' {
  if (questionNumber <= 5) return 'easy';
  if (questionNumber <= 10) return 'medium';
  return 'hard';
}

export function buildShareText(tier: AnswerTier, correct: number, bestStreak: number): string {
  return `Shot Clock Challenge: ${tier}-Rank · ${correct} correct · ${bestStreak} streak 🏀`;
}

export const HIGH_SCORE_KEY = 'shot-clock-best-tier';

export interface StoredHighScore {
  tier: AnswerTier;
  streak: number;
  correct: number;
}

export function loadHighScore(): StoredHighScore | null {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredHighScore;
    if (TIER_ORDER.includes(parsed.tier) && typeof parsed.streak === 'number') {
      return {
        tier: parsed.tier,
        streak: parsed.streak,
        correct: parsed.correct ?? 0,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveHighScore(tier: AnswerTier, streak: number, correct: number): boolean {
  const existing = loadHighScore();
  const isBetter =
    !existing ||
    compareTiers(tier, existing.tier) > 0 ||
    (tier === existing.tier && correct > (existing.correct ?? 0)) ||
    (tier === existing.tier && correct === (existing.correct ?? 0) && streak > existing.streak);

  if (!isBetter) return false;

  localStorage.setItem(
    HIGH_SCORE_KEY,
    JSON.stringify({
      tier,
      streak: Math.max(streak, existing?.streak ?? 0),
      correct: Math.max(correct, existing?.correct ?? 0),
    }),
  );
  return true;
}

export function countTiers(history: AnswerTier[]): Partial<Record<AnswerTier, number>> {
  const counts: Partial<Record<AnswerTier, number>> = {};
  for (const t of history) {
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

/** Correct answers needed to unlock each rank ceiling. */
export const RANK_REQUIREMENTS: { tier: AnswerTier; correct: number }[] = [
  { tier: 'D', correct: 1 },
  { tier: 'C', correct: 3 },
  { tier: 'B', correct: 5 },
  { tier: 'A', correct: 8 },
  { tier: 'S', correct: 12 },
];
