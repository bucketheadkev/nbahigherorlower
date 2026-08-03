import type { TradePlayer, TeamInfo } from './types';
import { TEAMS } from './teams';
import { getPlayersByTeam, getTeamTradePool } from './rosters';
import { getTeamNeedLabels, getTeamNeeds } from './teamNeeds';
import { getMatchedNeeds, needFitBonus } from './strengths';
import { getPlayerTier, isSTier, type PlayerTier } from './tiers';
import { hasHiddenEliteOffer } from './hiddenEliteOffer';
import { hasHiddenValue } from './hiddenValue';

export type RiskLabel =
  | 'Guaranteed'
  | 'Strong Chance'
  | 'Risky'
  | 'Long Shot'
  | 'Extreme Risk';

export type RandomFn = () => number;

export interface NegotiationSession {
  team: TeamInfo;
  needs: string[];
  candidates: TradePlayer[];
  index: number;
  acceptanceChance: number;
}

export interface NegotiationOfferView {
  team: TeamInfo;
  needs: string[];
  offered: TradePlayer;
  acceptanceChance: number;
  negotiationLevel: number;
  maxLevel: number;
  canAskForMore: boolean;
  riskLabel: RiskLabel;
  riskMessage: string;
}

const MIN_CHANCE = 5;
const MAX_NEGOTIATION_STEPS = 5;
const MEANINGFUL_VALUE_STEP = 4;
const RECENT_TEAM_LIMIT = 4;
const RECENT_PLAYER_LIMIT = 8;

const BASE_CHANCE_BY_LEVEL = [100, 82, 58, 34, 16] as const;

function clampChance(value: number): number {
  return Math.max(MIN_CHANCE, Math.min(100, Math.round(value)));
}

function tierRank(tier: PlayerTier): number {
  return { F: 0, D: 1, C: 2, B: 3, A: 4, S: 5, GOAT: 6 }[tier];
}

function desirabilityScore(player: TradePlayer): number {
  let score = player.tradeValue;
  if (player.hiddenValue) score += 3;
  if (player.hiddenEliteOffer) score += 4;
  if (player.isFranchise) score += 2;
  return score;
}

export function getRiskLabel(chance: number): RiskLabel {
  if (chance >= 100) return 'Guaranteed';
  if (chance >= 75) return 'Strong Chance';
  if (chance >= 50) return 'Risky';
  if (chance >= 25) return 'Long Shot';
  return 'Extreme Risk';
}

export function getRiskMessage(level: number, canAskForMore: boolean): string {
  if (level <= 0) {
    return 'This deal is guaranteed. You can accept it or ask for a better player.';
  }
  if (!canAskForMore) {
    return 'Final offer. This is an extreme risk.';
  }
  if (level === 1) {
    return 'The team may walk away if you keep pushing.';
  }
  if (level >= 3) {
    return 'You are asking for significantly more value.';
  }
  return 'You are asking for significantly more value.';
}

/**
 * Fit modifier: roughly ±5 to ±15 based on need match strength.
 */
function fitChanceModifier(offered: TradePlayer, teamId: string): number {
  const needs = getTeamNeeds(teamId);
  const matched = getMatchedNeeds(offered, needs);
  const bonus = needFitBonus(offered, needs);
  if (bonus >= 14) return 12;
  if (bonus >= 9) return 7;
  if (matched.length === 0) return -6;
  return 0;
}

function valueGapPenalty(current: TradePlayer, target: TradePlayer): number {
  const gap = target.tradeValue - current.tradeValue;
  if (gap <= 4) return 0;
  if (gap <= 10) return Math.round((gap - 4) * 1.5);
  if (gap <= 20) return 9 + Math.round((gap - 10) * 2.2);
  return 31 + Math.round((gap - 20) * 2.8);
}

function tierJumpPenalty(current: TradePlayer, target: TradePlayer): number {
  const jump = tierRank(getPlayerTier(target)) - tierRank(getPlayerTier(current));
  if (jump <= 0) return 0;
  if (jump === 1) return 4;
  if (jump === 2) return 12;
  if (jump === 3) return 22;
  return 32;
}

