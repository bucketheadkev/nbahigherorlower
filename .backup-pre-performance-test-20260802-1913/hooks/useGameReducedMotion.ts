'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  applyFullMotionAttribute,
  getPrefersReducedMotion,
  subscribeReducedMotion,
} from '@/lib/tradeup/motionPreference';

/**
 * Like Framer's useReducedMotion, but respects Trade Up full-motion override
 * (localhost / ?fullMotion=1) so Cursor preview matches phone/Chrome.
 */
export function useGameReducedMotion(): boolean {
  useEffect(() => {
    applyFullMotionAttribute();
  }, []);

  return useSyncExternalStore(
    subscribeReducedMotion,
    getPrefersReducedMotion,
    () => false,
  );
}
