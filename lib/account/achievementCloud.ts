/**
 * Cloud achievement sync for permanent 1B Run accounts.
 * Guests + anonymous JWTs stay local-only (oneb_challenges_v1).
 *
 * Account isolation rules:
 * - Merge local → account only when local is tagged as genuine guest progress
 *   OR when the local cache owner matches the signed-in user.
 * - Orphaned local data (previous permanent account, no guest tag) is NEVER merged.
 * - Account A → logout / Account B must not inherit A's achievements.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isPermanentAuthUser } from '@/lib/account/userKind';
import {
  ACHIEVEMENT_UNLOCKED_EVENT,
  CHALLENGES_STORAGE_KEY,
  getChallengePersistence,
  materializeDerivedChallengeCompletions,
  mergeChallengePersistence,
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

const TABLE = 'user_achievement_progress';
const MIGRATE_SOURCE_GUEST = 'guest';

let activeUserId: string | null = null;
let pushTimer: number | null = null;
let reconcileInFlight: Promise<void> | null = null;

function readOwner(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CHALLENGES_CLOUD_OWNER_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeOwner(userId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!userId) localStorage.removeItem(CHALLENGES_CLOUD_OWNER_KEY);
    else localStorage.setItem(CHALLENGES_CLOUD_OWNER_KEY, userId);
  } catch {
    /* ignore */
  }
}

function readMigrateSource(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(CHALLENGES_MIGRATE_SOURCE_KEY);
  } catch {
    return null;
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
  return readMigrateSource() === MIGRATE_SOURCE_GUEST;
}

function markGuestMigrateSource(): void {
  writeMigrateSource(MIGRATE_SOURCE_GUEST);
}

/**
 * Local is eligible to merge into `userId` only when:
 * - cache owner is this same permanent user, or
 * - tagged guest progress with no foreign permanent owner.
 */
function localEligibleForMerge(userId: string): boolean {
  const owner = readOwner();
  if (owner === userId) return true;
  if (owner && owner !== userId) return false;
  return hasEligibleGuestAchievementMigration();
}

function rowToState(row: Record<string, unknown>): ChallengePersistence {
  const completedIds = Array.isArray(row.completed_ids)
    ? row.completed_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const billionStreak =
    typeof row.billion_streak === 'number' && row.billion_streak >= 0
      ? Math.floor(row.billion_streak)
      : 0;
  const h2hWins =
    typeof row.h2h_wins === 'number' && row.h2h_wins >= 0 ? Math.floor(row.h2h_wins) : 0;
  const countedH2HRooms = Array.isArray(row.counted_h2h_rooms)
    ? row.counted_h2h_rooms
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .slice(-40)
    : [];
  return {
    completedIds: [...new Set(completedIds)],
    billionStreak,
    h2hWins,
    countedH2HRooms,
  };
}

function stateToRow(userId: string, state: ChallengePersistence) {
  return {
    user_id: userId,
    completed_ids: [...new Set(state.completedIds)],
    billion_streak: Math.max(0, Math.floor(state.billionStreak)),
    h2h_wins: Math.max(0, Math.floor(state.h2hWins)),
    counted_h2h_rooms: state.countedH2HRooms.slice(-40),
  };
}

async function fetchCloudState(
  userId: string,
): Promise<{ ok: true; state: ChallengePersistence | null } | { ok: false }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('user_id, completed_ids, billion_streak, h2h_wins, counted_h2h_rooms, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[achievements-cloud] fetch failed', error.message);
    return { ok: false };
  }
  if (!data) return { ok: true, state: null };
  return { ok: true, state: rowToState(data as Record<string, unknown>) };
}

async function upsertCloudState(userId: string, state: ChallengePersistence): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from(TABLE).upsert(stateToRow(userId, state), {
    onConflict: 'user_id',
  });
  if (error) {
    console.warn('[achievements-cloud] upsert failed', error.message);
    return false;
  }
  return true;
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
 * Local write → debounced cloud upsert. Never blocks gameplay.
 * No-op unless a permanent sync user is active.
 */
export function scheduleAchievementCloudPush(state: ChallengePersistence): void {
  if (!activeUserId) return;
  const userId = activeUserId;
  if (typeof window === 'undefined') return;
  if (pushTimer != null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    if (activeUserId !== userId) return;
    void upsertCloudState(userId, state);
  }, 450);
}

let listenerInstalled = false;
/** Install local-write → cloud-push listener once. */
export function ensureAchievementCloudWriteListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  setChallengePersistenceListener((state) => {
    if (!activeUserId) {
      // Genuine guest / anonymous local unlock — eligible for first-account migration.
      markGuestMigrateSource();
    }
    scheduleAchievementCloudPush(state);
  });
}

/**
 * Called when status becomes permanent. Merges local + cloud safely,
 * updates local cache, upserts cloud. Failures keep eligible local progress.
 */
export async function reconcileAchievementsForPermanentUser(userId: string): Promise<void> {
  if (!userId) return;
  ensureAchievementCloudWriteListener();

  if (reconcileInFlight) {
    await reconcileInFlight;
    if (activeUserId === userId) return;
  }

  const run = (async () => {
    activeUserId = userId;

    let localSide: ChallengePersistence;
    if (localEligibleForMerge(userId)) {
      const owner = readOwner();
      if (owner === userId) {
        // Same account cache — union with cloud; do not re-fold device PB.
        localSide = getChallengePersistence();
      } else {
        // Tagged guest progress → may fold PB/runs once into completedIds for this bind.
        localSide = materializeDerivedChallengeCompletions(getChallengePersistence());
      }
    } else {
      // Orphan / foreign / post-logout with no new guest play — strict isolation.
      localSide = emptyChallengePersistence();
    }

    const cloudResult = await fetchCloudState(userId);
    if (!cloudResult.ok) {
      // Keep eligible local only; never keep orphaned local when ineligible.
      replaceChallengePersistence(localSide, { fromCloud: true });
      setChallengeCloudSyncActive(true);
      writeOwner(userId);
      writeMigrateSource(null);
      dispatchAchievementsRefresh();
      return;
    }

    const cloudSide = cloudResult.state ?? emptyChallengePersistence();
    const merged = mergeChallengePersistence(localSide, cloudSide);

    replaceChallengePersistence(merged, { fromCloud: true });
    setChallengeCloudSyncActive(true);
    writeOwner(userId);
    writeMigrateSource(null);

    const ok = await upsertCloudState(userId, merged);
    if (!ok) {
      console.warn('[achievements-cloud] reconcile upsert deferred');
    }

    dispatchAchievementsRefresh();
  })();

  reconcileInFlight = run.finally(() => {
    reconcileInFlight = null;
  });
  await reconcileInFlight;
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
 * Before signup / login to a permanent account: if local cache is not eligible
 * guest progress, discard it so a brand-new account starts clean.
 * Eligible guest progress is left in place for merge.
 */
export function prepareLocalAchievementsForAccountBind(): void {
  if (hasEligibleGuestAchievementMigration() && !readOwner()) {
    return;
  }
  detachAchievementCloudCache();
}

/** True when the current Auth user should use cloud achievements. */
export function shouldSyncAchievementsForUser(
  user: Parameters<typeof isPermanentAuthUser>[0],
): boolean {
  return isPermanentAuthUser(user);
}

export function getActiveAchievementCloudUserId(): string | null {
  return activeUserId;
}