function hiddenBonus(current: TradePlayer, target: TradePlayer): number {
  let bonus = 0;
  if (hasHiddenValue(current) && getPlayerTier(target) === 'A') bonus += 10;
  if (hasHiddenEliteOffer(current) && isSTier(target)) bonus += 12;
  return bonus;
}

export function calculateTradeChance(
  current: TradePlayer,
  offered: TradePlayer,
  teamId: string,
  negotiationLevel: number,
): number {
  if (negotiationLevel <= 0) return 100;

  const level = Math.min(negotiationLevel, BASE_CHANCE_BY_LEVEL.length - 1);
  let chance = BASE_CHANCE_BY_LEVEL[level] ?? 16;

  chance += fitChanceModifier(current, teamId);
  chance -= valueGapPenalty(current, offered);
  chance -= tierJumpPenalty(current, offered);
  chance += hiddenBonus(current, offered);

  if (offered.isFranchise) chance -= 8;
  if (isSTier(offered) && !isSTier(current)) chance -= 6;

  return clampChance(chance);
}

function pickNextCandidate(
  remaining: TradePlayer[],
  previous: TradePlayer,
  minStep: number,
): TradePlayer | undefined {
  const prevScore = desirabilityScore(previous);
  return remaining.find((player) => {
    const score = desirabilityScore(player);
    const valueGain = player.tradeValue - previous.tradeValue;
    const tierGain = tierRank(getPlayerTier(player)) - tierRank(getPlayerTier(previous));
    return score > prevScore && (valueGain >= minStep || tierGain >= 1 || player.hiddenEliteOffer || player.hiddenValue);
  });
}

/**
 * Build an ascending negotiation ladder for one opposing team.
 * Level 0 is a safe (equal / slight upgrade) offer; later steps are meaningful upgrades.
 */
export function getNegotiationCandidates(
  current: TradePlayer,
  teamId: string,
  recentOfferedIds: Set<string> = new Set(),
): TradePlayer[] {
  const roster = getPlayersByTeam(teamId);
  const poolSource = getTeamTradePool(teamId);
  const merged = new Map<string, TradePlayer>();
  for (const player of [...poolSource, ...roster]) {
    if (player.id === current.id) continue;
    if (recentOfferedIds.has(player.id)) continue;
    merged.set(player.id, player);
  }

  const pool = [...merged.values()].sort((a, b) => desirabilityScore(a) - desirabilityScore(b));
  if (pool.length === 0) return [];

  const currentScore = desirabilityScore(current);
  const isSuperstarRun = isSTier(current);

  let safePool = pool.filter((player) => {
    const score = desirabilityScore(player);
    if (isSuperstarRun) {
      return score >= currentScore - 4 && score <= currentScore + 8;
    }
    return (
      player.tradeValue >= current.tradeValue - 1 &&
      player.tradeValue <= current.tradeValue + 14 &&
      score >= currentScore - 2
    );
  });

  if (safePool.length === 0) {
    safePool = pool.filter((player) => desirabilityScore(player) >= currentScore - 2).slice(0, 6);
  }
  if (safePool.length === 0) {
    safePool = [pool[pool.length - 1]!];
  }

  // Prefer the safest slight upgrade (lowest desirability among safe upgrades).
  const upgrades = safePool.filter((p) => desirabilityScore(p) >= currentScore);
  const initial =
    upgrades.sort((a, b) => desirabilityScore(a) - desirabilityScore(b))[0] ??
    safePool.sort((a, b) => Math.abs(desirabilityScore(a) - currentScore) - Math.abs(desirabilityScore(b) - currentScore))[0]!;

  const ladder: TradePlayer[] = [initial];
  let cursor = initial;
  const remaining = pool
    .filter((p) => p.id !== initial.id && desirabilityScore(p) > desirabilityScore(initial))
    .sort((a, b) => desirabilityScore(a) - desirabilityScore(b));

  while (ladder.length < MAX_NEGOTIATION_STEPS && remaining.length > 0) {
    const next = pickNextCandidate(remaining, cursor, MEANINGFUL_VALUE_STEP);
    if (!next) break;
    ladder.push(next);
    cursor = next;
    const idx = remaining.findIndex((p) => p.id === next.id);
    if (idx >= 0) remaining.splice(idx, 1);
    // Drop anyone not better than what we just took.
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (desirabilityScore(remaining[i]!) <= desirabilityScore(cursor)) {
        remaining.splice(i, 1);
      }
    }
  }

  return ladder;
}

