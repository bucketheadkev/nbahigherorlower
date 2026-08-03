/**
 * Head-to-head matchup engine: AI opponent generation + single-game resolution.
 * Reuses lineup strength analysis; does not award trophies (caller applies once).
 */

import { getEligibleForSlot } from './lineupEligibility';
import { analyzeLineup, getPlayerSimulationStrength } from './lineupSeason';
import {
  getRankDifficulty,
  getRankForTrophies,
  getRankIndex,
  type RankId,
} from './ranks';
import { ALL_PLAYERS, getPlayerById } from './rosters';
import { LINEUP_POSITIONS } from './startingLineup';
import { getPlayerTier, isATier, isSTier, type PlayerTier } from './tiers';
import type { Position, TradePlayer } from './types';

export interface LineupSlotPlayer {
  slot: Position;
  player: TradePlayer;
}

export interface MatchScoreline {
  playerScore: number;
  opponentScore: number;
}

export interface PositionalBattleResult {
  slot: Position;
  userWon: boolean;
}

export interface HeadToHeadResult {
  won: boolean;
  score: MatchScoreline;
  /** Positive = player advantage before randomness. */
  strengthEdge: number;
  playerPower: number;
  opponentPower: number;
  /** Exactly five positional outcomes, locked when the match resolves. */
  slotResults: PositionalBattleResult[];
  userSurviving: number;
  opponentSurviving: number;
  sweep: boolean;
}

