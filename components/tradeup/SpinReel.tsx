'use client';

import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from 'react';

export type SpinStripItem = {
  label: string;
  background?: string;
  color?: string;
};

export interface SpinReelProps {
  /** Predetermined strip; last entry is the landing result. Empty = placeholder. */
  strip: SpinStripItem[];
  /** Increment to start a CSS spin toward the last strip item. */
  spinId: number;
  itemHeight: number;
  durationMs: number;
  reduceMotion?: boolean;
  /** Static label when not spinning (idle / held axis). */
  display?: string | null;
  displayStyle?: CSSProperties;
  className?: string;
  onLocked?: () => void;
}

/**
 * GPU-only reel: one React update to plant the strip, then CSS transform.
 * No per-frame setState.
 */
export const SpinReel = memo(function SpinReel({
  strip,
  spinId,
  itemHeight,
  durationMs,
  reduceMotion = false,
  display = null,
  displayStyle,
  className = '',
  onLocked,
}: SpinReelProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const lockedRef = useRef(false);
  const onLockedRef = useRef(onLocked);
  onLockedRef.current = onLocked;
  const spinIdRef = useRef(spinId);
  const timerRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    if (spinId <= 0 || strip.length < 2) return;

    lockedRef.current = false;
    spinIdRef.current = spinId;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = 0;
    }

    const targetY = -((strip.length - 1) * itemHeight);

    const finish = () => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      el.style.willChange = 'auto';
      el.style.animation = 'none';
      el.style.transform = `translate3d(0, ${targetY}px, 0)`;
      onLockedRef.current?.();
    };

    if (reduceMotion) {
      el.style.animation = 'none';
      el.style.transition = 'none';
      el.style.transform = `translate3d(0, ${targetY}px, 0)`;
      finish();
      return;
    }

    // Fast cruise for most of the duration, then a short hard stop.
    el.style.willChange = 'transform';
    el.style.transition = 'none';
    el.style.animation = 'none';
    el.style.transform = 'translate3d(0, 0, 0)';
    el.style.setProperty('--reel-to', `${targetY}px`);
    // Force style flush so the animation always starts from 0.
    void el.offsetHeight;

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        el.style.animation = `spin-reel-run ${durationMs}ms forwards`;
      });
    });

    // Failsafe if animationend is missed (tab background, etc.)
    timerRef.current = window.setTimeout(finish, durationMs + 40);

    const onEnd = (e: AnimationEvent) => {
      if (e.target !== el || e.animationName !== 'spin-reel-run') return;
      finish();
    };
    el.addEventListener('animationend', onEnd);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      el.removeEventListener('animationend', onEnd);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = 0;
      }
    };
  }, [spinId, strip, itemHeight, durationMs, reduceMotion]);

  const showStrip = spinId > 0 && strip.length > 0;
  const fallback = display ?? '—';

  return (
    <div
      className={`spin-reel${className ? ` ${className}` : ''}`}
      style={{ height: itemHeight }}
      aria-live="polite"
    >
      {showStrip ? (
        <div ref={stripRef} className="spin-reel__strip">
          {strip.map((item, i) => (
            <div
              key={`${spinId}-${i}`}
              className={`spin-reel__item${item.background ? ' is-colored' : ''}`}
              style={{
                height: itemHeight,
                ...(item.background
                  ? { background: item.background, color: item.color }
                  : undefined),
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="spin-reel__item spin-reel__item--static"
          style={{ height: itemHeight, ...displayStyle }}
        >
          {fallback}
        </div>
      )}
    </div>
  );
});

/** Build a short predetermined strip ending on `winner`. No blanks. */
export function buildSpinStrip(
  pool: string[],
  winner: string,
  length: number,
): string[] {
  const count = Math.max(2, length);
  const others = pool.filter((x) => x !== winner);
  const source = others.length > 0 ? others : [winner];
  const out: string[] = [];
  let guard = 0;
  while (out.length < count - 1 && guard < 64) {
    guard += 1;
    const pick = source[Math.floor(Math.random() * source.length)]!;
    if (out.length > 0 && pick === out[out.length - 1] && source.length > 1) {
      continue;
    }
    out.push(pick);
  }
  while (out.length < count - 1) {
    out.push(source[out.length % source.length]!);
  }
  out.push(winner);
  return out;
}

export function stripFromLabels(labels: string[]): SpinStripItem[] {
  return labels.map((label) => ({ label }));
}
