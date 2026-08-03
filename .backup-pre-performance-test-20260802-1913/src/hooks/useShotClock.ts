import { useCallback, useEffect, useRef, useState } from 'react';
import { SHOT_CLOCK_SECONDS } from '../types';

interface UseShotClockOptions {
  active: boolean;
  onTimeout: () => void;
  resetKey: string | number;
}

export function useShotClock({ active, onTimeout, resetKey }: UseShotClockOptions) {
  const [secondsLeft, setSecondsLeft] = useState(SHOT_CLOCK_SECONDS);
  const startRef = useRef<number>(0);
  const firedRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    setSecondsLeft(SHOT_CLOCK_SECONDS);
    startRef.current = performance.now();
    firedRef.current = false;
  }, [resetKey]);

  useEffect(() => {
    if (!active) return;

    let frameId = 0;

    const tick = (now: number) => {
      const elapsed = (now - startRef.current) / 1000;
      const remaining = Math.max(0, SHOT_CLOCK_SECONDS - elapsed);
      setSecondsLeft(remaining);

      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        onTimeoutRef.current();
        return;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active, resetKey]);

  const pause = useCallback(() => {
    firedRef.current = true;
  }, []);

  return { secondsLeft, pause };
}
