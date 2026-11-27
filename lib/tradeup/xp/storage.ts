/**
 * Local XP profile + pending post-run XP/reward reveals.
 * Coins here are the home-screen currency (not Bank cash / legacy credits).
 */

import { progressFromTotalXp, XP_STARTING_LEVEL, type LevelProgress } from './config';

export const XP_PROFILE_KEY = 'oneb_xp_profile_v1';
/** Which account owns the live XP slot: `guest` or a permanent auth user id. */
export const XP_OWNER_KEY = 'oneb_xp_owner_v1';
/** Per-account XP snapshots so account switches never leak level/XP/coins. */
export const XP_PROFILES_BY_USER_KEY = 'oneb_xp_profiles_by_user_v1';
/** @deprecated kept for one-time migration of older queues */
export const XP_PENDING_LEVELUPS_KEY = 'oneb_xp_pending_levelups_v1';
export const XP_PENDING_REVEALS_KEY = 'oneb_xp_pending_reveals_v1';
export const XP_CHANGED_EVENT = 'oneb:xp-changed';
/** Fired when Classic evaluation finishes so the reveal can play over results. */
export const XP_REVEAL_READY_EVENT = 'oneb:xp-reveal-ready';

const AWARDED_RUN_CAP = 250;
const GUEST_OWNER = 'guest';

export interface XpProfile {
  version: 1;
  totalXp: number;
  coins: number;
  /** Run refs already paid — prevents double awards. */
  awardedRunRefs: string[];
  /** True once the new-player welcome coin gift has been claimed. */
  welcomeGranted?: boolean;
}

/** Queued post-run XP fill + coin reward presentation. */
export interface PendingXpReveal {
  id: string;
  runRef: string;
  fromLevel: number;
  toLevel: number;
  fromTotalXp: number;
  toTotalXp: number;
  xpFromRun: number;
  coinsFromRun: number;
  coinsBefore: number;
  coinsAfter: number;
  createdAt: number;
}

/** @deprecated alias for older call sites */
export type PendingLevelUp = PendingXpReveal;

const EMPTY_PROFILE: XpProfile = {
  version: 1,
  totalXp: 0,
  coins: 0,
  awardedRunRefs: [],
  welcomeGranted: false,
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function emptyProfile(): XpProfile {
  return { ...EMPTY_PROFILE, awardedRunRefs: [] };
}

function readOwner(): string {
  if (!canUseStorage()) return GUEST_OWNER;
  try {
    const raw = window.localStorage.getItem(XP_OWNER_KEY);
    return raw && raw.length > 0 ? raw : GUEST_OWNER;
  } catch {
    return GUEST_OWNER;
  }
}

function writeOwner(owner: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(XP_OWNER_KEY, owner);
  } catch {
    /* ignore */
  }
}

function readProfileMap(): Record<string, XpProfile> {
  const raw = readJson(XP_PROFILES_BY_USER_KEY);
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, XpProfile> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key) continue;
    out[key] = sanitizeProfile(value);
  }
  return out;
}

function writeProfileMap(map: Record<string, XpProfile>): void {
  writeJson(XP_PROFILES_BY_USER_KEY, map);
}

/**
 * Migrate the legacy single-slot profile into the guest bucket once, then clear it
 * so a brand-new permanent account cannot inherit device XP from a prior session.
 */
function migrateLegacyLiveProfileIntoGuestMap(): void {
  if (!canUseStorage()) return;
  try {
    if (window.localStorage.getItem(XP_PROFILES_BY_USER_KEY)) return;
  } catch {
    return;
  }
  const legacy = sanitizeProfile(readJson(XP_PROFILE_KEY));
  const map: Record<string, XpProfile> = {};
  if (
    legacy.totalXp > 0 ||
    legacy.coins > 0 ||
    legacy.awardedRunRefs.length > 0 ||
    legacy.welcomeGranted
  ) {
    map[GUEST_OWNER] = legacy;
  }
  writeProfileMap(map);
  writeJson(XP_PROFILE_KEY, emptyProfile());
  writeOwner(GUEST_OWNER);
}

/**
 * Switch the live XP/coins slot to a guest or permanent user.
 * Never copies guest XP into a permanent account — new accounts start at level 1 / 0 XP.
 */
