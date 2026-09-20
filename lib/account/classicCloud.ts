/**
 * Cloud Classic PB + My Runs for permanent 1B Run accounts.
 * Guests stay device-local; logout restores a guest snapshot when one exists.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  BILLION_RUNS_KEY,
  getBillionRuns,
  mergeBillionRuns,
  replaceBillionRuns,
  setBillionRunsListener,
  type BillionRun,
} from '@/lib/tradeup/billionRuns';
import {
  BEST_ROSTER_VALUE_STORAGE_KEY,
  BEST_WORLD_RANK_STORAGE_KEY,
  CLASSIC_PROGRESS_EVENT,
  getBestRosterValue,
  getBestWorldRank,
  mergeBestWorldRank,
  replaceBestRosterValue,
  replaceBestWorldRank,
  setClassicProgressListener,
} from '@/lib/tradeup/storage';

export const CLASSIC_CLOUD_OWNER_KEY = 'oneb_classic_cloud_owner_v1';
export const CLASSIC_MIGRATE_SOURCE_KEY = 'oneb_classic_migrate_source_v1';
/** Snapshot of legitimate guest Classic progress preserved across permanent sessions. */
export const CLASSIC_GUEST_SNAPSHOT_KEY = 'oneb_guest_classic_snapshot_v1';

const PROGRESS_TABLE = 'user_classic_progress';
const RUNS_TABLE = 'user_classic_runs';
const MIGRATE_SOURCE_GUEST = 'guest';

export interface ClassicLocalState {
  bestRosterValue: number;
  bestWorldRank: number;
  runs: BillionRun[];
}

interface GuestClassicSnapshot extends ClassicLocalState {
  savedAt: number;
}

let activeUserId: string | null = null;
let pushTimer: number | null = null;
let reconcileInFlight: Promise<void> | null = null;

function readOwner(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CLASSIC_CLOUD_OWNER_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeOwner(userId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!userId) localStorage.removeItem(CLASSIC_CLOUD_OWNER_KEY);
    else localStorage.setItem(CLASSIC_CLOUD_OWNER_KEY, userId);
  } catch {
    /* ignore */
  }
}

function readMigrateSource(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(CLASSIC_MIGRATE_SOURCE_KEY);
  } catch {
    return null;
  }
}

