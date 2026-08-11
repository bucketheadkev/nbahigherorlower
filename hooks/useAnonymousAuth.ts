'use client';

import { useEffect, useState } from 'react';
import { ensureAnonymousSession, type AuthReadyState } from '@/lib/supabase/auth';

/** Ensures anonymous Supabase auth once when the 1V1 flow mounts. */
export function useAnonymousAuth(): AuthReadyState {
  const [state, setState] = useState<AuthReadyState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const session = await ensureAnonymousSession();
        if (cancelled) return;
        setState({ status: 'ready', session, user: session.user });
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Could not sign in. Check your connection and try again.';
        setState({ status: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
