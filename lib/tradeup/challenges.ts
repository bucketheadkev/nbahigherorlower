/**
 * Classic Run challenge definitions, completion evaluation, and persistence.
 */

import { BILLION_GOAL, getDollarValue, MAX_PLAYER_DOLLARS, type ValuedPlayer } from './billionDollar';
import type { DecadeEra } from './decadeRosters';
import { getBillionRuns } from './billionRuns';
import { statsFromBillionRuns } from './challengeStats';
import { getBestRosterValue } from './storage';

export const CHALLENGES_STORAGE_KEY = 'oneb_challenges_v1';

/** Removed challenge IDs — ignored if present in old saves. */
export const REMOVED_CHALLENGE_IDS = new Set([
  'four-man-1-1b',
  'max-player-350m',
  'three-billion-runs',
  'five-billion-runs',
]);

export interface ClassicRunSnapshot {
  teamValue: number;
  players: ValuedPlayer[];
  teamRerollUsed: boolean;
  eraRerollUsed: boolean;
  /** Sum of four locked players immediately before the fifth pick. */
  fourPlayerTotalBeforeFifth: number | null;
}

/** Local + cloud achievement blob (mirrors oneb_challenges_v1 / user_achievement_progress). */
export interface ChallengePersistence {
  completedIds: string[];
  billionStreak: number;
  h2hWins: number;
  countedH2HRooms: string[];
}

/** When true (permanent cloud sync), money/run-count completions rely on completedIds — not foreign PB/runs. */
let preferCompletedIdsForDerived = false;

/** Optional listener after every local write (cloud push). */
let persistenceListener: ((state: ChallengePersistence) => void) | null = null;
let suppressPersistenceListener = 0;

export function setChallengeCloudSyncActive(active: boolean): void {
  preferCompletedIdsForDerived = active;
}

export function setChallengePersistenceListener(
  listener: ((state: ChallengePersistence) => void) | null,
): void {
  persistenceListener = listener;
}

export function emptyChallengePersistence(): ChallengePersistence {
  return emptyPersistence();
}

export type ChallengeKind = 'money' | 'count';

export interface ChallengeProgress {
  id: string;
  progress: number;
  goal: number;
  kind: ChallengeKind;
  complete: boolean;
}

function emptyPersistence(): ChallengePersistence {
  return { completedIds: [], billionStreak: 0, h2hWins: 0, countedH2HRooms: [] };
}

function sanitizePersistence(state: ChallengePersistence): ChallengePersistence {
  return {
    completedIds: [
      ...new Set(
        state.completedIds.filter(
          (id) => typeof id === 'string' && id.length > 0 && !REMOVED_CHALLENGE_IDS.has(id),
        ),
      ),
    ],
    billionStreak: Math.max(0, Math.floor(state.billionStreak)),
    h2hWins: Math.max(0, Math.floor(state.h2hWins)),
    countedH2HRooms: state.countedH2HRooms
      .filter((id) => typeof id === 'string' && id.length > 0)
      .slice(-40),
  };
}

function readPersistence(): ChallengePersistence {
  if (typeof window === 'undefined') return emptyPersistence();
  try {
    const raw = localStorage.getItem(CHALLENGES_STORAGE_KEY);
    if (!raw) return emptyPersistence();
    const parsed = JSON.parse(raw) as Partial<ChallengePersistence>;
    const completedIds = Array.isArray(parsed.completedIds)
      ? parsed.completedIds.filter(
          (id): id is string =>
            typeof id === 'string' && id.length > 0 && !REMOVED_CHALLENGE_IDS.has(id),
        )
      : [];
    const billionStreak =
      typeof parsed.billionStreak === 'number' && parsed.billionStreak >= 0
        ? Math.floor(parsed.billionStreak)
        : 0;
    const h2hWins =
      typeof parsed.h2hWins === 'number' && parsed.h2hWins >= 0
        ? Math.floor(parsed.h2hWins)
        : 0;
    const countedH2HRooms = Array.isArray(parsed.countedH2HRooms)
      ? parsed.countedH2HRooms.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(-40)
      : [];
    return { completedIds: [...new Set(completedIds)], billionStreak, h2hWins, countedH2HRooms };
  } catch {
    return emptyPersistence();
  }
}

