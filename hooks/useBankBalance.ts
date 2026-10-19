'use client';

import { useEffect, useState } from 'react';
import { USER_DATA_CLEARED_EVENT } from '@/lib/account/clearLocalUserData';
import { fetchMyBankBalance } from '@/lib/account/bankLeaderboardCloud';
import { BANK_CHANGED_EVENT, getBankBalance, readBankPreview } from '@/lib/tradeup/bank';
import { CLASSIC_PROGRESS_EVENT } from '@/lib/tradeup/storage';

/** Server credits land after the achievement sync debounce + trigger. */
const SERVER_REFRESH_MS = 1500;

/**
 * Bank balance to display. Signed-in players get the server ledger balance;
 * guests (or a server without the Bank migration) get the on-device total.
 * Null until the first read on the client.
 */
export function useBankBalance(permanent: boolean): number | null {
  const [local, setLocal] = useState<number | null>(null);
  const [server, setServer] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

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

  useEffect(() => {
    if (!permanent) {
      setServer(null);
      return;
    }
    let cancelled = false;
    let timer = 0;
    const pull = async () => {
      const result = await fetchMyBankBalance();
      if (cancelled) return;
      setServer(result.ok === true ? result.balance : null);
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
  }, [permanent]);

  return preview ?? server ?? local;
}
