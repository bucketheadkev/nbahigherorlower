import type { TeamPreferences, TradeOutcome, TradePlayer, TradeRound, StartingTier } from './types';
import { getTeam, getTeamPreferences, TEAMS } from './teams';
import { getTeamTradePool, ALL_PLAYERS } from './rosters';
import { getTeamNeedLabels, getTeamNeeds } from './teamNeeds';
import {
  getMatchedNeeds,
  getPrimaryStrength,
  getUnmetNeed,
  needFitBonus,
  NEED_LABELS,
} from './strengths';
import { getHiddenEliteOfferMarginBonus } from './hiddenEliteOffer';
import { getHiddenValueMarginBonus } from './hiddenValue';

export interface TradeEvaluation {
  outcome: TradeOutcome;
  margin: number;
  matchedNeedLabels: string[];
  primaryStrength: string;
  unmetNeedLabel?: string;
  isFranchise: boolean;
}

type OpportunityTier = 'unlikely' | 'difficult' | 'realistic' | 'excellent';

function preferenceBonus(player: TradePlayer, prefs: TeamPreferences): number {
  const { stats, age } = player;
  let bonus = 0;

  if (age >= 27) bonus += prefs.winNow * (stats.ppg / 28) * 10;
  if (age <= 24) bonus += prefs.youth * ((25 - age) / 6) * 12;
  bonus += prefs.defense * (stats.spg + stats.bpg) * 2.8;
  bonus += prefs.shooting * (stats.ppg / 26) * 7;
  bonus += prefs.upside * (age <= 23 && stats.ppg >= 10 ? 10 : age <= 22 ? 6 : 0);

  return bonus;
}

function outgoingMultiplier(player: TradePlayer): number {
  if (player.isFranchise) return 1.38;
  if (player.tradeValue >= 92) return 1.28;
  if (player.tradeValue >= 82) return 1.18;
  if (player.tradeValue >= 72) return 1.08;
  return 1.0;
}

export function computeTradeMargin(
  offered: TradePlayer,
  requested: TradePlayer,
  teamId: string,
): number {
  const prefs = getTeamPreferences(teamId);
  const needs = getTeamNeeds(teamId);
  const incoming =
    offered.tradeValue * 1.05 +
    preferenceBonus(offered, prefs) +
    needFitBonus(offered, needs);
  const outgoing = requested.tradeValue * outgoingMultiplier(requested);
  const tolerance = requested.isFranchise ? 0 : 0.06;
  const hiddenEliteBonus = getHiddenEliteOfferMarginBonus(offered, requested);
  const hiddenValueBonus = getHiddenValueMarginBonus(offered, requested);
  return incoming - outgoing * (1 - tolerance) + hiddenEliteBonus + hiddenValueBonus;
}

export function evaluateTrade(
  offered: TradePlayer,
  requested: TradePlayer,
  teamId: string,
): TradeEvaluation {
  const needs = getTeamNeeds(teamId);
  const margin = computeTradeMargin(offered, requested, teamId);
  const matched = getMatchedNeeds(offered, needs);
  const matchedNeedLabels = matched.map((id) => NEED_LABELS[id]);
  const unmet = getUnmetNeed(needs, matched);

  return {
    outcome: margin >= 0 ? 'accepted' : 'rejected',
    margin,
    matchedNeedLabels,
    primaryStrength: getPrimaryStrength(offered),
    unmetNeedLabel: unmet ? NEED_LABELS[unmet] : undefined,
    isFranchise: !!requested.isFranchise,
  };
}

function classifyTier(margin: number, requested: TradePlayer): OpportunityTier {
  if (requested.isFranchise || margin < -14) return 'unlikely';
  if (margin < -4) return 'difficult';
  if (margin < 6) return 'realistic';
  return 'excellent';
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickFromTier(
  tier: OpportunityTier,
  buckets: Record<OpportunityTier, TradePlayer[]>,
  count: number,
  used: Set<string>,
): TradePlayer[] {
  const order: OpportunityTier[] =
    tier === 'unlikely'
      ? ['unlikely', 'difficult', 'realistic', 'excellent']
      : tier === 'difficult'
        ? ['difficult', 'realistic', 'unlikely', 'excellent']
        : tier === 'realistic'
          ? ['realistic', 'difficult', 'excellent', 'unlikely']
          : ['excellent', 'realistic', 'difficult', 'unlikely'];

  const picked: TradePlayer[] = [];
  for (const source of order) {
    for (const player of buckets[source]) {
      if (picked.length >= count) break;
      if (used.has(player.id)) continue;
      picked.push(player);
      used.add(player.id);
    }
    if (picked.length >= count) break;
  }
  return picked;
}

function pickBalancedOptions(
  pool: TradePlayer[],
  offered: TradePlayer,
  teamId: string,
): TradePlayer[] {
  const buckets: Record<OpportunityTier, TradePlayer[]> = {
    unlikely: [],
    difficult: [],
    realistic: [],
    excellent: [],
  };

  for (const player of pool) {
    const margin = computeTradeMargin(offered, player, teamId);
    const tier = classifyTier(margin, player);
    buckets[tier].push(player);
  }

  const used = new Set<string>();
  const selected = [
    ...pickFromTier('unlikely', buckets, 2, used),
    ...pickFromTier('difficult', buckets, 3, used),
    ...pickFromTier('realistic', buckets, 3, used),
    ...pickFromTier('excellent', buckets, 2, used),
  ];

  if (selected.length < Math.min(10, pool.length)) {
    const remaining = pool.filter((p) => !used.has(p.id));
    selected.push(...shuffle(remaining).slice(0, Math.min(10, pool.length) - selected.length));
  }

  return shuffle(selected.slice(0, 10));
}

const TIER_VALUE_RANGES: Record<StartingTier, [number, number]> = {
  F: [0, 27],
  D: [28, 44],
  C: [45, 61],
  B: [62, 77],
};

export function getStartersForTier(tier: StartingTier): TradePlayer[] {
  const [min, max] = TIER_VALUE_RANGES[tier];
  return ALL_PLAYERS.filter((pl) => pl.tradeValue >= min && pl.tradeValue <= max);
}

export function createStartingPlayer(tier: StartingTier = 'F'): TradePlayer {
  const pool = getStartersForTier(tier);
  if (!pool.length) {
    throw new Error(`No players available for ${tier} tier starter.`);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function createRound(
  excludeTeamId: string,
  usedTeamIds: Set<string>,
  currentPlayer: TradePlayer,
): TradeRound {
  const available = TEAMS.filter((t) => t.id !== excludeTeamId && !usedTeamIds.has(t.id));
  const pool = available.length > 0 ? available : TEAMS.filter((t) => t.id !== excludeTeamId);
  const shuffled = shuffle([...pool]);

  for (const team of shuffled) {
    const tradePool = getTeamTradePool(team.id);
    if (!tradePool.length) continue;

    const options = pickBalancedOptions(tradePool, currentPlayer, team.id);
    if (options.length > 0) {
      return {
        team,
        needs: getTeamNeedLabels(team.id),
        options,
      };
    }
  }

  throw new Error('Could not load trade options.');
}

export function isElitePlayer(player: TradePlayer): boolean {
  return player.tradeValue >= 92;
}

export { getPrimaryStrength };
