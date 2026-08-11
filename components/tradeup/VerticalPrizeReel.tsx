'use client';

import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react';
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
import { cancelFrame, scheduleFrame } from '@/lib/tradeup/perf/rafClock';

export interface PrizeReelItem {
  id: string;
  label: string;
  background: string;
  color: string;
}

interface VerticalPrizeReelProps {
  items: PrizeReelItem[];
  targetId: string | null;
  spinToken: number;
  spinning: boolean;
  reduceMotion?: boolean;
  durationMs?: number;
  onSpinComplete?: () => void;
  ownAudio?: boolean;
  className?: string;
  style?: CSSProperties;
  compact?: boolean;
}

/** Enough copies that a multi-loop spin never scrolls past the strip into blank space. */
const COPIES = 11;
const MID_COPY = 5;

function indexOfId(items: PrizeReelItem[], id: string): number {
  const i = items.findIndex((it) => it.id === id);
  return i >= 0 ? i : 0;
}

function reelDriveEase(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  if (x < 0.14) {
    const u = x / 0.14;
    return 0.09 * u * u;
  }
  const u = (x - 0.14) / 0.86;
  return 0.09 + 0.91 * (1 - Math.pow(1 - u, 5));
}

function settleEase(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3.2);
}

/**
 * Vertical prize reel — always shows 3 filled rows (above / center / below).
 * Strip is long enough that spin travel never leaves empty space in the window.
 */
