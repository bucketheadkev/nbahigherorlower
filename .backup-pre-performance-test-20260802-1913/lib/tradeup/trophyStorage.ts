/**
 * Permanent trophy / rank progression — separate from round credits.
 * Each matchId may affect trophies at most once.
 */

import {
  clampTrophies,
  coerceRankId,
  getRankForTrophies,
  getRankIndex,
  TROPHY_LOSS_PENALTY,
  TROPHY_SWEEP_BONUS,
  TROPHY_WIN_REWARD,
  type RankId,
} from './ranks';

export type TrophyMatchKind = 'win' | 'loss';

export interface TrophyTransaction {
  id: string;
  kind: TrophyMatchKind;
  matchId: string;
  /** Net trophies applied (clamped). */
  delta: number;
  /** Base win/loss amount before clamp (signed). */
  baseDelta: number;
  /** Sweep bonus awarded (0 when not a perfect sweep). */
  sweepBonus: number;
  trophiesBefore: number;
  trophiesAfter: number;
  rankBefore: RankId;
  rankAfter: RankId;
  createdAt: string;
}

/** Saved when leaving a rank (promotion or demotion). */
export interface RankRecordHistoryEntry {
  id: string;
  kind: 'rank_record';
  matchId: string;
  rankId: RankId;
  wins: number;
  losses: number;
  reason: 'promotion' | 'demotion';
  createdAt: string;
}

export type TrophyHistoryEntry = TrophyTransaction | RankRecordHistoryEntry;

export interface TrophyProfile {
  trophies: number;
  rankId: RankId;
  highestRankId: RankId;
  /** Lifetime wins across all ranks. */
  wins: number;
  /** Lifetime losses across all ranks. */
  losses: number;
  /** Wins in the current rank only (resets on promote/demote). */
  rankWins: number;
  /** Losses in the current rank only (resets on promote/demote). */
  rankLosses: number;
  history: TrophyHistoryEntry[];
  /** Match IDs whose trophy delta has already been applied. */
  processedMatchIds: string[];
}

const STORAGE_KEY = 'tradeup_trophy_profile_v1';
const MAX_HISTORY = 120;
const MAX_PROCESSED_IDS = 250;

function emptyProfile(): TrophyProfile {
  const rank = getRankForTrophies(0);
  return {
    trophies: 0,
    rankId: rank.id,
    highestRankId: rank.id,
    wins: 0,
    losses: 0,
    rankWins: 0,
    rankLosses: 0,
    history: [],
    processedMatchIds: [],
  };
}

function isRankIdValue(value: unknown): value is RankId {
  return coerceRankId(value) !== null;
}

function isTransaction(value: unknown): value is TrophyTransaction {
  if (!value || typeof value !== 'object') return false;
  const tx = value as Partial<TrophyTransaction>;
  return (
    typeof tx.id === 'string' &&
    typeof tx.matchId === 'string' &&
    (tx.kind === 'win' || tx.kind === 'loss') &&
    typeof tx.delta === 'number' &&
    typeof tx.trophiesBefore === 'number' &&
    typeof tx.trophiesAfter === 'number' &&
    isRankIdValue(tx.rankBefore) &&
    isRankIdValue(tx.rankAfter) &&
    typeof tx.createdAt === 'string'
  );
}

function normalizeTransaction(value: TrophyTransaction): TrophyTransaction {
  return {
    ...value,
    rankBefore: coerceRankId(value.rankBefore) ?? 'iron',
    rankAfter: coerceRankId(value.rankAfter) ?? 'iron',
    baseDelta: typeof value.baseDelta === 'number' ? value.baseDelta : value.delta,
    sweepBonus: typeof value.sweepBonus === 'number' ? value.sweepBonus : 0,
  };
}

function isRankRecordEntry(value: unknown): value is RankRecordHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RankRecordHistoryEntry>;
  return (
    entry.kind === 'rank_record' &&
    typeof entry.id === 'string' &&
    typeof entry.matchId === 'string' &&
    isRankIdValue(entry.rankId) &&
    typeof entry.wins === 'number' &&
    typeof entry.losses === 'number' &&
    (entry.reason === 'promotion' || entry.reason === 'demotion') &&
    typeof entry.createdAt === 'string'
  );
}

function normalizeRankRecord(entry: RankRecordHistoryEntry): RankRecordHistoryEntry {
  return {
    ...entry,
    rankId: coerceRankId(entry.rankId) ?? 'iron',
  };
}

function isHistoryEntry(value: unknown): value is TrophyHistoryEntry {
  return isTransaction(value) || isRankRecordEntry(value);
}

function normalizeProfile(raw: Partial<TrophyProfile> | null | undefined): TrophyProfile {
  if (!raw || typeof raw !== 'object') return emptyProfile();

  const trophies = clampTrophies(typeof raw.trophies === 'number' ? raw.trophies : 0);
  const rank = getRankForTrophies(trophies);
  const highestCandidate = coerceRankId(raw.highestRankId) ?? rank.id;
  const highestRankId =
    getRankIndex(highestCandidate) >= getRankIndex(rank.id) ? highestCandidate : rank.id;

  const history = Array.isArray(raw.history)
    ? raw.history
        .filter(isHistoryEntry)
        .map((entry) =>
          isTransaction(entry) ? normalizeTransaction(entry) : normalizeRankRecord(entry),
        )
        .slice(0, MAX_HISTORY)
    : [];
  const processedMatchIds = Array.isArray(raw.processedMatchIds)
    ? raw.processedMatchIds.filter((id): id is string => typeof id === 'string').slice(0, MAX_PROCESSED_IDS)
    : [];

  const wins = typeof raw.wins === 'number' && raw.wins >= 0 ? Math.floor(raw.wins) : 0;
  const losses = typeof raw.losses === 'number' && raw.losses >= 0 ? Math.floor(raw.losses) : 0;

  return {
    trophies,
    rankId: rank.id,
    highestRankId,
    wins,
    losses,
    rankWins:
      typeof raw.rankWins === 'number' && raw.rankWins >= 0 ? Math.floor(raw.rankWins) : 0,
    rankLosses:
      typeof raw.rankLosses === 'number' && raw.rankLosses >= 0 ? Math.floor(raw.rankLosses) : 0,
    history,
    processedMatchIds,
  };
}

