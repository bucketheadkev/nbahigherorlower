'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  resolveAccountAuthState,
  type AccountAuthState,
} from '@/lib/account/accountAuth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * App-wide account state: guest / anonymous / permanent / needs_username / loading.
 * Anonymous Supabase JWTs are NOT treated as permanent 1B Run accounts.
 *
 * Important: never call getSession() synchronously inside onAuthStateChange —
 * Supabase's auth lock can reject with a bare Event ([object Event] in Next overlay).
 */
export function useAccountAuth(): {
  state: AccountAuthState;
  refresh: () => Promise<void>;
  setState: (next: AccountAuthState) => void;
} {
  const [state, setState] = useState<AccountAuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const next = await resolveAccountAuthState();
      setState(next);
    } catch (err) {
      console.warn('[account] refresh failed', err);
      setState({ status: 'guest' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let debounceId: number | null = null;

    const apply = () => {
      void (async () => {
        try {
          const next = await resolveAccountAuthState();
          if (!cancelled) setState(next);
        } catch (err) {
          console.warn('[account] resolve failed', err);
          if (!cancelled) setState({ status: 'guest' });
        }
      })();
    };

    apply();

    const supabase = getSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // Defer out of the auth callback lock before any getSession() work.
      if (debounceId != null) window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        debounceId = null;
        if (!cancelled) apply();
      }, 0);
    });

    return () => {
      cancelled = true;
      if (debounceId != null) window.clearTimeout(debounceId);
      subscription.unsubscribe();
    };
  }, []);

  return { state, refresh, setState };
}
