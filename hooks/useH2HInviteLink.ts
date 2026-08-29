'use client';

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { parseH2HInviteUrl, readJoinCodeFromLocation } from '@/lib/multiplayer/h2hInvite';

/**
 * Watches for H2H invite deep links (?join=CODE, pickfive://join/CODE)
 * and notifies when a room code should be consumed.
 */
export function useH2HInviteLink(onInviteCode: (code: string) => void): void {
  const handlerRef = useRef(onInviteCode);
  handlerRef.current = onInviteCode;
  const consumedLaunch = useRef(false);

  useEffect(() => {
    const fromLocation = readJoinCodeFromLocation();
    if (fromLocation) {
      handlerRef.current(fromLocation);
      if (typeof window !== 'undefined') {
        const clean = new URL(window.location.href);
        clean.searchParams.delete('join');
        clean.searchParams.delete('code');
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

        if (!consumedLaunch.current) {
          consumedLaunch.current = true;
          const launch = await App.getLaunchUrl();
          if (launch?.url) {
            const code = parseH2HInviteUrl(launch.url);
            if (code) handlerRef.current(code);
          }
        }

        const handle = await App.addListener('appUrlOpen', (event) => {
          const code = parseH2HInviteUrl(event.url);
          if (code) handlerRef.current(code);
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
