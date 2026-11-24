'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { USER_DATA_CLEARED_EVENT } from '@/lib/account/clearLocalUserData';
import { fetchMyBankBalance } from '@/lib/account/bankLeaderboardCloud';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  BANK_CHANGED_EVENT,
  bindOptimisticBankCredit,
  getBankBalance,
  getPermanentDeviceBankCredit,
  readBankPreview,
} from '@/lib/tradeup/bank';
import {
  isBankAuthLoading,
  isBankPermanent,
  shouldUseGuestBank,
  type BankAuthStatus,
} from '@/lib/tradeup/bankDisplay';
import { CLASSIC_PROGRESS_EVENT } from '@/lib/tradeup/storage';
import { flushPendingTriviaBonuses } from '@/lib/tradeup/trivia/bankTrivia';

/**
 * Server credits can land well after the event that announced them (a run is recorded, an
 * achievement syncs, a trigger runs), so a change is re-checked on this schedule…
 */
const CHANGE_RECHECK_MS = [0, 1500, 4000, 10_000];
/** …and the balance is re-read on this interval while the app is visible, as a backstop. */
const POLL_MS = 20_000;
const CACHE_KEY = 'oneb_bank_server_cache_v1';

type BankCache = { userId: string; balance: number; floor: number | null };

/**
 * One shared server balance for every screen (signed-in players). Rules that keep it from ever
 * freezing / flashing the wrong number:
 *   - a failed or slow read never replaces the balance with $0 / guest;
 *   - cache is applied only when cached.userId matches the live session user;
 *   - an older response can never overwrite a newer one;
 *   - account switches clear the prior balance before the next pull lands;
 *   - display = max(server + device-only local credit, persisted floor) so trivia /
 *     rollover actually stick until the server ledger catches up (or forever for trivia).
 */
const store = {
  /** Raw server ledger (never includes device-only trivia). */
  server: null as number | null,
  userId: null as string | null,
  started: 0,
  applied: 0,
  /**
   * Persisted floor after rollover (and any optimistic bump). Survives remount.
   * Cleared only when server + device credit has caught up.
   */
  floor: null as number | null,
  listeners: new Set<() => void>(),
  burst: [] as number[],
  poll: 0,
  wired: false,
};

function emit() {
  store.listeners.forEach((fn) => fn());
}

function readCache(): BankCache | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as {
      userId?: unknown;
      balance?: unknown;
      floor?: unknown;
    } | null;
    if (!raw || typeof raw.userId !== 'string' || typeof raw.balance !== 'number') return null;
    const floor =
      typeof raw.floor === 'number' && Number.isFinite(raw.floor) ? Math.round(raw.floor) : null;
    return { userId: raw.userId, balance: raw.balance, floor };
  } catch {
    return null;
  }
}

function writeCache(userId: string, balance: number, floor: number | null = store.floor) {
  try {
    const payload: BankCache = { userId, balance, floor };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
}

/** Permanent Bank Money shown in UI (server + device trivia, floored through rollover). */
function displayBalance(): number | null {
  if (store.server == null && store.floor == null) return null;
  const server = store.server ?? 0;
  const device = getPermanentDeviceBankCredit();
  const base = Math.max(0, server + device);
  if (store.floor != null) return Math.max(base, store.floor);
  return base;
}

function clearDisplay(emitChange = true) {
  const changed = store.server != null || store.userId != null || store.floor != null;
  store.server = null;
  store.userId = null;
  store.floor = null;
  store.applied = store.started;
  if (changed && emitChange) emit();
}

/**
 * Instant Bank bump for signed-in players (trivia win, $1B rollover).
 * Raises a persisted floor so remount / server lag cannot erase the credit.
 */
function applyOptimisticBankCredit(amount: number): void {
  if (typeof window === 'undefined' || !(amount > 0)) return;
  if (!store.wired) wire();
  const bump = Math.round(amount);
  if (!store.userId) {
    const cached = readCache();
    if (cached) {
      store.userId = cached.userId;
      store.server = cached.balance;
      store.floor = cached.floor;
    }
  }
  const current = displayBalance() ?? store.server ?? 0;
  const next = current + bump;
  store.floor = Math.max(store.floor ?? 0, next);
  if (store.userId) writeCache(store.userId, store.server ?? 0, store.floor);
  emit();
}

function maybeClearFloor(serverBalance: number): void {
  if (store.floor == null) return;
  const caughtUp = serverBalance + getPermanentDeviceBankCredit() >= store.floor;
  if (caughtUp) store.floor = null;
}

async function pull(): Promise<void> {
  const seq = ++store.started;
  let userId: string | null = null;
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    userId = data.session?.user?.id ?? null;
  } catch {
    return;
  }

  if (!userId) {
    clearDisplay(true);
    return;
  }

  if (store.userId && store.userId !== userId) {
    store.server = null;
    store.floor = null;
    store.applied = 0;
    emit();
  }
  store.userId = userId;

  if (store.server == null) {
    const cached = readCache();
    if (cached && cached.userId === userId) {
      store.server = cached.balance;
      if (store.floor == null && cached.floor != null) store.floor = cached.floor;
      emit();
    }
  } else if (store.floor == null) {
    const cached = readCache();
    if (cached && cached.userId === userId && cached.floor != null) {
      store.floor = cached.floor;
      emit();
    }
  }

  // Push on-device trivia credits to the server ledger before reading bank_total
  // so Home and Leaderboard converge on one authoritative balance.
  try {
    await flushPendingTriviaBonuses();
  } catch {
    /* network — still pull whatever the server already has */
  }

  const result = await fetchMyBankBalance();
  if (result.ok !== true || seq < store.applied) return;
  if (store.userId !== userId) return;
  store.applied = seq;

  store.server = result.balance;
  maybeClearFloor(result.balance);
  writeCache(userId, result.balance, store.floor);
  emit();
}