function writePersistence(state: ChallengePersistence): void {
  if (typeof window === 'undefined') return;
  const sanitized = sanitizePersistence(state);
  localStorage.setItem(
    CHALLENGES_STORAGE_KEY,
    JSON.stringify({
      completedIds: sanitized.completedIds,
      billionStreak: sanitized.billionStreak,
      h2hWins: sanitized.h2hWins,
      countedH2HRooms: sanitized.countedH2HRooms,
    }),
  );
  if (suppressPersistenceListener === 0) {
    persistenceListener?.(sanitized);
  }
}

/** Replace local cache (e.g. after cloud merge). Optionally skip cloud push echo. */
export function replaceChallengePersistence(
  state: ChallengePersistence,
  options?: { fromCloud?: boolean },
): void {
  if (options?.fromCloud) suppressPersistenceListener += 1;
  try {
    writePersistence(state);
  } finally {
    if (options?.fromCloud) suppressPersistenceListener = Math.max(0, suppressPersistenceListener - 1);
  }
}

/**
 * Fold PB / billion-run derived completions into completedIds so cloud can preserve
 * them before PB/run cloud sync exists. Does not clear or rewrite PB/run stores.
 */
export function materializeDerivedChallengeCompletions(
  state: ChallengePersistence,
): ChallengePersistence {
  const next: ChallengePersistence = {
    completedIds: [...state.completedIds],
    billionStreak: state.billionStreak,
    h2hWins: state.h2hWins,
    countedH2HRooms: [...state.countedH2HRooms],
  };
  const pb = getBestRosterValue();
  const moneyMilestones: Array<[string, number]> = [
    ['halfway-home', 500_000_000],
    ['closing-in', 750_000_000],
    ['near-miss-950m', 950_000_000],
    ['hit-1b', BILLION_GOAL],
    ['hit-1-05b', 1_050_000_000],
  ];
  for (const [id, goal] of moneyMilestones) {
    if (pb >= goal) markCompleted(next, id);
  }
  const billionRuns = getBillionRuns();
  const runStats = statsFromBillionRuns(billionRuns);
  if (runStats.runsAtLeast1_1b >= 5) markCompleted(next, 'five-runs-1-1b');
  if (billionRuns.length >= 10) markCompleted(next, 'ten-billion-runs');
  return sanitizePersistence(next);
}

/** Semantic merge: progress only moves forward. */
export function mergeChallengePersistence(
  a: ChallengePersistence,
  b: ChallengePersistence,
): ChallengePersistence {
  const completedIds = [
    ...new Set(
      [...a.completedIds, ...b.completedIds].filter((id) => !REMOVED_CHALLENGE_IDS.has(id)),
    ),
  ];
  const countedH2HRooms = [
    ...new Set([...a.countedH2HRooms, ...b.countedH2HRooms].filter((id) => id.length > 0)),
  ].slice(-40);
  // Prefer max of counters; also never below unique counted rooms (when both sides retained rooms).
  const h2hWins = Math.max(a.h2hWins, b.h2hWins, countedH2HRooms.length);
  const billionStreak = Math.max(a.billionStreak, b.billionStreak);
  return sanitizePersistence({
    completedIds,
    billionStreak,
    h2hWins,
    countedH2HRooms,
  });
}

function playerDollarValues(players: ValuedPlayer[]): number[] {
  return players.map((p) => Math.round(getDollarValue(p)));
}

function playerEras(players: ValuedPlayer[]): DecadeEra[] {
  return players
    .map((p) => {
      const era = (p as ValuedPlayer & { era?: DecadeEra; sourceEra?: DecadeEra }).era
        ?? (p as ValuedPlayer & { sourceEra?: DecadeEra }).sourceEra;
      return typeof era === 'string' ? era : null;
    })
    .filter((era): era is DecadeEra => Boolean(era));
}

