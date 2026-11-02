'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { USER_DATA_CLEARED_EVENT } from '@/lib/account/clearLocalUserData';
import { fetchMyBankBalance } from '@/lib/account/bankLeaderboardCloud';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { BANK_CHANGED_EVENT, getBankBalance, readBankPreview } from '@/lib/tradeup/bank';
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
 * freezing:
 *   - a failed or slow read never replaces the balance with something else; the last real server
 *     number stays up and the next check tries again;
 *   - an older response can never overwrite a newer one;
 *   - changes are re-checked several times, and the balance is polled while visible and on
 *     focus / visibility / reconnect.
 */
const store = {
  value: null as number | null,
  userId: null as string | null,
  started: 0,
  applied: 0,
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
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { userId?: unknown; balance?: unknown } | null;
    return raw && typeof raw.userId === 'string' && typeof raw.balance === 'number' ? { userId: raw.userId, balance: raw.balance } : null;
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

async function pull(): Promise<void> {
  const seq = ++store.started;
  let userId: string | null = null;
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    userId = data.session?.user?.id ?? null;
  } catch {
    return;
  }
  if (!userId) return;
  if (store.userId && store.userId !== userId) {
    // Another account signed in on this device: never show the previous player's Bank.
    store.value = null;
    store.applied = 0;
    emit();
  }
  store.userId = userId;
  const result = await fetchMyBankBalance();
  if (result.ok !== true || seq < store.applied) return;
  store.applied = seq;
  if (store.value !== result.balance) {
    store.value = result.balance;
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
  store.value = null;
  store.userId = null;
  store.applied = store.started;
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
  const cached = readCache();
  if (cached && store.value == null) {
    store.userId = cached.userId;
    store.value = cached.balance;
  }
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

/**
 * Bank balance to display. Signed-in players get the server ledger balance (shared, always
 * refreshing — see `store`); guests get the on-device total. Null until the first read.
 */
export function useBankBalance(permanent: boolean): number | null {
  const [local, setLocal] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const server = useSyncExternalStore(permanent ? subscribe : noop, permanent ? getServer : getNull, getNull);

  useEffect(() => setPreview(readBankPreview()), []);

  useEffect(() => {
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
  }, []);

  if (preview != null) return preview;
  // Signed in: only ever the server's number (never the device total, which can look frozen).
  return permanent ? server : local;
}
