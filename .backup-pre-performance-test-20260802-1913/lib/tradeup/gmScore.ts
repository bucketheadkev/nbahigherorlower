import type { TradePlayer } from './types';
import { getPlayerTier, isSTier, type PlayerTier } from './tiers';

export interface GMScoreResult {
  score: number;
  title: string;
}

const TIER_POINTS: Record<PlayerTier, number> = {
  GOAT: 48,
  S: 38,
  A: 30,
  B: 22,
  C: 14,
  D: 8,
  F: 3,
};

export function getGMTitle(score: number): string {
  if (score >= 95) return 'Hall of Fame GM';
  if (score >= 88) return 'Master Negotiator';
  if (score >= 78) return 'Cap Wizard';
  if (score >= 65) return 'Front Office Pro';
  if (score >= 50) return 'Assistant GM';
  if (score >= 30) return 'Trade Machine Casual';
  return 'Lottery-Bound GM';
}

export function calculateGMScore(
  tradePath: TradePlayer[],
  tradesCompleted: number,
  rejectionsUsed: number,
): GMScoreResult {
  const finalPlayer = tradePath[tradePath.length - 1];
  if (!finalPlayer) {
    return { score: 0, title: getGMTitle(0) };
  }

  let score = TIER_POINTS[getPlayerTier(finalPlayer)];
  score += Math.min(tradesCompleted * 4, 28);

  const startValue = tradePath[0]?.tradeValue ?? 0;
  const valueGain = finalPlayer.tradeValue - startValue;
  score += Math.min(Math.max(0, valueGain) * 0.32, 18);

  const pathTiers = tradePath.map(getPlayerTier);
  const tierRank = { F: 0, D: 1, C: 2, B: 3, A: 4, S: 5, GOAT: 6 };
  let climbBonus = 0;
  for (let i = 1; i < pathTiers.length; i++) {
    const delta = tierRank[pathTiers[i]] - tierRank[pathTiers[i - 1]];
    if (delta > 0) climbBonus += delta * 2;
  }
  score += Math.min(climbBonus, 12);

  score -= rejectionsUsed * 7;

  if (tradePath.some(isSTier)) {
    score += 10;
  }

  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  return { score: rounded, title: getGMTitle(rounded) };
}
