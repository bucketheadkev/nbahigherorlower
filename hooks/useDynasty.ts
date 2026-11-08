'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { AccountAuthState } from '@/lib/account/accountAuth';
import { isDynastyPreview } from '@/lib/account/dynastyPreview';
import {
  fetchDynastyState,
  openChest,
  setFocusDynasty,
  signDynastyPlayer,
  spendChestKey,
  startChestUnlock,
  type ChestReveal,
  type DynastyFailure,
  type DynastyResult,
  type DynastySignResult,
  type DynastyState,
} from '@/lib/account/dynastyCloud';

export interface DynastySnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error';
  state: DynastyState | null;
  failure: DynastyFailure | null;
}

/**
 * One Dynasty Road state shared by every screen: a signing on the Classic results screen shows on
 * Dynasty Road without a reload. Keyed by account, so switching accounts never shows the last
 * player's collection.
 */
let owner: string | null = null;
let snap: DynastySnapshot = { status: 'idle', state: null, failure: null };
let seq = 0;
const listeners = new Set<() => void>();

function emit(next: DynastySnapshot) {
  snap = next;
  for (const fn of listeners) fn();
}

function setOwner(key: string | null) {
  if (key === owner) return;
  owner = key;
  seq += 1;
  inflight = null;
  emit({ status: 'idle', state: null, failure: null });
}

let inflight: { key: string; promise: Promise<void> } | null = null;

function load(key: string): Promise<void> {
  if (inflight && inflight.key === key) return inflight.promise;
  const mine = ++seq;
  emit({ ...snap, status: snap.state ? snap.status : 'loading', failure: null });
  const promise = fetchDynastyState().then((result) => {
    if (inflight?.promise === promise) inflight = null;
    if (mine !== seq || owner !== key) return;
    emit(result.ok ? { status: 'ready', state: result.data, failure: null } : { ...snap, status: snap.state ? 'ready' : 'error', failure: result.reason ?? 'error' });
  });
  inflight = { key, promise };
  return promise;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const read = () => snap;

/** Signed-in user id, or null for guests (Dynasty Road lives on the account, like the leaderboard). */
export function dynastyAccountKey(account: AccountAuthState): string | null {
  if (isDynastyPreview()) return 'dynasty-preview';
  return account.status === 'permanent' ? account.user.id : null;
}

/** `accountKey` is the signed-in user id (null for guests, who have no server collection). */
export function useDynasty(accountKey: string | null) {
  useEffect(() => {
    setOwner(accountKey);
    if (accountKey && snap.status === 'idle') void load(accountKey);
  }, [accountKey]);

  const current = useSyncExternalStore(subscribe, read, read);
  const live = accountKey != null && owner === accountKey ? current : { status: 'idle' as const, state: null, failure: null };

  const refresh = useCallback(() => {
    if (accountKey) void load(accountKey);
  }, [accountKey]);

  /** Applies the server's fresh state after any successful action; on a refusal, re-reads it. */
  const settle = useCallback(
    <T,>(result: DynastyResult<T>, stateOf: (data: T) => DynastyState): DynastyResult<T> => {
      if (owner !== accountKey) return result;
      if (result.ok) {
        seq += 1;
        inflight = null;
        emit({ status: 'ready', state: stateOf(result.data!), failure: null });
      } else if (result.reason !== 'network' && accountKey) {
        void load(accountKey);
      }
      return result;
    },
    [accountKey],
  );

  const sign = useCallback(
    async (clientRunId: string, collectionId: string, playerId: string): Promise<DynastyResult<DynastySignResult>> =>
      settle(await signDynastyPlayer(clientRunId, collectionId, playerId), (d) => d.state),
    [settle],
  );
  const startUnlock = useCallback(async (chestId: string) => settle(await startChestUnlock(chestId), (d) => d), [settle]);
  const spendKey = useCallback(
    async (chestId: string, requestId: string) => settle(await spendChestKey(chestId, requestId), (d) => d),
    [settle],
  );
  const open = useCallback(
    async (chestId: string): Promise<DynastyResult<{ state: DynastyState; reveal: ChestReveal }>> =>
      settle(await openChest(chestId), (d) => d.state),
    [settle],
  );
  const setFocus = useCallback(
    async (collectionId: string | null) => settle(await setFocusDynasty(collectionId), (d) => d),
    [settle],
  );

  return { ...live, refresh, sign, startUnlock, spendKey, open, setFocus };
}