export function createNegotiationSession(
  current: TradePlayer,
  excludeTeamId: string,
  usedTeamIds: Set<string>,
  recentTeamIds: string[] = [],
  recentOfferedIds: Set<string> = new Set(),
): NegotiationSession {
  const recentSet = new Set(recentTeamIds);
  const preferred = TEAMS.filter(
    (t) => t.id !== excludeTeamId && !usedTeamIds.has(t.id) && !recentSet.has(t.id),
  );
  const fallback = TEAMS.filter((t) => t.id !== excludeTeamId && !usedTeamIds.has(t.id));
  const lastResort = TEAMS.filter((t) => t.id !== excludeTeamId);
  const pools = [preferred, fallback, lastResort].filter((p) => p.length > 0);

  for (const pool of pools) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    for (const team of shuffled) {
      const candidates = getNegotiationCandidates(current, team.id, recentOfferedIds);
      if (candidates.length === 0) continue;
      return {
        team,
        needs: getTeamNeedLabels(team.id),
        candidates,
        index: 0,
        acceptanceChance: calculateTradeChance(current, candidates[0]!, team.id, 0),
      };
    }
  }

  // Absolute fallback: any team with any player better/equal.
  for (const team of TEAMS) {
    if (team.id === excludeTeamId) continue;
    const candidates = getNegotiationCandidates(current, team.id, new Set());
    if (candidates.length === 0) continue;
    return {
      team,
      needs: getTeamNeedLabels(team.id),
      candidates,
      index: 0,
      acceptanceChance: calculateTradeChance(current, candidates[0]!, team.id, 0),
    };
  }

  throw new Error('Could not create a negotiation offer.');
}

export function getNegotiationOfferView(
  session: NegotiationSession,
  current: TradePlayer,
): NegotiationOfferView {
  const offered = session.candidates[session.index];
  if (!offered) {
    throw new Error('Negotiation offer is missing.');
  }
  const canAskForMore = session.index < session.candidates.length - 1;
  const chance = calculateTradeChance(current, offered, session.team.id, session.index);
  return {
    team: session.team,
    needs: session.needs,
    offered,
    acceptanceChance: chance,
    negotiationLevel: session.index,
    maxLevel: Math.max(0, session.candidates.length - 1),
    canAskForMore,
    riskLabel: getRiskLabel(chance),
    riskMessage: getRiskMessage(session.index, canAskForMore),
  };
}

export function askForMore(
  session: NegotiationSession,
  current: TradePlayer,
): NegotiationSession | null {
  if (session.index >= session.candidates.length - 1) return null;
  const nextIndex = session.index + 1;
  const nextPlayer = session.candidates[nextIndex];
  if (!nextPlayer) return null;
  return {
    ...session,
    index: nextIndex,
    acceptanceChance: calculateTradeChance(current, nextPlayer, session.team.id, nextIndex),
  };
}

export function resolveTradeAttempt(
  chance: number,
  random: RandomFn = Math.random,
): { success: boolean; roll: number } {
  const clamped = clampChance(chance);
  const roll = Math.floor(random() * 100) + 1; // 1..100
  return { success: roll <= clamped, roll };
}

export function pushRecentId(list: string[], id: string, limit: number): string[] {
  const next = [id, ...list.filter((item) => item !== id)];
  return next.slice(0, limit);
}

export { RECENT_TEAM_LIMIT, RECENT_PLAYER_LIMIT, MIN_CHANCE };
