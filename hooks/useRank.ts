'use client';

import { useEffect, useState } from 'react';
import { fetchMyBankBalance } from '@/lib/account/bankLeaderboardCloud';
import { fetchMyRank } from '@/lib/account/earningsCloud';
import { BANK_CHANGED_EVENT, readBankPreview } from '@/lib/tradeup/bank';
import { rankForBank, type RankDef } from '@/lib/tradeup/rank/config';
import { localBankPeak } from '@/lib/tradeup/rank/local';

export interface RankState {
  rank: RankDef;
  /** Most Cash ever held in the Bank — what the rank is based on. */
  peak: number;
  /** False until a real value is known; render nothing rather than a placeholder rank. */
  ready: boolean;
}

/** Server credits land a moment after the event that announced them. */
const SERVER_REFRESH_MS = 1500;
const CACHE_KEY = 'oneb_rank_peak_cache_v1';

/** Last known peak per signed-in account, so the rank shows correctly on the first frame. */
function readCache(userId: string): number | null {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, unknown>;
    const v = all[userId];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, peak: number): void {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, number>;
    all[userId] = peak;
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
}

/**
 * Rank from the player's peak Bank balance. Signed-in players (`userId`) use server numbers only —
 * the ledger peak, or their server balance before that migration is live — never this device's
 * guest balance. Guests use this device. `balance` is the Bank balance already on screen.
 */
export function useRank(userId: string | null, balance: number | null): RankState {
  const preview = typeof window === 'undefined' ? null : readBankPreview();
  const [serverPeak, setServerPeak] = useState<number | null>(() =>
    userId && typeof window !== 'undefined' ? readCache(userId) : null,
  );

  useEffect(() => {
    if (!userId) {
      setServerPeak(null);
      return;
    }
    setServerPeak(readCache(userId));
    let cancelled = false;
    let timer = 0;
    const pull = async () => {
      const result = await fetchMyRank();
      let peak: number | null = result.ok ? result.data.peak : null;
      if (peak == null) {
        const bank = await fetchMyBankBalance();
        if (bank.ok === true) peak = bank.balance;
      }
      if (cancelled || peak == null) return;
      writeCache(userId, peak);
      setServerPeak(peak);
    };
    void pull();
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pull(), SERVER_REFRESH_MS);
    };
    window.addEventListener(BANK_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener(BANK_CHANGED_EVENT, onChange);
    };
  }, [userId]);

  let peak: number | null;
  if (preview != null) peak = preview;
  else if (userId) peak = serverPeak;
  else if (typeof window === 'undefined') peak = null;
  else peak = localBankPeak(balance ?? 0);

  return { rank: rankForBank(peak ?? 0), peak: peak ?? 0, ready: peak != null };
}