function onBankChanged() {
  // Trivia / local ledger updates must refresh permanent display immediately
  // (device credit is read inside displayBalance).
  emit();
  recheckSoon();
}

function recheckSoon() {
  store.burst.forEach((t) => window.clearTimeout(t));
  store.burst = CHANGE_RECHECK_MS.map((ms) => window.setTimeout(() => void pull(), ms));
}

const onVisible = () => {
  if (document.visibilityState === 'visible') void pull();
};
const onFocus = () => void pull();
const onCleared = () => {
  clearDisplay(false);
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* private mode */
  }
  emit();
  void pull();
};

function wire() {
  if (store.wired) return;
  store.wired = true;
  bindOptimisticBankCredit(applyOptimisticBankCredit);
  window.addEventListener(BANK_CHANGED_EVENT, onBankChanged);
  window.addEventListener(CLASSIC_PROGRESS_EVENT, recheckSoon);
  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onFocus);
  window.addEventListener(USER_DATA_CLEARED_EVENT, onCleared);
  document.addEventListener('visibilitychange', onVisible);
  store.poll = window.setInterval(() => {
    if (document.visibilityState === 'visible') void pull();
  }, POLL_MS);
  void pull();
}

function unwire() {
  if (!store.wired) return;
  store.wired = false;
  bindOptimisticBankCredit(null);
  window.removeEventListener(BANK_CHANGED_EVENT, onBankChanged);
  window.removeEventListener(CLASSIC_PROGRESS_EVENT, recheckSoon);
  window.removeEventListener('focus', onFocus);
  window.removeEventListener('online', onFocus);
  window.removeEventListener(USER_DATA_CLEARED_EVENT, onCleared);
  document.removeEventListener('visibilitychange', onVisible);
  window.clearInterval(store.poll);
  store.burst.forEach((t) => window.clearTimeout(t));
  store.burst = [];
}

function subscribe(listener: () => void): () => void {
  store.listeners.add(listener);
  wire();
  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) unwire();
  };
}

const noop = () => () => {};
const getDisplay = () => displayBalance();
const getNull = () => null;

export type { BankAuthStatus };

/**
 * Bank balance to display.
 * - Auth still loading / unavailable → null (never guest, never forced $0).
 * - Permanent → server ledger + device-only credits (trivia), floored through rollover.
 * - Guest / anonymous → on-device total once auth has resolved.
 */
export function useBankBalance(
  permanentOrStatus: boolean | BankAuthStatus,
): number | null {
  const status: BankAuthStatus =
    typeof permanentOrStatus === 'boolean'
      ? permanentOrStatus
        ? 'permanent'
        : 'guest'
      : permanentOrStatus;

  const authLoading = isBankAuthLoading(status);
  const permanent = isBankPermanent(status);
  const useGuest = shouldUseGuestBank(status);

  const [local, setLocal] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const subscribeServer = permanent || authLoading;
  const serverDisplay = useSyncExternalStore(
    subscribeServer ? subscribe : noop,
    subscribeServer ? getDisplay : getNull,
    getNull,
  );

  useEffect(() => setPreview(readBankPreview()), []);

  useEffect(() => {
    if (!useGuest) {
      setLocal(null);
      return;
    }
    const refresh = () => setLocal(getBankBalance());
    refresh();
    window.addEventListener(BANK_CHANGED_EVENT, refresh);
    window.addEventListener(USER_DATA_CLEARED_EVENT, refresh);
    window.addEventListener(CLASSIC_PROGRESS_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(BANK_CHANGED_EVENT, refresh);
      window.removeEventListener(USER_DATA_CLEARED_EVENT, refresh);
      window.removeEventListener(CLASSIC_PROGRESS_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [useGuest]);

  useEffect(() => {
    if (permanent) void pull();
  }, [permanent, authLoading]);

  if (preview != null) return preview;
  if (authLoading) return null;
  if (permanent) return serverDisplay;
  return local;
}
