'use client';

import { useEffect, useRef } from 'react';
import type { AccountAuthState } from '@/lib/account/accountAuth';
import {
  detachAchievementCloudCache,
  ensureAchievementCloudWriteListener,
  reconcileAchievementsForPermanentUser,
} from '@/lib/account/achievementCloud';
import {
  detachClassicCloudCache,
  ensureClassicCloudWriteListener,
  reconcileClassicForPermanentUser,
} from '@/lib/account/classicCloud';

/**
 * Permanent accounts: reconcile Classic PB/runs then achievements.
 * Guest + anonymous: local-only; detach restores guest Classic snapshot on logout.
 */
export function useAchievementCloudSync(accountState: AccountAuthState): void {
  const prevStatus = useRef<AccountAuthState['status'] | null>(null);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    ensureClassicCloudWriteListener();
    ensureAchievementCloudWriteListener();
  }, []);

  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = accountState.status;

    if (accountState.status === 'permanent') {
      const userId = accountState.user.id;
      if (lastUserId.current !== userId) {
        lastUserId.current = userId;
        void (async () => {
          // Classic first so achievement materialize sees migrated PB/runs.
          await reconcileClassicForPermanentUser(userId);
          await reconcileAchievementsForPermanentUser(userId);
        })();
      }
      return;
    }

    lastUserId.current = null;

    if (prev === 'permanent' && accountState.status !== 'loading') {
      detachClassicCloudCache();
      detachAchievementCloudCache();
    }
  }, [accountState]);
}