export const VerticalPrizeReel = memo(function VerticalPrizeReel({
  items,
  targetId,
  spinToken,
  spinning,
  reduceMotion = false,
  durationMs = 2400,
  onSpinComplete,
  ownAudio = true,
  className = '',
  style,
  compact = false,
}: VerticalPrizeReelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const cellHRef = useRef(compact ? 48 : 56);
  const rafRef = useRef(0);
  const runRef = useRef(0);
  const lastTickRef = useRef(-1);
  const completeRef = useRef(onSpinComplete);
  completeRef.current = onSpinComplete;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const strip = useMemo(() => {
    if (items.length === 0) return [] as PrizeReelItem[];
    const out: PrizeReelItem[] = [];
    for (let c = 0; c < COPIES; c += 1) {
      for (const item of items) {
        out.push(item);
      }
    }
    return out;
  }, [items]);

  const readCell = () => {
    const root = rootRef.current;
    if (!root) return cellHRef.current;
    const raw = getComputedStyle(root).getPropertyValue('--vpr-cell').trim();
    const parsed = Number.parseFloat(raw);
    const h =
      Number.isFinite(parsed) && parsed > 0
        ? parsed
        : compact
          ? 48
          : 56;
    cellHRef.current = h;
    return h;
  };

  const applyY = (y: number) => {
    offsetRef.current = y;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(0,${-y}px,0)`;
    }
  };

  /** Snap into the middle copy without a visible jump (identical neighbors). */
  const normalizeToMiddle = (y: number, cell: number, n: number) => {
    if (n <= 0 || cell <= 0) return y;
    const loop = n * cell;
    const mid = MID_COPY * loop;
    let next = y;
    while (next >= mid + loop) next -= loop;
    while (next < mid) next += loop;
    return next;
  };

  const yForIndex = (winner: number, cell: number, n: number, extraLoops = 0) =>
    (MID_COPY * n + winner + extraLoops * n) * cell;

  const parkOn = (id: string) => {
    const pool = itemsRef.current;
    if (pool.length === 0) return;
    const cell = readCell();
    const winner = indexOfId(pool, id);
    applyY(normalizeToMiddle(yForIndex(winner, cell, pool.length), cell, pool.length));
  };

  // Idle / landed: always park so 3 rows are filled around the focal item
  useLayoutEffect(() => {
    if (spinning || items.length === 0) return;
    const id = targetId ?? items[0]!.id;
    parkOn(id);
  }, [targetId, spinning, items, compact]);

  useLayoutEffect(() => {
    if (!spinning || items.length === 0) return;
    const pool = itemsRef.current;
    const n = pool.length;
    if (n === 0) return;

    const runId = ++runRef.current;
    const cell = readCell();
    const winner = indexOfId(pool, targetId ?? pool[0]!.id);
    const loopH = n * cell;

    // Start from a normalized middle position so travel stays inside the strip
    const start = normalizeToMiddle(offsetRef.current, cell, n);
    applyY(start);

    // Cap loops so end + overshoot stays within the last safe copy
    const maxLoops = Math.max(2, COPIES - MID_COPY - 2);
    const loops = Math.min(3 + Math.floor(Math.random() * 2), maxLoops);
    let end = yForIndex(winner, cell, n, loops);
    if (end - start < loopH * 2) end += loopH;
    // Hard clamp: never travel past strip (leave 1 copy margin + overshoot room)
    const maxEnd = (COPIES - 2) * loopH - cell * 0.5;
    if (end > maxEnd) {
      end = yForIndex(winner, cell, n, Math.max(2, maxLoops - 1));
    }

    if (reduceMotion) {
      applyY(normalizeToMiddle(end, cell, n));
      completeRef.current?.();
      return;
    }

    cancelFrame(rafRef.current);
    if (ownAudio) {
      startTicketSpinHum();
      hapticWheelStart();
    }
    lastTickRef.current = Math.floor(start / cell);
    const t0 = performance.now();
    const total = Math.max(1800, durationMs);
    const driveMs = total * 0.78;
    const settleMs = total * 0.22;
    const overshoot = cell * (0.14 + Math.random() * 0.08);
    const peak = Math.min(end + overshoot, maxEnd);
    let lastTickAt = 0;
    const track = trackRef.current;
    if (track) track.style.willChange = 'transform';

    const step = (now: number) => {
      if (runId !== runRef.current) return;
      const elapsed = now - t0;
      let y: number;

      if (elapsed < driveMs) {
        const t = elapsed / driveMs;
        y = start + (peak - start) * reelDriveEase(t);
      } else if (elapsed < total) {
        const t = (elapsed - driveMs) / settleMs;
        y = peak + (end - peak) * settleEase(t);
      } else {
        applyY(normalizeToMiddle(end, cell, n));
        if (track) track.style.willChange = 'auto';
        if (ownAudio) {
          stopTicketSpinHum();
          playWheelStopSound();
          hapticWheelStop();
        }
        completeRef.current?.();
        return;
      }

      applyY(y);

      const idx = Math.floor(y / cell);
      const speed =
        elapsed < driveMs * 0.55 ? 48 : elapsed < driveMs ? 70 : 110;
      if (idx !== lastTickRef.current && now - lastTickAt > speed) {
        lastTickRef.current = idx;
        lastTickAt = now;
        if (ownAudio) {
          hapticWheelTick(idx);
          playWheelTickSound();
        }
      }

      rafRef.current = scheduleFrame(step);
    };
    rafRef.current = scheduleFrame(step);
    return () => {
      cancelFrame(rafRef.current);
      if (track) track.style.willChange = 'auto';
    };
  }, [spinToken, spinning, targetId, reduceMotion, durationMs, ownAudio, items.length]);

  useEffect(
    () => () => {
      cancelFrame(rafRef.current);
    },
    [],
  );

  return (
    <div
      ref={rootRef}
      className={`vpr-reel${compact ? ' is-compact' : ''}${
        spinning ? ' is-spinning' : ''
      } ${className}`.trim()}
      style={
        {
          '--vpr-cell': compact ? '48px' : '56px',
          ...style,
        } as CSSProperties
      }
    >
      <div className="vpr-reel__window">
        <div className="vpr-reel__shade vpr-reel__shade--top" aria-hidden />
        <div className="vpr-reel__shade vpr-reel__shade--bot" aria-hidden />
        <div className="vpr-reel__glass" aria-hidden />
        <div className="vpr-reel__pointer" aria-hidden />
        <div ref={trackRef} className="vpr-reel__track">
          {strip.map((item, i) => (
            <div
              key={`${item.id}-${i}`}
              className="vpr-reel__cell"
              style={{ background: item.background, color: item.color }}
            >
              <span className="vpr-reel__label">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
