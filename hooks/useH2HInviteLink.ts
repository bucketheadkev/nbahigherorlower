'use client';

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  parseH2HInviteUrl,
  persistPendingH2HJoinCode,
  readJoinCodeFromLocation,
} from '@/lib/multiplayer/h2hInvite';

/**
 * Watches for H2H invite links:
 * - https://…/join/CODE (Universal Links / web)
 * - ?join=CODE
 * - pickfive://join/CODE (legacy)
 * Persists the room code through splash / cold start.
 */
export function useH2HInviteLink(onInviteCode: (code: string) => void): void {
  const handlerRef = useRef(onInviteCode);
  handlerRef.current = onInviteCode;
  const consumedLaunch = useRef(false);

  useEffect(() => {
    const deliver = (code: string) => {
      persistPendingH2HJoinCode(code);
      handlerRef.current(code);
    };

    const fromLocation = readJoinCodeFromLocation();
    if (fromLocation) {
      deliver(fromLocation);
      if (typeof window !== 'undefined') {
        const clean = new URL(window.location.href);
        clean.searchParams.delete('join');
        clean.searchParams.delete('code');
        // Keep /join/CODE paths intact for refresh; only strip query params.
        window.history.replaceState({}, '', clean.pathname + clean.search + clean.hash);
      }
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | undefined;

    void (async () => {
      try {
        const { App } = await import('@capacitor/app');

        const deliver = (code: string) => {
          persistPendingH2HJoinCode(code);
          handlerRef.current(code);
        };

        if (!consumedLaunch.current) {
          consumedLaunch.current = true;
          const launch = await App.getLaunchUrl();
          if (launch?.url) {
            const code = parseH2HInviteUrl(launch.url);
            if (code) deliver(code);
          }
        }

        const handle = await App.addListener('appUrlOpen', (event) => {
          const code = parseH2HInviteUrl(event.url);
          if (code) deliver(code);
        });
        removeListener = () => {
          void handle.remove();
        };
      } catch {
        /* App plugin unavailable — ignore */
      }
    })();

    return () => {
      removeListener?.();
    };
  }, []);
}