export function bindXpProfileOwner(userId: string | null): void {
  migrateLegacyLiveProfileIntoGuestMap();
  const nextOwner = userId && userId.length > 0 ? userId : GUEST_OWNER;
  const prevOwner = readOwner();
  const map = readProfileMap();
  map[prevOwner] = sanitizeProfile(readJson(XP_PROFILE_KEY));
  const nextProfile = map[nextOwner] ? sanitizeProfile(map[nextOwner]) : emptyProfile();
  map[nextOwner] = nextProfile;
  writeProfileMap(map);
  writeOwner(nextOwner);
  writeJson(XP_PROFILE_KEY, nextProfile);
  clearPendingXpReveals();
  emitChanged();
}

/** Before signup/login: park guest XP in the guest bucket; do not carry it into the new account. */
export function prepareLocalXpForAccountBind(): void {
  migrateLegacyLiveProfileIntoGuestMap();
  const owner = readOwner();
  const map = readProfileMap();
  map[owner] = sanitizeProfile(readJson(XP_PROFILE_KEY));
  writeProfileMap(map);
  // Leave the live slot as-is until bindXpProfileOwner runs with the new user id.
}

/** Logout / leave permanent: restore the guest slot (never keep the permanent profile live). */
export function detachXpProfileToGuest(): void {
  bindXpProfileOwner(null);
}

export function getActiveXpOwner(): string {
  migrateLegacyLiveProfileIntoGuestMap();
  return readOwner();
}

function emitChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(XP_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function signalXpRevealReady(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(XP_REVEAL_READY_EVENT));
  } catch {
    /* ignore */
  }
}

function readJson(key: string): unknown {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

function sanitizeProfile(raw: unknown): XpProfile {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PROFILE };
  const o = raw as Record<string, unknown>;
  const totalXp = Math.max(0, Math.floor(Number(o.totalXp) || 0));
  const coins = Math.max(0, Math.floor(Number(o.coins) || 0));
  const awarded = Array.isArray(o.awardedRunRefs)
    ? o.awardedRunRefs.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(-AWARDED_RUN_CAP)
    : [];
  const welcomeGranted = o.welcomeGranted === true;
  return { version: 1, totalXp, coins, awardedRunRefs: awarded, welcomeGranted };
}

export function getXpProfile(): XpProfile {
  migrateLegacyLiveProfileIntoGuestMap();
  return sanitizeProfile(readJson(XP_PROFILE_KEY));
}

/**
 * Grant the one-time welcome gift if missing. Safe to call on home mount.
 * Returns coins granted (0 if already claimed).
 */
export function ensureWelcomeCoins(amount: number): number {
  const gift = Math.max(0, Math.floor(amount));
  if (gift <= 0) return 0;
  const profile = getXpProfile();
  if (profile.welcomeGranted) return 0;
  // Existing players who already earned coins keep progress — still mark gift claimed
  // only when granting, or when they clearly already play (have XP/runs).
  if (profile.totalXp > 0 || profile.awardedRunRefs.length > 0 || profile.coins > 0) {
    saveXpProfile({ ...profile, welcomeGranted: true });
    return 0;
  }
  saveXpProfile({
    ...profile,
    coins: profile.coins + gift,
    welcomeGranted: true,
  });
  // Permanent accounts: server pays a fixed 200 once (no client-chosen amount).
  void import('./cloudCoins')
    .then((mod) => mod.claimWelcomeCoins())
    .catch(() => {});
  return gift;
}

/** Spend coins once. Returns false if balance is insufficient. */
export function spendXpCoins(amount: number, ref?: string): boolean {
  const cost = Math.max(0, Math.floor(amount));
  if (cost <= 0) return true;
  const profile = getXpProfile();
  if (profile.coins < cost) return false;
  saveXpProfile({ ...profile, coins: profile.coins - cost });
  // Permanent accounts: mirror to cloud so web ↔ app stay aligned.
  void import('./cloudCoins')
    .then((mod) => mod.mirrorCoinSpend(cost, ref))
    .catch(() => {});
  return true;
}

/**
 * Local coin credit (guest / optimistic UI).
 * Permanent IAP must go through the service-role edge grant — never a client mint RPC.
 */
