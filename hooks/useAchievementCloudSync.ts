'use client';

import { useEffect, useRef } from 'react';
import type { AccountAuthState } from '@/lib/account/accountAuth';
import {
  detachAchievementCloudCache,
  ensureAchievementCloudWriteListener,
} from '@/lib/account/achievementCloud';
import {
  detachClassicCloudCache,
  ensureClassicCloudWriteListener,
  reconcileClassicForPermanentUser,
} from '@/lib/account/classicCloud';
import {
  bindXpProfileOwner,
  detachXpProfileToGuest,
  syncCloudCoinsIntoLocal,
} from '@/lib/tradeup/xp';

/**
 * Permanent accounts: reconcile Classic PB/runs, bind per-account XP, sync server coins.
 * Achievement/challenge cloud sync and bank payouts are retired — local cache stays empty.
 * Guest + anonymous: local-only; detach restores guest Classic / XP slots on logout.
 */
export function useAchievementCloudSync(accountState: AccountAuthState): void {
  const prevStatus = useRef<AccountAuthState['status'] | null>(null);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    ensureClassicCloudWriteListener();
    // Keep the listener installed so guest writes stay tagged, but cloud upserts are no-ops.
    ensureAchievementCloudWriteListener();
  }, []);

  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = accountState.status;

    if (accountState.status === 'permanent') {
      const userId = accountState.user.id;
      if (lastUserId.current !== userId) {
        lastUserId.current = userId;
        // Isolate XP/coins before Classic reconcile so levels never leak across accounts.
        bindXpProfileOwner(userId);
        void (async () => {
          await reconcileClassicForPermanentUser(userId);
          // Challenges/achievements are retired — never upsert progress that could mint Bank cash.
          detachAchievementCloudCache();
          await syncCloudCoinsIntoLocal();
        })();
      }
      return;
    }

    lastUserId.current = null;

    if (prev === 'permanent' && accountState.status !== 'loading') {
      detachClassicCloudCache();
      detachAchievementCloudCache();
      detachXpProfileToGuest();
    }
  }, [accountState]);
}
