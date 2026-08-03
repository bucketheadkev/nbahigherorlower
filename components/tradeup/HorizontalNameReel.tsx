'use client';

import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import {
  hapticWheelStart,
  hapticWheelStop,
  hapticWheelTick,
} from '@/lib/tradeup/haptics';
import {
  playWheelStopSound,
  playWheelTickSound,
  startTicketSpinHum,
  stopTicketSpinHum,
} from '@/lib/tradeup/gameAudio';

export interface NameReelItem {
  id: string;
  label: string;
  background: string;
  color: string;
}

interface HorizontalNameReelProps {
  items: NameReelItem[];
  targetId: string | null;
  spinToken: number;
  spinning: boolean;
  reduceMotion?: boolean;
  durationMs?: number;
  compact?: boolean;
  variant?: 'team' | 'decade';
  onSpinComplete?: () => void;
  ownAudio?: boolean;
}

function easeOutQuint(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 5);
}

function indexOfId(items: NameReelItem[], id: string): number {
  const i = items.findIndex((it) => it.id === id);
  return i >= 0 ? i : 0;
}

/**
 * Big horizontal name reel — GPU transform only, stable cell width, clean ease-out.
 */
export function HorizontalNameReel({
  items,
  targetId,
  spinToken,
  spinning,
  reduceMotion = false,
  durationMs = 1200,
  compact = false,
  variant = 'team',
  onSpinComplete,
  ownAudio = true,
}: HorizontalNameReelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const cellWRef = useRef(compact ? 260 : 300);
  const rafRef = useRef(0);
  const runRef = useRef(0);
  const lastTickRef = useRef(-1);
  const completeRef = useRef(onSpinComplete);
  completeRef.current = onSpinComplete;

  const strip = useMemo(() => {
    if (items.length === 0) return [] as NameReelItem[];
    // 6 reps is enough drama without a huge DOM
    const reps: NameReelItem[] = [];
    for (let r = 0; r < 6; r += 1) reps.push(...items);
    return reps;
  }, [items]);

  const readCell = () => {
    const root = rootRef.current;
    if (!root) return cellWRef.current;
    const w = Math.max(
      compact ? 220 : 260,
      Math.min(root.clientWidth * 0.94, compact ? 280 : 340),
    );
    cellWRef.current = w;
    root.style.setProperty('--hn-cell', `${w}px`);
    return w;
  };

  const applyX = (x: number) => {
    offsetRef.current = x;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${-x}px,0,0)`;
    }
  };

  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Spin — layout effect so motion starts before paint (instant feel)
  useLayoutEffect(() => {
    if (!spinning || !targetId) return;
    const pool = itemsRef.current;
    if (pool.length === 0) return;
    const runId = ++runRef.current;
    const cell = readCell();
    const winner = indexOfId(pool, targetId);
    const landIndex = pool.length * 4 + winner;
    const start = offsetRef.current;
    let end = landIndex * cell;
    const minTravel = pool.length * 2 * cell;
    if (end - start < minTravel) {
      end = start + minTravel + winner * cell;
      const loops = Math.floor(end / (pool.length * cell));
      end = (loops * pool.length + winner) * cell;
    }

    if (reduceMotion) {
      applyX(end);
      completeRef.current?.();
      return;
    }

    cancelAnimationFrame(rafRef.current);
    if (ownAudio) {
      startTicketSpinHum();
      hapticWheelStart();
    }
    lastTickRef.current = Math.floor(start / cell);
    const t0 = performance.now();
    const dur = Math.max(750, durationMs);
    let lastTickAt = 0;

    const step = (now: number) => {
      if (runId !== runRef.current) return;
      const t = Math.min(1, (now - t0) / dur);
      const eased = easeOutQuint(t);
      const x = start + (end - start) * eased;
      applyX(x);

      const idx = Math.floor(x / cell);
      if (idx !== lastTickRef.current && now - lastTickAt > 48) {
        lastTickRef.current = idx;
        lastTickAt = now;
        if (ownAudio) {
          hapticWheelTick(idx);
          playWheelTickSound();
        }
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      applyX(end);
      if (ownAudio) {
        stopTicketSpinHum();
        playWheelStopSound();
        hapticWheelStop();
      }
      completeRef.current?.();
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [spinToken, spinning, targetId, reduceMotion, durationMs, ownAudio]);

  // Park when idle
  useLayoutEffect(() => {
    if (spinning || !targetId || items.length === 0) return;
    const cell = readCell();
    const winner = indexOfId(items, targetId);
    applyX((items.length * 2 + winner) * cell);
  }, [targetId, spinning, items, compact]);

  return (
    <div
      ref={rootRef}
      className={`hn-reel hn-reel--${variant}${compact ? ' is-compact' : ''}${
        spinning ? ' is-spinning' : ''
      }`}
      aria-label={variant === 'decade' ? 'Decade spinner' : 'Team spinner'}
      style={{ '--hn-cell': `${cellWRef.current}px` } as CSSProperties}
    >
      <div className="hn-reel__window">
        <div className="hn-reel__pointer" aria-hidden />
        <div ref={trackRef} className="hn-reel__track">
          {strip.map((item, i) => (
            <div
              key={`${item.id}-${i}`}
              className="hn-reel__cell"
              style={{
                background: item.background,
                color: item.color,
              }}
            >
              <strong className="hn-reel__label">{item.label}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