export function grantXpCoins(amount: number, _ref?: string, _kind: 'run_award' | 'welcome' | 'iap_grant' = 'iap_grant'): number {
  const gain = Math.max(0, Math.floor(amount));
  if (gain <= 0) return 0;
  const profile = getXpProfile();
  saveXpProfile({ ...profile, coins: profile.coins + gain });
  return gain;
}

/** Replace local coin cache (cloud sync). */
export function setXpCoins(balance: number): void {
  const next = Math.max(0, Math.floor(balance));
  const profile = getXpProfile();
  if (profile.coins === next) return;
  saveXpProfile({ ...profile, coins: next });
}

export function getXpProgress(): LevelProgress {
  return progressFromTotalXp(getXpProfile().totalXp);
}

export function getXpCoins(): number {
  return getXpProfile().coins;
}

export function hasAwardedXpRun(runRef: string): boolean {
  if (!runRef) return true;
  return getXpProfile().awardedRunRefs.includes(runRef);
}

export function saveXpProfile(profile: XpProfile): XpProfile {
  migrateLegacyLiveProfileIntoGuestMap();
  const next = sanitizeProfile(profile);
  writeJson(XP_PROFILE_KEY, next);
  const owner = readOwner();
  const map = readProfileMap();
  map[owner] = next;
  writeProfileMap(map);
  emitChanged();
  return next;
}

/** Apply lifetime XP + coins after a unique Classic run. */
export function applyXpAward(input: {
  runRef: string;
  xp: number;
  coins: number;
}): {
  profile: XpProfile;
  fromLevel: number;
  toLevel: number;
  fromTotalXp: number;
  toTotalXp: number;
  coinsBefore: number;
  coinsAfter: number;
  leveledUp: boolean;
} | null {
  const runRef = input.runRef.trim();
  if (!runRef) return null;
  const profile = getXpProfile();
  if (profile.awardedRunRefs.includes(runRef)) return null;

  const from = progressFromTotalXp(profile.totalXp);
  const xpGain = Math.max(0, Math.floor(input.xp));
  const coinGain = Math.max(0, Math.floor(input.coins));
  const next: XpProfile = {
    version: 1,
    totalXp: profile.totalXp + xpGain,
    coins: profile.coins + coinGain,
    awardedRunRefs: [...profile.awardedRunRefs, runRef].slice(-AWARDED_RUN_CAP),
  };
  saveXpProfile(next);
  const to = progressFromTotalXp(next.totalXp);
  return {
    profile: next,
    fromLevel: from.level,
    toLevel: to.level,
    fromTotalXp: profile.totalXp,
    toTotalXp: next.totalXp,
    coinsBefore: profile.coins,
    coinsAfter: next.coins,
    leveledUp: to.level > from.level,
  };
}

function sanitizeReveal(raw: unknown): PendingXpReveal | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : '';
  const runRef = typeof o.runRef === 'string' ? o.runRef : '';
  if (!id || !runRef) return null;
  const fromLevel = Math.max(XP_STARTING_LEVEL, Math.floor(Number(o.fromLevel) || XP_STARTING_LEVEL));
  const toLevel = Math.max(fromLevel, Math.floor(Number(o.toLevel) || fromLevel));
  return {
    id,
    runRef,
    fromLevel,
    toLevel,
    fromTotalXp: Math.max(0, Math.floor(Number(o.fromTotalXp) || 0)),
    toTotalXp: Math.max(0, Math.floor(Number(o.toTotalXp) || 0)),
    xpFromRun: Math.max(0, Math.floor(Number(o.xpFromRun) || 0)),
    coinsFromRun: Math.max(0, Math.floor(Number(o.coinsFromRun) || 0)),
    coinsBefore: Math.max(0, Math.floor(Number(o.coinsBefore) || 0)),
    coinsAfter: Math.max(0, Math.floor(Number(o.coinsAfter) || 0)),
    createdAt: Math.max(0, Number(o.createdAt) || Date.now()),
  };
}

function sanitizeReveals(raw: unknown): PendingXpReveal[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeReveal).filter((x): x is PendingXpReveal => Boolean(x)).slice(-20);
}

