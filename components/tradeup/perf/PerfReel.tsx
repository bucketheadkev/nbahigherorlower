'use client';

import { memo, useImperativeHandle, useLayoutEffect, useRef, forwardRef } from 'react';
import { setPerfSpinnerItems } from '@/lib/tradeup/perf/perfMetrics';

export interface PerfReelItem {
  id: string;
  label: string;
  background: string;
  color: string;
}

export interface PerfReelHandle {
  spinTo: (targetId: string, durationMs?: number) => Promise<void>;
  parkOn: (targetId: string) => void;
}

interface PerfReelProps {
  items: PerfReelItem[];
  reps?: number;
  className?: string;
  enabled?: boolean;
}

function easeOutCubic(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

function indexOf(items: PerfReelItem[], id: string) {
  const i = items.findIndex((it) => it.id === id);
  return i >= 0 ? i : 0;
}

/**
 * Permanently-mounted horizontal reel.
 * Animates ONLY via translate3d on a ref — zero React state during motion.
 */
export const PerfReel = memo(
  forwardRef<PerfReelHandle, PerfReelProps>(function PerfReel(
    { items, reps = 4, className = '', enabled = true },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const trackRef = useRef<HTMLDivElement | null>(null);
    const offsetRef = useRef(0);
    const cellWRef = useRef(280);
    const rafRef = useRef(0);
    const runRef = useRef(0);
    const itemsRef = useRef(items);
    const enabledRef = useRef(enabled);
    itemsRef.current = items;
    enabledRef.current = enabled;

    const stripRef = useRef<PerfReelItem[]>([]);
    if (stripRef.current.length !== items.length * reps) {
      const next: PerfReelItem[] = [];
      for (let r = 0; r < reps; r += 1) next.push(...items);
      stripRef.current = next;
    }

    const applyX = (x: number) => {
      offsetRef.current = x;
      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(${-x}px,0,0)`;
      }
    };

    const parkOn = (targetId: string) => {
      const pool = itemsRef.current;
      const idx = indexOf(pool, targetId);
      const cell = cellWRef.current;
      applyX((pool.length + idx) * cell);
    };

    useLayoutEffect(() => {
      setPerfSpinnerItems(stripRef.current.length);
      const root = rootRef.current;
      if (!root) return;
      const w = Math.max(240, Math.min(root.clientWidth * 0.92, 320));
      cellWRef.current = w;
      root.style.setProperty('--perf-cell', `${w}px`);
      applyX(0);
    }, []);

    useImperativeHandle(ref, () => ({
      parkOn,
      spinTo(targetId: string, durationMs = 1100) {
        return new Promise<void>((resolve) => {
          if (!enabledRef.current || durationMs < 40) {
            parkOn(targetId);
            resolve();
            return;
          }
          const pool = itemsRef.current;
          const winner = indexOf(pool, targetId);
          const cell = cellWRef.current;
          const runId = ++runRef.current;
          cancelAnimationFrame(rafRef.current);

          const start = offsetRef.current;
          let end = (pool.length * 2 + winner) * cell;
          const minTravel = pool.length * cell;
          if (end - start < minTravel) {
            const loops = Math.ceil((start + minTravel) / (pool.length * cell));
            end = (loops * pool.length + winner) * cell;
          }

          if (trackRef.current) trackRef.current.style.willChange = 'transform';
          const t0 = performance.now();
          const dur = Math.max(600, durationMs);

          const step = (now: number) => {
            if (runId !== runRef.current) return;
            const t = Math.min(1, (now - t0) / dur);
            applyX(start + (end - start) * easeOutCubic(t));
            if (t < 1) {
              rafRef.current = requestAnimationFrame(step);
              return;
            }
            applyX(end);
            if (trackRef.current) trackRef.current.style.willChange = 'auto';
            resolve();
          };
          rafRef.current = requestAnimationFrame(step);
        });
      },
    }));

    useLayoutEffect(
      () => () => {
        cancelAnimationFrame(rafRef.current);
      },
      [],
    );

    return (
      <div ref={rootRef} className={`perf-reel ${className}`.trim()}>
        <div className="perf-reel__window">
          <div className="perf-reel__pointer" aria-hidden />
          <div ref={trackRef} className="perf-reel__track">
            {stripRef.current.map((item, i) => (
              <div
                key={`${item.id}-${i}`}
                className="perf-reel__cell"
                style={{ background: item.background, color: item.color }}
              >
                <span className="perf-reel__label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }),
);