export interface GeneratedMatchup {
  matchId: string;
  opponent: LineupSlotPlayer[];
  result: HeadToHeadResult;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createMatchId(): string {
  return `match_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function lineupPower(players: TradePlayer[]): number {
  return analyzeLineup(players).lineupScore;
}

const TIER_RANK: Record<PlayerTier, number> = {
  F: 0,
  D: 1,
  C: 2,
  B: 3,
  A: 4,
  S: 5,
  GOAT: 6,
};

function pickWeighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return items[0]!;
  let ticket = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    ticket -= Math.max(0, weights[i]!);
    if (ticket <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function pickForSlot(
  slot: Position,
  usedIds: Set<string>,
  targetStrength: number,
  options: {
    preferElite: boolean;
    preferWeak: boolean;
    rankId: RankId;
  },
): TradePlayer {
  const pool = getEligibleForSlot(slot, [...ALL_PLAYERS], usedIds);
  if (pool.length === 0) {
    throw new Error(`No eligible players for slot ${slot}`);
  }

  const scored = pool.map((player) => {
    const strength = getPlayerSimulationStrength(player);
    const tier = getPlayerTier(player);
    let distance = Math.abs(strength - targetStrength);

    if (options.preferWeak) {
      distance += TIER_RANK[tier] * 3.5;
      if (isSTier(player) || isATier(player)) distance += 18;
      distance += Math.max(0, strength - (targetStrength - 8)) * 0.8;
    } else if (options.preferElite) {
      distance -= TIER_RANK[tier] * 2.2;
      if (isSTier(player)) distance -= 6;
      else if (isATier(player)) distance -= 3;
    } else {
      // Softly discourage elites at low ranks even when not preferElite.
      if (options.rankId === 'iron' && (isSTier(player) || isATier(player))) {
        distance += 10;
      } else if (options.rankId === 'bronze' && isSTier(player)) {
        distance += 6;
      }
    }

    const noise = Math.random() * 3.5;
    return { player, distance: distance + noise, strength, tier };
  });

  scored.sort((a, b) => a.distance - b.distance);
  const shortlist = scored.slice(0, Math.min(10, scored.length));
  const weights = shortlist.map((_, index) => shortlist.length - index);
  return pickWeighted(
    shortlist.map((entry) => entry.player),
    weights,
  );
}

/**
 * Build an AI lineup scaled to the user's current rank.
 * Never rolls a fixed W/L — only sets opponent quality; resolveHeadToHead decides.
 */
export function generateOpponentLineup(
  userLineup: LineupSlotPlayer[],
  rankId: RankId,
): LineupSlotPlayer[] {
  const difficulty = getRankDifficulty(rankId);
  const userPlayers = userLineup.map(({ player }) => player);
  const userAnalysis = analyzeLineup(userPlayers);
  const userPower = userAnalysis.lineupScore;

  const swing = (Math.random() * 2 - 1) * difficulty.powerVariance;
  // Keep opponents near the user's real strength — rank only shifts the bias.
  const maxAboveUser = rankId === 'ace' ? 7 : rankId === 'diamond' ? 5 : 3;
  const baseTarget = clamp(
    userPower - difficulty.powerOffset + swing,
    Math.max(difficulty.strengthFloor, userPower - 16),
    Math.min(difficulty.strengthCeiling, userPower + maxAboveUser),
  );

  const usedIds = new Set(userPlayers.map((player) => player.id));
  const weakSlot =
    Math.random() < difficulty.weakSpotChance
      ? LINEUP_POSITIONS[Math.floor(Math.random() * LINEUP_POSITIONS.length)]!
      : null;

  const opponent: LineupSlotPlayer[] = [];
  for (const slot of LINEUP_POSITIONS) {
    const preferWeak = weakSlot === slot;
    const preferElite =
      !preferWeak && Math.random() < difficulty.eliteBiasChance;

    let slotTarget = baseTarget + (Math.random() * 2 - 1) * difficulty.slotNoise;

    if (preferWeak) {
      slotTarget -= 8 + Math.random() * 7;
    } else if (preferElite) {
      slotTarget += 3 + Math.random() * 5;
    }

    // Higher ranks: pull toward better balance (less wild lows), without stacking elites.
    if (getRankIndex(rankId) >= 3) {
      slotTarget = Math.max(slotTarget, baseTarget - 5);
    }

    slotTarget = clamp(
      slotTarget,
      difficulty.strengthFloor,
      Math.min(difficulty.strengthCeiling, baseTarget + (preferElite ? 8 : 5)),
    );

    const player = pickForSlot(slot, usedIds, slotTarget, {
      preferElite,
      preferWeak,
      rankId,
    });
    usedIds.add(player.id);
    opponent.push({ slot, player });
  }

  return tuneOpponentTowardTarget(opponent, usedIds, baseTarget, rankId);
}

/** Nudge a generated five toward the rank target without fixed W/L rolls. */
function tuneOpponentTowardTarget(
  initial: LineupSlotPlayer[],
  usedIds: Set<string>,
  targetPower: number,
  rankId: RankId,
): LineupSlotPlayer[] {
  const opponent = [...initial];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const power = lineupPower(opponent.map(({ player }) => player));
    const delta = power - targetPower;
    if (Math.abs(delta) <= 3.2) break;

    const strengths = opponent.map(({ player }) => getPlayerSimulationStrength(player));
    const index =
      delta > 0
        ? strengths.indexOf(Math.max(...strengths))
        : strengths.indexOf(Math.min(...strengths));
    if (index < 0) break;

    const slot = opponent[index]!.slot;
    usedIds.delete(opponent[index]!.player.id);
    const slotTarget =
      delta > 0
        ? targetPower - 3 - Math.random() * 4
        : targetPower + 2 + Math.random() * 3;
    const replacement = pickForSlot(slot, usedIds, slotTarget, {
      preferElite: delta < 0 && getRankIndex(rankId) >= 3,
      preferWeak: delta > 0 && getRankIndex(rankId) <= 1,
      rankId,
    });
    usedIds.add(replacement.id);
    opponent[index] = { slot, player: replacement };
  }
  return opponent;
}

function positionalRoundEdge(
  mine: TradePlayer,
  theirs: TradePlayer,
  slot: Position,
  chemistryDelta: number,
  rankId: RankId,
): number {
  const myStrength = getPlayerSimulationStrength(mine);
  const theirStrength = getPlayerSimulationStrength(theirs);
  let edge = (myStrength - theirStrength) * 1.05;

  const myTier = getPlayerTier(mine);
  const theirTier = getPlayerTier(theirs);
  edge += (TIER_RANK[myTier] - TIER_RANK[theirTier]) * 1.35;
  if (myTier === 'S' && theirTier !== 'S') edge += 2.2;
  if (theirTier === 'S' && myTier !== 'S') edge -= 2.2;

  // Soft position-skill flavor without exposing tiers in UI.
  if (slot === 'PG' || slot === 'SG') {
    edge += (mine.tradeValue - theirs.tradeValue) * 0.012;
  } else if (slot === 'C' || slot === 'PF') {
    edge += (myStrength - theirStrength) * 0.08;
  }

  edge += chemistryDelta * 0.028;

  // Higher ranks: slightly tighter contests (less extreme edges).
  const rankIndex = getRankIndex(rankId);
  if (rankIndex >= 3) edge *= 0.92;

  // Controlled randomness — stronger favored, upsets possible.
  const variance = (Math.random() + Math.random() + Math.random() - 1.5) * 9.5;
  return edge + variance;
}

/**
 * Resolve five positional battles once. Surviving-card count decides the match.
 * Animations must display these locked outcomes — never re-roll.
 */
export function resolveHeadToHead(
  userLineup: LineupSlotPlayer[],
  opponentLineup: LineupSlotPlayer[],
  rankId?: RankId,
): HeadToHeadResult {
  const resolvedRank = rankId ?? 'iron';
  const userPlayers = userLineup.map(({ player }) => player);
  const oppPlayers = opponentLineup.map(({ player }) => player);
  const userAnalysis = analyzeLineup(userPlayers);
  const oppAnalysis = analyzeLineup(oppPlayers);
  const chemistryDelta = userAnalysis.chemistry - oppAnalysis.chemistry;

  const slotResults: PositionalBattleResult[] = [];
  let userSurviving = 0;
  let opponentSurviving = 0;
  let strengthEdge = 0;

  for (const slot of LINEUP_POSITIONS) {
    const mine = userLineup.find((entry) => entry.slot === slot)?.player;
    const theirs = opponentLineup.find((entry) => entry.slot === slot)?.player;
    if (!mine || !theirs) {
      throw new Error(`Missing lineup player for slot ${slot}`);
    }

    const edge = positionalRoundEdge(mine, theirs, slot, chemistryDelta, resolvedRank);
    strengthEdge += edge;
    const userWon = edge >= 0;
    if (userWon) userSurviving += 1;
    else opponentSurviving += 1;
    slotResults.push({ slot, userWon });
  }

  // Five odd battles cannot tie on surviving counts.
  const won = userSurviving > opponentSurviving;
  const sweep = won && userSurviving === 5 && opponentSurviving === 0;

  return {
    won,
    score: {
      playerScore: userSurviving,
      opponentScore: opponentSurviving,
    },
    strengthEdge,
    playerPower: userAnalysis.lineupScore,
    opponentPower: oppAnalysis.lineupScore,
    slotResults,
    userSurviving,
    opponentSurviving,
    sweep,
  };
}

export function createHeadToHeadMatchup(
  userLineup: LineupSlotPlayer[],
  trophiesOrRank: number | RankId,
): GeneratedMatchup {
  const rankId =
    typeof trophiesOrRank === 'string'
      ? trophiesOrRank
      : getRankForTrophies(trophiesOrRank).id;
  const opponent = generateOpponentLineup(userLineup, rankId);
  const result = resolveHeadToHead(userLineup, opponent, rankId);
  return {
    matchId: createMatchId(),
    opponent,
    result,
  };
}

export function hydrateOpponentFromIds(
  ids: Record<Position, string>,
): LineupSlotPlayer[] | null {
  const lineup: LineupSlotPlayer[] = [];
  for (const slot of LINEUP_POSITIONS) {
    const player = getPlayerById(ids[slot]);
    if (!player || player.primaryPosition !== slot) return null;
    lineup.push({ slot, player });
  }
  return lineup;
}

export function opponentIdsFromLineup(
  lineup: LineupSlotPlayer[],
): Record<Position, string> {
  return {
    PG: lineup.find((e) => e.slot === 'PG')!.player.id,
    SG: lineup.find((e) => e.slot === 'SG')!.player.id,
    SF: lineup.find((e) => e.slot === 'SF')!.player.id,
    PF: lineup.find((e) => e.slot === 'PF')!.player.id,
    C: lineup.find((e) => e.slot === 'C')!.player.id,
  };
}
