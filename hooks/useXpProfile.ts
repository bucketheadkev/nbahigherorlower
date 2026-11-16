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

export function useXpProfile() {
  const [progress, setProgress] = useState<LevelProgress>(() => getXpProgress());
  const [coins, setCoins] = useState(() => getXpCoins());
  const [pendingReveals, setPendingReveals] = useState<PendingXpReveal[]>(() => getPendingXpReveals());

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