function markCompleted(state: ChallengePersistence, id: string): void {
  if (REMOVED_CHALLENGE_IDS.has(id)) return;
  if (!state.completedIds.includes(id)) {
    state.completedIds.push(id);
  }
}

function evaluateRunChallenges(snapshot: ClassicRunSnapshot): string[] {
  const teamValue = Math.round(snapshot.teamValue);
  const values = playerDollarValues(snapshot.players);
  const newlyCompleted: string[] = [];

  const tryMark = (id: string, met: boolean) => {
    if (met) newlyCompleted.push(id);
  };

  if (
    teamValue >= BILLION_GOAL &&
    !snapshot.teamRerollUsed &&
    !snapshot.eraRerollUsed
  ) {
    tryMark('no-second-chances', true);
  }

  if (
    teamValue >= BILLION_GOAL &&
    snapshot.teamRerollUsed &&
    snapshot.eraRerollUsed
  ) {
    tryMark('all-in', true);
  }

  if (
    teamValue >= BILLION_GOAL &&
    values.length === 5 &&
    values.every((v) => v >= 200_000_000)
  ) {
    tryMark('two-hundred-m-club', true);
  }

  if (teamValue >= BILLION_GOAL && values.length === 5) {
    const spread = Math.max(...values) - Math.min(...values);
    if (spread <= 15_000_000) tryMark('balanced-books', true);
  }

  if (teamValue >= BILLION_GOAL && teamValue <= 1_015_000_000) {
    tryMark('just-enough', true);
  }

  if (teamValue >= 1_050_000_000) {
    tryMark('billion-and-beyond', true);
  }

  if (teamValue >= 1_075_000_000) {
    tryMark('elite-company', true);
  }

  if (
    teamValue >= BILLION_GOAL &&
    values.length === 5 &&
    values.every((v) => v <= 210_000_000)
  ) {
    tryMark('no-headliners', true);
  }

  if (
    teamValue >= BILLION_GOAL &&
    values.length === 5 &&
    values.every((v) => v >= 195_000_000 && v <= 215_000_000)
  ) {
    tryMark('five-star-portfolio', true);
  }

  const eras = playerEras(snapshot.players);
  if (teamValue >= BILLION_GOAL && new Set(eras).size >= 4) {
    tryMark('generational-wealth', true);
  }

  const teams = snapshot.players.map((p) => p.teamId).filter(Boolean);
  if (teamValue >= BILLION_GOAL && new Set(teams).size >= 5) {
    tryMark('league-tour', true);
  }

  if (values.filter((v) => v >= 215_000_000).length >= 2) {
    tryMark('double-trouble', true);
  }

  if (values.filter((v) => v >= 210_000_000).length >= 3) {
    tryMark('triple-threat', true);
  }

  if (values.some((v) => v >= 220_000_000)) {
    tryMark('top-of-the-market', true);
  }

  if (
    snapshot.fourPlayerTotalBeforeFifth != null &&
    snapshot.fourPlayerTotalBeforeFifth < 800_000_000 &&
    teamValue >= BILLION_GOAL
  ) {
    tryMark('clutch-investment', true);
  }

  if (teamValue >= 1_025_000_000 && teamValue <= 1_035_000_000) {
    tryMark('perfect-range', true);
  }

  return newlyCompleted;
}