/** Migrate old level-up-only queue into full reveals once. */
function migrateLegacyPending(): PendingXpReveal[] {
  const legacy = readJson(XP_PENDING_LEVELUPS_KEY);
  if (!Array.isArray(legacy) || legacy.length === 0) return [];
  const migrated = legacy
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const runRef = typeof o.runRef === 'string' ? o.runRef : '';
      if (!runRef) return null;
      const fromLevel = Math.max(XP_STARTING_LEVEL, Math.floor(Number(o.fromLevel) || XP_STARTING_LEVEL));
      const toLevel = Math.max(fromLevel, Math.floor(Number(o.toLevel) || fromLevel));
      const xpFromRun = Math.max(0, Math.floor(Number(o.xpFromRun) || 0));
      const coinsFromRun = Math.max(0, Math.floor(Number(o.coinsFromRun) || 0));
      return {
        id: typeof o.id === 'string' ? o.id : `xp_${runRef}`,
        runRef,
        fromLevel,
        toLevel,
        fromTotalXp: 0,
        toTotalXp: xpFromRun,
        xpFromRun,
        coinsFromRun,
        coinsBefore: 0,
        coinsAfter: coinsFromRun,
        createdAt: Math.max(0, Number(o.createdAt) || Date.now()),
      } satisfies PendingXpReveal;
    })
    .filter((x): x is PendingXpReveal => Boolean(x));
  if (migrated.length) {
    writeJson(XP_PENDING_REVEALS_KEY, migrated);
    writeJson(XP_PENDING_LEVELUPS_KEY, []);
  }
  return migrated;
}

export function getPendingXpReveals(): PendingXpReveal[] {
  const current = sanitizeReveals(readJson(XP_PENDING_REVEALS_KEY));
  if (current.length > 0) return current;
  return migrateLegacyPending();
}

/** @deprecated */
export function getPendingLevelUps(): PendingXpReveal[] {
  return getPendingXpReveals();
}

export function enqueuePendingXpReveal(
  item: Omit<PendingXpReveal, 'id' | 'createdAt'> & { id?: string },
): void {
  const list = getPendingXpReveals();
  if (list.some((x) => x.runRef === item.runRef)) return;
  const next: PendingXpReveal = {
    id: item.id ?? `xp_${item.runRef}`,
    runRef: item.runRef,
    fromLevel: item.fromLevel,
    toLevel: item.toLevel,
    fromTotalXp: item.fromTotalXp,
    toTotalXp: item.toTotalXp,
    xpFromRun: item.xpFromRun,
    coinsFromRun: item.coinsFromRun,
    coinsBefore: item.coinsBefore,
    coinsAfter: item.coinsAfter,
    createdAt: Date.now(),
  };
  writeJson(XP_PENDING_REVEALS_KEY, [...list, next].slice(-20));
  emitChanged();
}

/** @deprecated */
export function enqueuePendingLevelUp(
  item: Omit<PendingXpReveal, 'id' | 'createdAt' | 'fromTotalXp' | 'toTotalXp' | 'coinsBefore' | 'coinsAfter'> & {
    id?: string;
    fromTotalXp?: number;
    toTotalXp?: number;
    coinsBefore?: number;
    coinsAfter?: number;
  },
): void {
  enqueuePendingXpReveal({
    ...item,
    fromTotalXp: item.fromTotalXp ?? 0,
    toTotalXp: item.toTotalXp ?? item.xpFromRun,
    coinsBefore: item.coinsBefore ?? 0,
    coinsAfter: item.coinsAfter ?? item.coinsFromRun,
  });
}

export function consumePendingXpReveal(id: string): PendingXpReveal | null {
  const list = getPendingXpReveals();
  const hit = list.find((x) => x.id === id) ?? null;
  if (!hit) return null;
  writeJson(
    XP_PENDING_REVEALS_KEY,
    list.filter((x) => x.id !== id),
  );
  emitChanged();
  return hit;
}

/** @deprecated */
export function consumePendingLevelUp(id: string): PendingXpReveal | null {
  return consumePendingXpReveal(id);
}

export function clearPendingXpReveals(): void {
  writeJson(XP_PENDING_REVEALS_KEY, []);
  writeJson(XP_PENDING_LEVELUPS_KEY, []);
  emitChanged();
}

/** @deprecated */
export function clearPendingLevelUps(): void {
  clearPendingXpReveals();
}
