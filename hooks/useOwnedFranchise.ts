'use client';

import { useEffect, useState } from 'react';
import { fetchFranchises } from '@/lib/account/franchiseCloud';
import { isFranchisePreview } from '@/lib/account/franchisePreview';
import { BANK_CHANGED_EVENT } from '@/lib/tradeup/bank';

const CACHE_KEY = 'oneb_owned_franchise_v1';

function readCache(userId: string): string | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { userId?: string; teamId?: string | null } | null;
    return parsed?.userId === userId && typeof parsed.teamId === 'string' ? parsed.teamId : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, teamId: string | null): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, teamId }));
  } catch {
    /* private mode */
  }
}

/**
 * The franchise the signed-in player owns, from the server (so it follows the account across
 * devices). The last answer is cached per account so the home button is right on first paint;
 * buying or selling (BANK_CHANGED_EVENT) and `refreshKey` changes ask the server again.
 */
export function useOwnedFranchise(userId: string | null, refreshKey?: unknown): string | null {
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    const preview = isFranchisePreview();
    const key = userId ?? (preview ? 'preview' : null);
    if (!key) {
      setTeamId(null);
      return;
    }
    let cancelled = false;
    if (!preview) setTeamId(readCache(key));
    const pull = async () => {
      const result = await fetchFranchises();
      if (cancelled || result.ok === false) return;
      const owned = result.data.owned?.teamId ?? null;
      setTeamId(owned);
      if (!preview) writeCache(key, owned);
    };
    void pull();
    const onChange = () => void pull();
    window.addEventListener(BANK_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(BANK_CHANGED_EVENT, onChange);
    };
  }, [userId, refreshKey]);

  return teamId;
}
