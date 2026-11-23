'use client';

import { useEffect, useState } from 'react';
import {
  getPendingXpReveals,
  getXpCoins,
  getXpProgress,
  XP_CHANGED_EVENT,
  type LevelProgress,
  type PendingXpReveal,
} from '@/lib/tradeup/xp';
import { progressFromTotalXp } from '@/lib/tradeup/xp/config';

const EMPTY_PROGRESS = progressFromTotalXp(0);

/**
 * XP/coins from localStorage — always start with empty defaults so SSR and the
 * first client paint match (avoids Next hydration text mismatches).
 */
export function useXpProfile() {
  const [progress, setProgress] = useState<LevelProgress>(EMPTY_PROGRESS);
  const [coins, setCoins] = useState(0);
  const [pendingReveals, setPendingReveals] = useState<PendingXpReveal[]>([]);

  useEffect(() => {
    const refresh = () => {
      setProgress(getXpProgress());
      setCoins(getXpCoins());
      setPendingReveals(getPendingXpReveals());
    };
    refresh();
    window.addEventListener(XP_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(XP_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return { progress, coins, pendingReveals, pending: pendingReveals };
}