export function processClassicRunChallenges(
  snapshot: ClassicRunSnapshot,
  _previousBest = 0,
): string[] {
  const state = readPersistence();
  const previouslyDone = new Set(state.completedIds);
  const teamValue = Math.round(snapshot.teamValue);
  const newlyCompleted: string[] = [];

  const unlock = (id: string) => {
    if (REMOVED_CHALLENGE_IDS.has(id)) return;
    if (previouslyDone.has(id) || newlyCompleted.includes(id)) return;
    newlyCompleted.push(id);
    markCompleted(state, id);
  };

  // Money milestones — first time this run crosses the bar.
  const moneyMilestones: Array<[string, number]> = [
    ['halfway-home', 500_000_000],
    ['closing-in', 750_000_000],
    ['near-miss-950m', 950_000_000],
    ['hit-1b', BILLION_GOAL],
    ['hit-1-05b', 1_050_000_000],
  ];
  for (const [id, goal] of moneyMilestones) {
    // Unlock + toast the first time this run qualifies and it isn't persisted yet
    // (covers newly added challenges even if personal best was already above the bar).
    if (teamValue >= goal) unlock(id);
  }

  for (const id of evaluateRunChallenges(snapshot)) {
    unlock(id);
  }

  if (teamValue >= BILLION_GOAL) {
    state.billionStreak += 1;
    if (state.billionStreak >= 2) unlock('back-to-back-billions');
    if (state.billionStreak >= 3) unlock('three-peat');
  } else {
    state.billionStreak = 0;
  }

  writePersistence(state);
  return newlyCompleted;
}

export interface H2HMatchSnapshot {
  roomId: string;
  won: boolean;
  myScore: number;
  rounds: Array<{ mine: number; opp: number; iWon: boolean }>;
}

/** 1v1 result achievements. Same storage as Classic so the toast and list stay in sync. */
export function processH2HMatchChallenges(snapshot: H2HMatchSnapshot): string[] {
  const state = readPersistence();
  const previouslyDone = new Set(state.completedIds);
  const newlyCompleted: string[] = [];

  const unlock = (id: string) => {
    if (previouslyDone.has(id) || newlyCompleted.includes(id)) return;
    newlyCompleted.push(id);
    markCompleted(state, id);
  };

  const myScore = Math.round(snapshot.myScore);
  const roomId = snapshot.roomId.trim();
  const alreadyCounted = roomId.length > 0 && state.countedH2HRooms.includes(roomId);
  if (snapshot.won && !alreadyCounted) {
    unlock('h2h-first-win');
    state.h2hWins += 1;
    if (roomId) state.countedH2HRooms = [...state.countedH2HRooms, roomId].slice(-40);
    if (state.h2hWins >= 3) unlock('h2h-three-wins');
  }
  if (myScore >= BILLION_GOAL) unlock('h2h-billion');
  if (snapshot.rounds.length >= 5 && snapshot.rounds.every((round) => round.iWon)) {
    unlock('h2h-clean-sweep');
  }
  if (
    snapshot.rounds.some(
      (round) => round.iWon && Math.round(round.mine - round.opp) >= 75_000_000,
    )
  ) {
    unlock('h2h-statement');
  }

  writePersistence(state);
  return newlyCompleted;
}

export function getChallengePersistence(): ChallengePersistence {
  return readPersistence();
}

export const ACHIEVEMENT_UNLOCKED_EVENT = 'oneb-achievement-unlocked';
const ACHIEVEMENT_FLASH_KEY = 'oneb_achievement_flash_at';

export function getAchievementSummary(): { completed: number; total: number } {
  const list = buildChallengeProgressList();
  return {
    completed: list.filter((item) => item.complete).length,
    total: list.length,
  };
}

/** Tell any open Achievements control to recount and shimmer once. */
export function notifyAchievementsUnlocked(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(ACHIEVEMENT_FLASH_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(ACHIEVEMENT_UNLOCKED_EVENT));
}

/** True once if an unlock just happened and the hub button was not on screen. */
export function consumeAchievementCelebration(maxAgeMs = 12000): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = sessionStorage.getItem(ACHIEVEMENT_FLASH_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(ACHIEVEMENT_FLASH_KEY);
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at <= maxAgeMs;
  } catch {
    return false;
  }
}