function persist(profile: TrophyProfile): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function getTrophyProfile(): TrophyProfile {
  if (typeof window === 'undefined') return emptyProfile();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProfile();
    const parsed = JSON.parse(raw) as Partial<TrophyProfile>;
    const normalized = normalizeProfile(parsed);
    // Keep derived rank in sync if thresholds change.
    if (normalized.rankId !== getRankForTrophies(normalized.trophies).id) {
      const synced = {
        ...normalized,
        rankId: getRankForTrophies(normalized.trophies).id,
      };
      persist(synced);
      return synced;
    }
    return normalized;
  } catch {
    return emptyProfile();
  }
}

export function hasProcessedMatch(matchId: string): boolean {
  if (!matchId) return false;
  return getTrophyProfile().processedMatchIds.includes(matchId);
}

export type TrophyApplyResult =
  | {
      applied: true;
      profile: TrophyProfile;
      transaction: TrophyTransaction;
      promoted: boolean;
      demoted: boolean;
      previousRankId: RankId;
      nextRankId: RankId;
      delta: number;
      /** Rank record after this match, before any promote/demote reset. */
      completedRankRecord: { wins: number; losses: number } | null;
    }
  | {
      applied: false;
      reason: 'already_processed' | 'invalid';
      profile: TrophyProfile;
    };

/**
 * Apply a finished matchup's trophy delta exactly once.
 * Safe against refresh, remount, double-click, and animation replay.
 *
 * Rank record rules:
 * - Match counts toward the rank the user was in before trophies applied.
 * - A sweep still counts as exactly one win.
 * - Promotion/demotion then saves that rank's record and resets to 0–0.
 */
export function applyMatchTrophyResult(
  matchId: string,
  won: boolean,
  options?: { sweep?: boolean },
): TrophyApplyResult {
  if (typeof window === 'undefined' || !matchId) {
    return { applied: false, reason: 'invalid', profile: getTrophyProfile() };
  }

  const current = getTrophyProfile();
  if (current.processedMatchIds.includes(matchId)) {
    return { applied: false, reason: 'already_processed', profile: current };
  }

  const previousRankId = current.rankId;
  const trophiesBefore = current.trophies;
  const sweep = Boolean(won && options?.sweep);
  const baseDelta = won ? TROPHY_WIN_REWARD : -TROPHY_LOSS_PENALTY;
  const sweepBonus = sweep ? TROPHY_SWEEP_BONUS : 0;
  const rawDelta = baseDelta + sweepBonus;
  const trophiesAfter = clampTrophies(trophiesBefore + rawDelta);
  const nextRank = getRankForTrophies(trophiesAfter);
  const nextRankId = nextRank.id;
  const promoted = getRankIndex(nextRankId) > getRankIndex(previousRankId);
  const demoted = getRankIndex(nextRankId) < getRankIndex(previousRankId);

  const rankWinsAfterMatch = current.rankWins + (won ? 1 : 0);
  const rankLossesAfterMatch = current.rankLosses + (won ? 0 : 1);

  const transaction: TrophyTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    matchId,
    kind: won ? 'win' : 'loss',
    delta: trophiesAfter - trophiesBefore,
    baseDelta,
    sweepBonus,
    trophiesBefore,
    trophiesAfter,
    rankBefore: previousRankId,
    rankAfter: nextRankId,
    createdAt: new Date().toISOString(),
  };

  const history: TrophyHistoryEntry[] = [transaction, ...current.history];
  let completedRankRecord: { wins: number; losses: number } | null = null;
  let nextRankWins = rankWinsAfterMatch;
  let nextRankLosses = rankLossesAfterMatch;

  if (promoted || demoted) {
    completedRankRecord = { wins: rankWinsAfterMatch, losses: rankLossesAfterMatch };
    const rankRecord: RankRecordHistoryEntry = {
      id: `rank_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'rank_record',
      matchId,
      rankId: previousRankId,
      wins: rankWinsAfterMatch,
      losses: rankLossesAfterMatch,
      reason: promoted ? 'promotion' : 'demotion',
      createdAt: new Date().toISOString(),
    };
    history.unshift(rankRecord);
    nextRankWins = 0;
    nextRankLosses = 0;
  }

  const highestRankId =
    getRankIndex(nextRankId) >= getRankIndex(current.highestRankId)
      ? nextRankId
      : current.highestRankId;

  const profile: TrophyProfile = {
    trophies: trophiesAfter,
    rankId: nextRankId,
    highestRankId,
    wins: current.wins + (won ? 1 : 0),
    losses: current.losses + (won ? 0 : 1),
    rankWins: nextRankWins,
    rankLosses: nextRankLosses,
    history: history.slice(0, MAX_HISTORY),
    processedMatchIds: [matchId, ...current.processedMatchIds].slice(0, MAX_PROCESSED_IDS),
  };

  persist(profile);

  return {
    applied: true,
    profile,
    transaction,
    promoted,
    demoted,
    previousRankId,
    nextRankId,
    delta: transaction.delta,
    completedRankRecord,
  };
}
