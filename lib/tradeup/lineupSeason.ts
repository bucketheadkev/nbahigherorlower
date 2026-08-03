import { LINEUP_POSITIONS } from './startingLineup';
import { getPlayerTier, type PlayerTier } from './tiers';
import type { Position, TradePlayer } from './types';

export interface SeasonAnalysis {
  offense: number;
  defense: number;
  shooting: number;
  playmaking: number;
  rebounding: number;
  positionalBalance: number;
  starPower: number;
  chemistry: number;
  lineupScore: number;
  overall: number;
  /** Kept for older message helpers; always 0 in the tier-driven model. */
  benchLimitation: number;
}

export type SeasonGameResult = 'W' | 'L';

export interface SeasonRecord {
  wins: number;
  losses: number;
  expectedWins: number;
  analysis: SeasonAnalysis;
  games: SeasonGameResult[];
}

export type SeasonReaction =
  | 'Championship Favorite'
  | 'Contender'
  | 'Playoff Team'
  | 'Play-In Team'
  | 'Lottery Team';

const TIER_BASE: Record<PlayerTier, number> = {
  F: 45,
  D: 57,
  C: 68,
  B: 79,
  A: 90,
  S: 100,
  GOAT: 108,
};

const TIER_BOUNDS: Record<PlayerTier, [number, number]> = {
  F: [0, 28],
  D: [28, 45],
  C: [45, 62],
  B: [62, 78],
  A: [78, 92],
  S: [92, 97],
  GOAT: [97, 100],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function isReasonableFit(slot: Position, player: TradePlayer): boolean {
  return player.primaryPosition === slot;
}

/**
 * Map a player to their simulation strength using tier floors, then fine-tune
 * with their exact tradeValue inside that tier.
 */
export function getPlayerSimulationStrength(player: TradePlayer): number {
  const tier = getPlayerTier(player);
  const base = TIER_BASE[tier];
  const [low, high] = TIER_BOUNDS[tier];
  const span = Math.max(1, high - low);
  const progress = clamp((player.tradeValue - low) / span, 0, 1);
  // Stay near the tier floor, with a small lift for strong ratings inside the band.
  const nextFloor =
    tier === 'GOAT'
      ? 110
      : tier === 'S'
        ? 108
        : TIER_BASE[
            tier === 'F'
              ? 'D'
              : tier === 'D'
                ? 'C'
                : tier === 'C'
                  ? 'B'
                  : tier === 'B'
                    ? 'A'
                    : 'S'
          ];
  const ceiling =
    tier === 'GOAT'
      ? 110
      : Math.min(nextFloor - 0.5, base + (nextFloor - base) * 0.92);
  return base + (ceiling - base) * progress;
}

export function getSeasonReaction(wins: number): SeasonReaction {
  if (wins >= 64) return 'Championship Favorite';
  if (wins >= 55) return 'Contender';
  if (wins >= 45) return 'Playoff Team';
  if (wins >= 36) return 'Play-In Team';
  return 'Lottery Team';
}

export function analyzeLineup(players: TradePlayer[]): SeasonAnalysis {
  if (players.length === 0) {
    return {
      offense: 30,
      defense: 30,
      shooting: 30,
      playmaking: 30,
      rebounding: 30,
      positionalBalance: 30,
      starPower: 20,
      chemistry: 25,
      lineupScore: 28,
      overall: 28,
      benchLimitation: 0,
    };
  }

  const strengths = players.map(getPlayerSimulationStrength);
  const individualQuality = strengths.reduce((sum, value) => sum + value, 0) / strengths.length;
  const tiers = players.map(getPlayerTier);
  const sCount = tiers.filter((tier) => tier === 'S').length;
  const aCount = tiers.filter((tier) => tier === 'A').length;

  const exactFits = players.reduce((score, player, index) => {
    const slot = LINEUP_POSITIONS[index] ?? player.primaryPosition;
    return score + (slot === player.primaryPosition ? 1 : 0);
  }, 0);
  const softFits = players.reduce((score, player, index) => {
    const slot = LINEUP_POSITIONS[index] ?? player.primaryPosition;
    return score + (isReasonableFit(slot, player) ? 1 : 0);
  }, 0);
  const duplicatePenalty = players.reduce((score, player, index) => {
    const duplicates = players.filter(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.primaryPosition === player.primaryPosition &&
        other.id !== player.id,
    ).length;
    return score + duplicates;
  }, 0);

  const positionalBalance = roundScore(
    38 + exactFits * 10 + softFits * 3 - duplicatePenalty * 4.5,
  );

  const offense = roundScore(
    individualQuality * 0.55 +
      players.reduce((sum, player) => sum + player.stats.ppg, 0) * 0.28 +
      8,
  );
  const defense = roundScore(
    individualQuality * 0.45 +
      players.reduce((sum, player) => sum + player.stats.spg + player.stats.bpg, 0) * 4.8 +
      12,
  );
  const shooting = roundScore(
    individualQuality * 0.42 +
      players.filter((player) => player.stats.ppg >= 16).length * 5.5 +
      players.filter((player) =>
        player.primaryPosition === 'PG' ||
        player.primaryPosition === 'SG' ||
        player.primaryPosition === 'SF',
      ).length *
        3.5 +
      10,
  );
  const playmaking = roundScore(
    individualQuality * 0.4 +
      players.reduce((sum, player) => sum + player.stats.apg, 0) * 2.1 +
      12,
  );
  const rebounding = roundScore(
    individualQuality * 0.38 +
      players.reduce((sum, player) => sum + player.stats.rpg, 0) * 1.55 +
      14,
  );

  let chemistry = 52;
  chemistry += Math.min(12, shooting * 0.08 + playmaking * 0.08);
  chemistry += exactFits * 3;
  if (shooting < 55) chemistry -= 8;
  if (defense < 55) chemistry -= 7;
  if (duplicatePenalty > 0) chemistry -= duplicatePenalty * 3;
  if (sCount + aCount >= 2 && playmaking >= 65) chemistry += 5;
  chemistry = roundScore(chemistry);

  const starPower = roundScore(
    28 +
      sCount * 14 +
      aCount * 7 +
      Math.max(...strengths) * 0.28,
  );

  // Controlled modifiers — tiers still dominate through individualQuality.
  let modifiers = 0;
  if (exactFits === 5) modifiers += 2.5;
  if (duplicatePenalty > 0) modifiers -= duplicatePenalty * 1.6;
  if (shooting < 52) modifiers -= 2.2;
  if (defense < 52) modifiers -= 2.0;
  if (positionalBalance < 55) modifiers -= 1.8;
  if (sCount === 5 && exactFits === 5) modifiers += 3.5;

  const lineupScore = roundScore(
    individualQuality * 0.7 +
      positionalBalance * 0.15 +
      chemistry * 0.1 +
      starPower * 0.05 +
      modifiers,
  );

  return {
    offense,
    defense,
    shooting,
    playmaking,
    rebounding,
    positionalBalance,
    starPower,
    chemistry,
    lineupScore,
    overall: lineupScore,
    benchLimitation: 0,
  };
}

function generateOpponentStrength(): number {
  const roll = Math.random();
  // Weighted league distribution: mostly average, fewer weak/elite.
  if (roll < 0.14) return 42 + Math.random() * 13; // weak 42-55
  if (roll < 0.62) return 55 + Math.random() * 15; // average 55-70
  if (roll < 0.86) return 70 + Math.random() * 12; // playoff 70-82
  return 82 + Math.random() * 13; // elite 82-95
}

function simulateGame(lineupScore: number, gameIndex: number): SeasonGameResult {
  const opponent = generateOpponentStrength();
  const homeBoost = gameIndex % 2 === 0 ? 2.4 : -2.4;
  // Controlled variance preserves upsets without erasing lineup quality.
  const variance = (Math.random() + Math.random() + Math.random() - 1.5) * 7.5;
  const margin = lineupScore + homeBoost + variance - opponent;
  return margin >= 0 ? 'W' : 'L';
}

/**
 * Generate one complete 82-game season by simulating each matchup individually.
 * No win caps — an authentic 82–0 is possible when every game is won.
 */
export function simulateLineupSeason(players: TradePlayer[]): SeasonRecord {
  const analysis = analyzeLineup(players);
  const games: SeasonGameResult[] = [];

  for (let gameIndex = 0; gameIndex < 82; gameIndex += 1) {
    games.push(simulateGame(analysis.lineupScore, gameIndex));
  }

  const wins = games.filter((result) => result === 'W').length;
  const expectedWins = Math.round(
    clamp(analysis.lineupScore * 0.78 - 8, 8, 82),
  );

  return {
    wins,
    losses: 82 - wins,
    expectedWins,
    analysis,
    games,
  };
}