/** Ordered challenge list for the Challenges screen. */
export function buildChallengeProgressList(): ChallengeProgress[] {
  const pb = getBestRosterValue();
  const billionRuns = getBillionRuns();
  const runStats = statsFromBillionRuns(billionRuns);
  const billionRunCount = billionRuns.length;
  const persisted = readPersistence();
  const isDone = (id: string) => persisted.completedIds.includes(id);
  /** Permanent cloud mode: do not let leftover device PB/runs mark completions. */
  const moneyComplete = (id: string, goal: number) =>
    isDone(id) || (!preferCompletedIdsForDerived && pb >= goal);
  const moneyProgress = (id: string, goal: number) => {
    if (preferCompletedIdsForDerived && isDone(id)) return goal;
    return Math.min(pb, goal);
  };

  const flag = (id: string): ChallengeProgress => ({
    id,
    progress: isDone(id) ? 1 : 0,
    goal: 1,
    kind: 'count',
    complete: isDone(id),
  });

  const streak = (id: string, goal: number): ChallengeProgress => {
    const complete = isDone(id);
    const progress = complete ? goal : Math.min(persisted.billionStreak, goal);
    return { id, progress, goal, kind: 'count', complete };
  };

  return [
    {
      id: 'halfway-home',
      progress: moneyProgress('halfway-home', 500_000_000),
      goal: 500_000_000,
      kind: 'money',
      complete: moneyComplete('halfway-home', 500_000_000),
    },
    {
      id: 'closing-in',
      progress: moneyProgress('closing-in', 750_000_000),
      goal: 750_000_000,
      kind: 'money',
      complete: moneyComplete('closing-in', 750_000_000),
    },
    {
      id: 'near-miss-950m',
      progress: moneyProgress('near-miss-950m', 950_000_000),
      goal: 950_000_000,
      kind: 'money',
      complete: moneyComplete('near-miss-950m', 950_000_000),
    },
    {
      id: 'hit-1b',
      progress: moneyProgress('hit-1b', BILLION_GOAL),
      goal: BILLION_GOAL,
      kind: 'money',
      complete: moneyComplete('hit-1b', BILLION_GOAL),
    },
    flag('no-second-chances'),
    flag('all-in'),
    flag('two-hundred-m-club'),
    flag('balanced-books'),
    flag('just-enough'),
    {
      id: 'hit-1-05b',
      progress: moneyProgress('hit-1-05b', 1_050_000_000),
      goal: 1_050_000_000,
      kind: 'money',
      complete: moneyComplete('hit-1-05b', 1_050_000_000),
    },
    flag('billion-and-beyond'),
    flag('elite-company'),
    flag('no-headliners'),
    flag('five-star-portfolio'),
    flag('generational-wealth'),
    flag('league-average'),
    flag('double-trouble'),
    flag('triple-threat'),
    flag('top-of-the-market'),
    flag('clutch-investment'),
    flag('perfect-range'),
    streak('back-to-back-billions', 2),
    streak('three-peat', 3),
    flag('h2h-first-win'),
    flag('h2h-billion'),
    flag('h2h-clean-sweep'),
    flag('h2h-statement'),
    {
      id: 'h2h-three-wins',
      progress: isDone('h2h-three-wins') ? 3 : Math.min(persisted.h2hWins, 3),
      goal: 3,
      kind: 'count',
      complete: isDone('h2h-three-wins'),
    },
    {
      id: 'five-runs-1-1b',
      progress:
        preferCompletedIdsForDerived && isDone('five-runs-1-1b')
          ? 5
          : Math.min(runStats.runsAtLeast1_1b, 5),
      goal: 5,
      kind: 'count',
      complete:
        isDone('five-runs-1-1b') ||
        (!preferCompletedIdsForDerived && runStats.runsAtLeast1_1b >= 5),
    },
    {
      id: 'ten-billion-runs',
      progress:
        preferCompletedIdsForDerived && isDone('ten-billion-runs')
          ? 10
          : Math.min(billionRunCount, 10),
      goal: 10,
      kind: 'count',
      complete:
        isDone('ten-billion-runs') ||
        (!preferCompletedIdsForDerived && billionRunCount >= 10),
    },
  ];
}

/** Highest obtainable single-player dollar value in production. */
export function maxObtainablePlayerDollars(): number {
  return MAX_PLAYER_DOLLARS;
}