function writeMigrateSource(value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!value) localStorage.removeItem(CLASSIC_MIGRATE_SOURCE_KEY);
    else localStorage.setItem(CLASSIC_MIGRATE_SOURCE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function hasEligibleGuestClassicMigration(): boolean {
  return readMigrateSource() === MIGRATE_SOURCE_GUEST;
}

function markGuestMigrateSource(): void {
  writeMigrateSource(MIGRATE_SOURCE_GUEST);
}

function localEligibleForMerge(userId: string): boolean {
  const owner = readOwner();
  if (owner === userId) return true;
  if (owner && owner !== userId) return false;
  return hasEligibleGuestClassicMigration();
}

function readLiveClassic(): ClassicLocalState {
  return {
    bestRosterValue: getBestRosterValue(),
    bestWorldRank: getBestWorldRank(),
    runs: getBillionRuns(),
  };
}

function writeLiveClassic(state: ClassicLocalState, fromCloud: boolean): void {
  replaceBestRosterValue(state.bestRosterValue, { fromCloud });
  replaceBestWorldRank(state.bestWorldRank, { fromCloud });
  replaceBillionRuns(state.runs, { fromCloud });
}

function emptyClassic(): ClassicLocalState {
  return { bestRosterValue: 0, bestWorldRank: 0, runs: [] };
}

function readGuestSnapshot(): GuestClassicSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CLASSIC_GUEST_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestClassicSnapshot>;
    const bestRosterValue =
      typeof parsed.bestRosterValue === 'number' && parsed.bestRosterValue > 0
        ? Math.round(parsed.bestRosterValue)
        : 0;
    const bestWorldRank =
      typeof parsed.bestWorldRank === 'number' && parsed.bestWorldRank > 0
        ? Math.round(parsed.bestWorldRank)
        : 0;
    const runs = Array.isArray(parsed.runs) ? parsed.runs : [];
    return {
      bestRosterValue,
      bestWorldRank,
      runs: mergeBillionRuns(runs, []),
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function writeGuestSnapshot(state: ClassicLocalState): void {
  if (typeof window === 'undefined') return;
  try {
    const snapshot: GuestClassicSnapshot = {
      ...state,
      runs: mergeBillionRuns(state.runs, []),
      savedAt: Date.now(),
    };
    localStorage.setItem(CLASSIC_GUEST_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

function clearGuestSnapshot(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CLASSIC_GUEST_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

function dispatchClassicRefresh(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(CLASSIC_PROGRESS_EVENT));
  } catch {
    /* ignore */
  }
}

export function mergeClassicLocalState(
  a: ClassicLocalState,
  b: ClassicLocalState,
): ClassicLocalState {
  return {
    bestRosterValue: Math.max(a.bestRosterValue, b.bestRosterValue),
    bestWorldRank: mergeBestWorldRank(a.bestWorldRank, b.bestWorldRank),
    runs: mergeBillionRuns(a.runs, b.runs),
  };
}

async function fetchCloudClassic(
  userId: string,
): Promise<{ ok: true; state: ClassicLocalState | null } | { ok: false }> {
  const supabase = getSupabaseBrowserClient();
  const [progressRes, runsRes] = await Promise.all([
    supabase
      .from(PROGRESS_TABLE)
      .select('best_roster_value, best_world_rank')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from(RUNS_TABLE).select('runs').eq('user_id', userId).maybeSingle(),
  ]);

  if (progressRes.error || runsRes.error) {
    console.warn(
      '[classic-cloud] fetch failed',
      progressRes.error?.message ?? runsRes.error?.message,
    );
    return { ok: false };
  }

  if (!progressRes.data && !runsRes.data) {
    return { ok: true, state: null };
  }

  const bestRosterValue = Math.max(
    0,
    Math.round(Number(progressRes.data?.best_roster_value ?? 0)),
  );
  const bestWorldRank = Math.max(0, Math.round(Number(progressRes.data?.best_world_rank ?? 0)));
  const runsRaw = runsRes.data?.runs;
  const runs = mergeBillionRuns(Array.isArray(runsRaw) ? (runsRaw as BillionRun[]) : [], []);

  return {
    ok: true,
    state: { bestRosterValue, bestWorldRank, runs },
  };
}

async function upsertCloudClassic(userId: string, state: ClassicLocalState): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  const [progressRes, runsRes] = await Promise.all([
    supabase.from(PROGRESS_TABLE).upsert(
      {
        user_id: userId,
        best_roster_value: Math.max(0, Math.round(state.bestRosterValue)),
        best_world_rank: Math.max(0, Math.round(state.bestWorldRank)),
      },
      { onConflict: 'user_id' },
    ),
    supabase.from(RUNS_TABLE).upsert(
      {
        user_id: userId,
        runs: mergeBillionRuns(state.runs, []),
      },
      { onConflict: 'user_id' },
    ),
  ]);
  if (progressRes.error || runsRes.error) {
    console.warn(
      '[classic-cloud] upsert failed',
      progressRes.error?.message ?? runsRes.error?.message,
    );
    return false;
  }
  return true;
}

export function scheduleClassicCloudPush(): void {
  if (!activeUserId) return;
  const userId = activeUserId;
  if (typeof window === 'undefined') return;
  if (pushTimer != null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    if (activeUserId !== userId) return;
    void upsertCloudClassic(userId, readLiveClassic());
  }, 450);
}

let listenerInstalled = false;
export function ensureClassicCloudWriteListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  setClassicProgressListener(() => {
    if (!activeUserId) markGuestMigrateSource();
    scheduleClassicCloudPush();
  });
  setBillionRunsListener(() => {
    if (!activeUserId) markGuestMigrateSource();
    scheduleClassicCloudPush();
  });
}

/**
 * Permanent login: merge eligible guest/same-account local with cloud,
 * stash guest snapshot when migrating guest progress, update live cache.
 */
export async function reconcileClassicForPermanentUser(userId: string): Promise<void> {
  if (!userId) return;
  ensureClassicCloudWriteListener();

  if (reconcileInFlight) {
    await reconcileInFlight;
    if (activeUserId === userId) return;
  }

  const run = (async () => {
    activeUserId = userId;
    const live = readLiveClassic();
    let localSide: ClassicLocalState;

    if (localEligibleForMerge(userId)) {
      const owner = readOwner();
      if (owner !== userId && hasEligibleGuestClassicMigration()) {
        // Preserve pre-account guest Classic progress for logout restore.
        writeGuestSnapshot(live);
      }
      localSide = live;
    } else {
      localSide = emptyClassic();
    }

    const cloudResult = await fetchCloudClassic(userId);
    if (!cloudResult.ok) {
      writeLiveClassic(localSide, true);
      writeOwner(userId);
      writeMigrateSource(null);
      dispatchClassicRefresh();
      return;
    }

    const cloudSide = cloudResult.state ?? emptyClassic();
    const merged = mergeClassicLocalState(localSide, cloudSide);
    writeLiveClassic(merged, true);
    writeOwner(userId);
    writeMigrateSource(null);

    const ok = await upsertCloudClassic(userId, merged);
    if (!ok) console.warn('[classic-cloud] reconcile upsert deferred');
    dispatchClassicRefresh();
  })();

  reconcileInFlight = run.finally(() => {
    reconcileInFlight = null;
  });
  await reconcileInFlight;
}

/**
 * Logout / leave permanent: clear account live cache, restore guest snapshot if any.
 * Attempts a last cloud push when a user id is known.
 */
export function detachClassicCloudCache(): void {
  const userId = activeUserId;
  const liveBeforeClear = readLiveClassic();

  if (pushTimer != null && typeof window !== 'undefined') {
    window.clearTimeout(pushTimer);
    pushTimer = null;
  }

  if (userId) {
    void upsertCloudClassic(userId, liveBeforeClear);
  }

  activeUserId = null;
  writeOwner(null);
  writeMigrateSource(null);

  const snapshot = readGuestSnapshot();
  if (snapshot) {
    writeLiveClassic(
      {
        bestRosterValue: snapshot.bestRosterValue,
        bestWorldRank: snapshot.bestWorldRank,
        runs: snapshot.runs,
      },
      true,
    );
    // Restored guest progress is again eligible for a future first-account bind.
    if (
      snapshot.bestRosterValue > 0 ||
      snapshot.bestWorldRank > 0 ||
      snapshot.runs.length > 0
    ) {
      markGuestMigrateSource();
    }
  } else {
    writeLiveClassic(emptyClassic(), true);
    try {
      localStorage.removeItem(BEST_ROSTER_VALUE_STORAGE_KEY);
      localStorage.removeItem(BEST_WORLD_RANK_STORAGE_KEY);
      localStorage.removeItem(BILLION_RUNS_KEY);
    } catch {
      /* ignore */
    }
  }

  dispatchClassicRefresh();
}

/**
 * Before signup/login: discard orphan permanent Classic cache.
 * Keep tagged guest progress for merge. Do not wipe guest snapshot.
 */
export function prepareLocalClassicForAccountBind(): void {
  if (hasEligibleGuestClassicMigration() && !readOwner()) {
    return;
  }
  // Orphan / foreign owner — clear live only; keep any prior guest snapshot intact.
  activeUserId = null;
  writeOwner(null);
  writeMigrateSource(null);
  writeLiveClassic(emptyClassic(), true);
  try {
    localStorage.removeItem(BEST_ROSTER_VALUE_STORAGE_KEY);
    localStorage.removeItem(BEST_WORLD_RANK_STORAGE_KEY);
    localStorage.removeItem(BILLION_RUNS_KEY);
  } catch {
    /* ignore */
  }
  dispatchClassicRefresh();
}

export function getActiveClassicCloudUserId(): string | null {
  return activeUserId;
}

/** Clear guest snapshot on full delete-my-data. */
export function clearClassicGuestSnapshot(): void {
  clearGuestSnapshot();
}
