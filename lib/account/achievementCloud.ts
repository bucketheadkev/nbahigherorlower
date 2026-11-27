/**
 * Cloud achievement sync — RETIRED as an active gameplay / Bank reward system.
 *
 * Challenges and achievement Bank payouts are disabled. This module still clears
 * local caches on account bind/logout so leftover rows cannot leak between accounts
 * or re-trigger `bank_credit_achievements` on staging/production.
 *
 * Guests + anonymous JWTs stay local-only (oneb_challenges_v1) and are wiped on bind.
 */

import { isPermanentAuthUser } from '@/lib/account/userKind';
import {
  ACHIEVEMENT_UNLOCKED_EVENT,
  CHALLENGES_STORAGE_KEY,
  replaceChallengePersistence,
  setChallengeCloudSyncActive,
  setChallengePersistenceListener,
  emptyChallengePersistence,
  type ChallengePersistence,
} from '@/lib/tradeup/challenges';

/** Which permanent user currently owns the local challenges cache. */
export const CHALLENGES_CLOUD_OWNER_KEY = 'oneb_challenges_cloud_owner_v1';

/**
 * Set to 'guest' only when achievement state is written while no permanent
 * cloud sync user is active. Cleared on permanent logout / detach.
 * Absent or any other value → local blob is NOT eligible to migrate into a new account.
 */
export const CHALLENGES_MIGRATE_SOURCE_KEY = 'oneb_challenges_migrate_source_v1';

/** @deprecated Kept for cleanup of older clients; no longer gates merge by itself. */
export const CHALLENGES_MATERIALIZE_OK_KEY = 'oneb_challenges_materialize_ok_v1';

const MIGRATE_SOURCE_GUEST = 'guest';

let activeUserId: string | null = null;
let pushTimer: number | null = null;

function writeOwner(userId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!userId) localStorage.removeItem(CHALLENGES_CLOUD_OWNER_KEY);
    else localStorage.setItem(CHALLENGES_CLOUD_OWNER_KEY, userId);
  } catch {
    /* ignore */
  }
}

function writeMigrateSource(value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!value) localStorage.removeItem(CHALLENGES_MIGRATE_SOURCE_KEY);
    else localStorage.setItem(CHALLENGES_MIGRATE_SOURCE_KEY, value);
  } catch {
    /* ignore */
  }
}

/** True when local achievement writes happened as a real guest (eligible for first-account merge). */
export function hasEligibleGuestAchievementMigration(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(CHALLENGES_MIGRATE_SOURCE_KEY) === MIGRATE_SOURCE_GUEST;
  } catch {
    return false;
  }
}

function markGuestMigrateSource(): void {
  writeMigrateSource(MIGRATE_SOURCE_GUEST);
}

function dispatchAchievementsRefresh(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(ACHIEVEMENT_UNLOCKED_EVENT));
  } catch {
    /* ignore */
  }
}

/**
 * Local write → cloud upsert. Disabled: achievements no longer sync or pay Bank cash.
 */
export function scheduleAchievementCloudPush(_state: ChallengePersistence): void {
  /* retired */
}

let listenerInstalled = false;
/** Install local-write listener once (guest tagging only; no cloud push). */
export function ensureAchievementCloudWriteListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  setChallengePersistenceListener((state) => {
    if (!activeUserId) {
      markGuestMigrateSource();
    }
    scheduleAchievementCloudPush(state);
  });
}

/**
 * Called when status becomes permanent.
 * Retired: never merge/materialize/upsert achievement progress (that path minted Bank cash).
 * Clears local challenge state for strict account isolation.
 */
export async function reconcileAchievementsForPermanentUser(userId: string): Promise<void> {
  if (!userId) return;
  activeUserId = null;
  setChallengeCloudSyncActive(false);
  writeOwner(null);
  writeMigrateSource(null);
  replaceChallengePersistence(emptyChallengePersistence(), { fromCloud: true });
  dispatchAchievementsRefresh();
}

/**
 * Leaving a permanent account (or preparing to bind a different one):
 * drop the account-scoped local achievement cache so the next guest / other
 * account cannot inherit it. Does not delete cloud rows.
 */
export function detachAchievementCloudCache(): void {
  if (pushTimer != null && typeof window !== 'undefined') {
    window.clearTimeout(pushTimer);
    pushTimer = null;
  }
  activeUserId = null;
  setChallengeCloudSyncActive(false);
  writeOwner(null);
  writeMigrateSource(null);
  try {
    localStorage.setItem(CHALLENGES_MATERIALIZE_OK_KEY, '0');
  } catch {
    /* ignore */
  }
  replaceChallengePersistence(emptyChallengePersistence(), { fromCloud: true });
  if (typeof window === 'undefined') {
    dispatchAchievementsRefresh();
    return;
  }
  try {
    localStorage.removeItem(CHALLENGES_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  dispatchAchievementsRefresh();
}

/**
 * Before signup / login: always discard local achievement/challenge progress.
 * Guest challenge unlocks must not migrate or pay Bank cash on a new account.
 */
export function prepareLocalAchievementsForAccountBind(): void {
  detachAchievementCloudCache();
}

/** True when the current Auth user should use cloud achievements. Always false (retired). */
export function shouldSyncAchievementsForUser(
  _user: Parameters<typeof isPermanentAuthUser>[0],
): boolean {
  return false;
}

export function getActiveAchievementCloudUserId(): string | null {
  return activeUserId;
}
