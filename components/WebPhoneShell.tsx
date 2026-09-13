'use client';

import { Capacitor } from '@capacitor/core';
import { useEffect, type ReactNode } from 'react';
import { applyFullMotionAttribute } from '@/lib/tradeup/motionPreference';

/**
 * Marks the document as native or web after Capacitor is available.
 * Does not letterbox or scale the app. Desktop/tablet CSS is scoped to
 * html[data-platform="web"] so the iOS binary keeps the phone layout.
 */
export function WebPhoneShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    document.documentElement.dataset.platform = native ? 'native' : 'web';
    document.documentElement.classList.remove('web-phone-host');
    document.documentElement.classList.toggle('web-phone-app', !native);
    if (!native) applyFullMotionAttribute(true);
  }, []);

  return <>{children}</>;
}
