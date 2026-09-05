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
  strip: SpinStripItem[];
  spinId: number;
  itemHeight: number;
  durationMs: number;
  reduceMotion?: boolean;
  display?: string | null;
  displayStyle?: CSSProperties;
  className?: string;
  onLocked?: () => void;
  /** Visible rows (odd). Default 3 = neighbors above/below center. */
  visibleRows?: number;
}

/**
 * Compact vertical reel — CSS transform only, no per-frame React updates.
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
  visibleRows = 3,
}: SpinReelProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const lockedRef = useRef(false);
  const onLockedRef = useRef(onLocked);
  onLockedRef.current = onLocked;
  const timerRef = useRef(0);

  const rows = visibleRows % 2 === 1 ? visibleRows : visibleRows + 1;
  const windowHeight = itemHeight * rows;
  const centerOffset = ((rows - 1) / 2) * itemHeight;

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
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = 0;
    }

    const targetY = centerOffset - (strip.length - 1) * itemHeight;

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

    el.style.willChange = 'transform';
    el.style.transition = 'none';
    el.style.animation = 'none';
    el.style.transform = `translate3d(0, ${centerOffset}px, 0)`;
    el.style.setProperty('--reel-from', `${centerOffset}px`);
    el.style.setProperty('--reel-to', `${targetY}px`);
    void el.offsetHeight;

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        el.style.animation = `spin-reel-run ${durationMs}ms forwards`;
      });
    });

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
  }, [spinId, strip, itemHeight, durationMs, reduceMotion, centerOffset]);

  const showStrip = spinId > 0 && strip.length > 0;
  const fallback = display ?? '—';
  const isEmpty = !showStrip && (fallback === '—' || !display);
  const isPlaceholder =
    !showStrip && (fallback === 'TEAM' || fallback === 'ERA' || fallback === '—');

  return (
    <div
      className={`spin-reel spin-reel--window${className ? ` ${className}` : ''}${
        showStrip ? ' is-spinning' : ''
      }${isEmpty || isPlaceholder ? ' is-empty' : ''}`}
      style={
        {
          height: windowHeight,
          ['--reel-item-h' as string]: `${itemHeight}px`,
        } as CSSProperties
      }
      aria-live="polite"
    >
      <div className="spin-reel__fade spin-reel__fade--top" aria-hidden />
      <div className="spin-reel__fade spin-reel__fade--bot" aria-hidden />
      <div className="spin-reel__center-line" aria-hidden />

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
          className={`spin-reel__item spin-reel__item--static${
            isPlaceholder ? ' is-placeholder' : ''
          }`}
          style={{
            height: itemHeight,
            marginTop: centerOffset,
            ...displayStyle,
          }}
        >
          {fallback}
        </div>
      )}
    </div>
  );
});

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
