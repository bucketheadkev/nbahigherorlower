'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchServerSurplus,
  openLocalSurplus,
  resolveLocalSurplus,
  resolveServerSurplus,
  type SurplusChoice,
  type SurplusState,
} from '@/lib/tradeup/surplusSpin';

export type SurplusMode = 'loading' | 'local' | 'server' | 'error';

/**
 * One run's surplus decision. Signed-in players use the server once their verified run
 * has landed; guests (or a server without the Surplus migration) use this device.
 * `ready` stays false until the account is known and, for signed-in players, the
 * run submit has finished.
 */
export function useSurplus(options: {
  runRef: string;
  runValue: number;
  permanent: boolean;
  ready: boolean;
  submitFailed?: boolean;
}) {
  const { runRef, runValue, permanent, ready, submitFailed = false } = options;
  const [mode, setMode] = useState<SurplusMode>('loading');
  const [state, setState] = useState<SurplusState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (!ready) return;
    if (!permanent) {
      setMode('local');
      setState(openLocalSurplus(runRef, runValue));
      return;
    }
    setMode('loading');
    const result = await fetchServerSurplus(runRef);
    if (result.ok === false) {
      if (result.reason === 'unavailable') {
        setMode('local');
        setState(openLocalSurplus(runRef, runValue));
      } else {
        setMode('error');
        setError('load');
      }
      return;
    }
    if (result.state.status === 'none' && submitFailed) {
      setMode('error');
      setError('unverified');
      return;
    }
    setMode('server');
    setState(result.state);
  }, [permanent, ready, runRef, runValue, submitFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = useCallback(
    async (choice: SurplusChoice): Promise<SurplusState | null> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        if (mode === 'local') {
          const next = resolveLocalSurplus(runRef, choice);
          setState(next);
          return next;
        }
        if (mode === 'server') {
          const result = await resolveServerSurplus(runRef, choice);
          if (result.ok === false) {
            setError('resolve');
            return null;
          }
          setState(result.state);
          return result.state;
        }
        return null;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [mode, runRef],
  );

  return { mode, state, busy, error, choose, retry: load };
}
