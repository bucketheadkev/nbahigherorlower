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

interface ChallengePersistence {
  completedIds: string[];
  billionStreak: number;
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
  return { completedIds: [], billionStreak: 0 };
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
    return { completedIds: [...new Set(completedIds)], billionStreak };
  } catch {
    return emptyPersistence();
  }
}

function writePersistence(state: ChallengePersistence): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    CHALLENGES_STORAGE_KEY,
    JSON.stringify({
      completedIds: [...new Set(state.completedIds)],
      billionStreak: Math.max(0, Math.floor(state.billionStreak)),
    }),
  );
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
      progress: Math.min(pb, 500_000_000),
      goal: 500_000_000,
      kind: 'money',
      complete: pb >= 500_000_000 || isDone('halfway-home'),
    },
    {
      id: 'closing-in',
      progress: Math.min(pb, 750_000_000),
      goal: 750_000_000,
      kind: 'money',
      complete: pb >= 750_000_000 || isDone('closing-in'),
    },
    {
      id: 'near-miss-950m',
      progress: Math.min(pb, 950_000_000),
      goal: 950_000_000,
      kind: 'money',
      complete: pb >= 950_000_000 || isDone('near-miss-950m'),
    },
    {
      id: 'hit-1b',
      progress: Math.min(pb, BILLION_GOAL),
      goal: BILLION_GOAL,
      kind: 'money',
      complete: pb >= BILLION_GOAL || isDone('hit-1b'),
    },
    flag('no-second-chances'),
    flag('all-in'),
    flag('two-hundred-m-club'),
    flag('balanced-books'),
    flag('just-enough'),
    {
      id: 'hit-1-05b',
      progress: Math.min(pb, 1_050_000_000),
      goal: 1_050_000_000,
      kind: 'money',
      complete: pb >= 1_050_000_000 || isDone('hit-1-05b'),
    },
    flag('billion-and-beyond'),
    flag('elite-company'),
    flag('no-headliners'),
    flag('five-star-portfolio'),
    flag('generational-wealth'),
    flag('league-tour'),
    flag('double-trouble'),
    flag('triple-threat'),
    flag('top-of-the-market'),
    flag('clutch-investment'),
    flag('perfect-range'),
    streak('back-to-back-billions', 2),
    streak('three-peat', 3),
    {
      id: 'five-runs-1-1b',
      progress: Math.min(runStats.runsAtLeast1_1b, 5),
      goal: 5,
      kind: 'count',
      complete: runStats.runsAtLeast1_1b >= 5,
    },
    {
      id: 'ten-billion-runs',
      progress: Math.min(billionRunCount, 10),
      goal: 10,
      kind: 'count',
      complete: billionRunCount >= 10,
    },
  ];
}

/** Highest obtainable single-player dollar value in production. */
export function maxObtainablePlayerDollars(): number {
  return MAX_PLAYER_DOLLARS;
}
