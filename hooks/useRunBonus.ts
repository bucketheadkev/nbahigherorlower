'use client';

import { useEffect, useState } from 'react';
import { fetchRunBonus } from '@/lib/account/runBonusCloud';
import type { RunBonusId } from '@/lib/tradeup/runBonuses';
import { getLocalRunBonus } from '@/lib/tradeup/runBonusLocal';

export interface ActiveRunBonus {
  bonusId: RunBonusId;
  /** Signed-in bonuses are judged by the server; guest bonuses on this device. */
  mode: 'server' | 'local';
}

/**
 * The Run Bonus for the Classic run about to be played. Signed-in players get the server's
 * assignment (guests, or a server without the migration, use this device). Null while loading.
 */
export function useRunBonus(enabled: boolean, permanent: boolean | null): ActiveRunBonus | null {
  const [bonus, setBonus] = useState<ActiveRunBonus | null>(null);

  useEffect(() => {
    if (!enabled || permanent === null) return;
    let cancelled = false;
    const local = () => {
      const open = getLocalRunBonus();
      if (!cancelled && open) setBonus({ bonusId: open.bonusId, mode: 'local' });
    };
    if (!permanent) {
      local();
      return;
    }
    void fetchRunBonus().then((result) => {
      if (cancelled) return;
      if (result.ok && result.assignment) setBonus({ bonusId: result.assignment.bonusId, mode: 'server' });
      else if (result.ok === false && result.reason === 'unavailable') local();
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, permanent]);

  return bonus;
}
