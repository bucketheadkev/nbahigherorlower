'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RUN_BONUS_GOAL } from '@/lib/tradeup/bank';
import {
  fetchServerSurplus,
  openLocalSurplus,
  resolveLocalSurplus,
  resolveServerSurplus,
  type ServerSurplusResult,
  type SurplusChoice,
  type SurplusState,
} from '@/lib/tradeup/surplusSpin';

export type SurplusMode = 'loading' | 'local' | 'server' | 'error';

/** A just-submitted run can take a moment to be readable; look again before giving up. */
const NONE_RETRY_MS = [700, 1500];

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

interface Queued {
  choice: SurplusChoice;
  resolve: (state: SurplusState | null) => void;
}

/**
 * One run's surplus decision. Signed-in players use the server once their verified run
 * has landed; guests (or a server without the Surplus migration) use this device.
 * `ready` stays false until the account is known and, for signed-in players, the
 * run submit has finished. A tap that arrives before then is queued, not dropped.
 */
export function useSurplus(options: {
  runRef: string;
  runValue: number;
  permanent: boolean;
  ready: boolean;
  submitFailed?: boolean;
  /** Server-priced team value from the run submit, when known. */
  verifiedValue?: number | null;
}) {
  const { runRef, runValue, permanent, ready, submitFailed = false, verifiedValue = null } = options;
  const [mode, setMode] = useState<SurplusMode>('loading');
  const [state, setState] = useState<SurplusState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const modeRef = useRef<SurplusMode>('loading');
  const queuedRef = useRef<Queued | null>(null);

  const applyMode = useCallback((next: SurplusMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const load = useCallback(async () => {
    if (!ready) return;
    setError(null);
    if (!permanent) {
      setState(openLocalSurplus(runRef, runValue));
      applyMode('local');
      return;
    }
    applyMode('loading');
    let result: ServerSurplusResult = await fetchServerSurplus(runRef);
    for (const ms of NONE_RETRY_MS) {
      if (!(result.ok === true && result.state.status === 'none') || submitFailed) break;
      if (verifiedValue != null && verifiedValue <= RUN_BONUS_GOAL) break;
      await wait(ms);
      result = await fetchServerSurplus(runRef);
    }
    if (result.ok === false) {
      if (result.reason === 'unavailable') {
        setState(openLocalSurplus(runRef, runValue));
        applyMode('local');
      } else {
        setError('load');
        applyMode('error');
      }
      return;
    }
    if (result.state.status === 'none') {
      setError(
        submitFailed
          ? 'unverified'
          : verifiedValue != null && verifiedValue <= RUN_BONUS_GOAL
            ? 'below'
            : 'load',
      );
      applyMode('error');
      return;
    }
    setState(result.state);
    applyMode('server');
  }, [applyMode, permanent, ready, runRef, runValue, submitFailed, verifiedValue]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (choice: SurplusChoice): Promise<SurplusState | null> => {
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        if (modeRef.current === 'local') {
          const next = resolveLocalSurplus(runRef, choice);
          setState(next);
          return next;
        }
        if (modeRef.current === 'server') {
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
    [runRef],
  );

  // A queued tap runs as soon as the decision is available (or is released on error).
  useEffect(() => {
    const queued = queuedRef.current;
    if (!queued || mode === 'loading') return;
    queuedRef.current = null;
    if (mode === 'error') {
      busyRef.current = false;
      setBusy(false);
      queued.resolve(null);
      return;
    }
    void run(queued.choice).then(queued.resolve);
  }, [mode, run]);

  const choose = useCallback(
    async (choice: SurplusChoice): Promise<SurplusState | null> => {
      if (busyRef.current) return null;
      if (modeRef.current === 'loading') {
        busyRef.current = true;
        setBusy(true);
        return new Promise((resolve) => {
          queuedRef.current = { choice, resolve };
        });
      }
      return run(choice);
    },
    [run],
  );

  return { mode, state, busy, error, choose, retry: load };
}
