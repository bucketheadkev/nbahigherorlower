'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { USER_DATA_CLEARED_EVENT } from '@/lib/account/clearLocalUserData';
import { fetchMyBankBalance } from '@/lib/account/bankLeaderboardCloud';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  BANK_CHANGED_EVENT,
  bindOptimisticBankCredit,
  getBankBalance,
  readBankPreview,
} from '@/lib/tradeup/bank';
import {
  balanceFromCacheForUser,
  isBankAuthLoading,
  isBankPermanent,
  shouldUseGuestBank,
  type BankAuthStatus,
} from '@/lib/tradeup/bankDisplay';
import { CLASSIC_PROGRESS_EVENT } from '@/lib/tradeup/storage';

/**
 * Server credits can land well after the event that announced them (a run is recorded, an
 * achievement syncs, a trigger runs), so a change is re-checked on this schedule…
 */
const CHANGE_RECHECK_MS = [0, 1500, 4000, 10_000];
/** …and the balance is re-read on this interval while the app is visible, as a backstop. */
const POLL_MS = 20_000;
const CACHE_KEY = 'oneb_bank_server_cache_v1';

/**
 * One shared server balance for every screen (signed-in players). Rules that keep it from ever
 * freezing / flashing the wrong number:
 *   - a failed or slow read never replaces the balance with $0 / guest;
 *   - cache is applied only when cached.userId matches the live session user;
 *   - an older response can never overwrite a newer one;
 *   - account switches clear the prior balance before the next pull lands.
 */
const store = {
  value: null as number | null,
  userId: null as string | null,
  started: 0,
  applied: 0,
  /**
   * Optimistic floor after local trivia / rollover credits. Pull must not paint a
   * lower server balance until the ledger has caught up (otherwise Bank Money
   * looks stuck / snaps back after a $1B run or trivia win).
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

function readCache(): { userId: string; balance: number } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as {
      userId?: unknown;
      balance?: unknown;
    } | null;
    return raw && typeof raw.userId === 'string' && typeof raw.balance === 'number'
      ? { userId: raw.userId, balance: raw.balance }
      : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, balance: number) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, balance }));
  } catch {
    /* private mode */
  }
}

function clearDisplay(emitChange = true) {
  const changed = store.value != null || store.userId != null || store.floor != null;
  store.value = null;
  store.userId = null;
  store.floor = null;
  store.applied = store.started;
  if (changed && emitChange) emit();
}

/**
 * Instant Bank bump for signed-in players (trivia win, $1B rollover) while the
 * server ledger catches up. Guests ignore this — they use the local ledger path.
 */
function applyOptimisticBankCredit(amount: number): void {
  if (typeof window === 'undefined' || !(amount > 0)) return;
  if (!store.wired) wire();
  if (!store.userId) {
    // Session not known yet — still raise a floor from cache when available.
    const cached = readCache();
    if (cached) {
      store.userId = cached.userId;
      store.value = cached.balance + amount;
      store.floor = store.value;
      writeCache(cached.userId, store.value);
      emit();
    }
    return;
  }
  const base =
    store.value ??
    balanceFromCacheForUser(readCache(), store.userId) ??
    0;
  const next = base + Math.round(amount);
  store.value = next;
  store.floor = Math.max(store.floor ?? 0, next);
  writeCache(store.userId, next);
  emit();
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
    // Signed out: never keep another account's Bank on screen.
    clearDisplay(true);
    return;
  }

  if (store.userId && store.userId !== userId) {
    // Another account signed in on this device: never show the previous player's Bank.
    store.value = null;
    store.floor = null;
    store.applied = 0;
    emit();
  }
  store.userId = userId;

  // Only the matching account's cache may paint before the network returns.
  if (store.value == null) {
    const cachedBalance = balanceFromCacheForUser(readCache(), userId);
    if (cachedBalance != null) {
      store.value = cachedBalance;
      emit();
    }
  }

  const result = await fetchMyBankBalance();
  if (result.ok !== true || seq < store.applied) return;
  // Session may have changed while the request was in flight.
  if (store.userId !== userId) return;
  store.applied = seq;

  let next = result.balance;
  if (store.floor != null) {
    if (next >= store.floor) {
      // Server caught up to the optimistic credit.
      store.floor = null;
    } else {
      // Keep the higher optimistic number until the ledger posts.
      next = store.floor;
    }
  }

  if (store.value !== next) {
    store.value = next;
    emit();
  }
  writeCache(userId, result.balance);
}

function recheckSoon() {
  store.burst.forEach((t) => window.clearTimeout(t));
  store.burst = CHANGE_RECHECK_MS.map((ms) => window.setTimeout(() => void pull(), ms));
}

const onVisible = () => {
  if (document.visibilityState === 'visible') void pull();
};
const onFocus = () => void pull();
/** Signed out / data deleted on this device: forget the old balance before anyone else signs in. */
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
  // Do not hydrate from cache here — userId is unknown until pull().
  bindOptimisticBankCredit(applyOptimisticBankCredit);
  window.addEventListener(BANK_CHANGED_EVENT, recheckSoon);
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
  window.removeEventListener(BANK_CHANGED_EVENT, recheckSoon);
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
const getServer = () => store.value;
const getNull = () => null;

export type { BankAuthStatus };

/**
 * Bank balance to display.
 * - Auth still loading / unavailable → null (never guest, never forced $0).
 * - Permanent → server ledger (cache only when userId matches).
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
  // Subscribe whenever we may need the server number (permanent, or loading so a
  // cold signed-in launch can hydrate the matching cache as soon as the session is known).
  const subscribeServer = permanent || authLoading;
  const server = useSyncExternalStore(
    subscribeServer ? subscribe : noop,
    subscribeServer ? getServer : getNull,
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

  // Permanent account (or switch): refresh so cache/userId stay aligned.
  useEffect(() => {
    if (permanent) void pull();
    if (!permanent && !authLoading) {
      // Left a permanent session — drop server display; guest path uses local.
      // Keep store for a later sign-in; pull() will mismatch-clear if needed.
    }
  }, [permanent, authLoading]);

  if (preview != null) return preview;
  // Auth unresolved: never guest, never a leftover account's Bank, never forced $0.
  if (authLoading) return null;
  if (permanent) return server;
  return local;
}
