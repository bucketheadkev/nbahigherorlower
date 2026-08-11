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
import { qualityAllows } from '@/lib/tradeup/perf/adaptiveQuality';
import { getDiagnosticFlags } from '@/lib/tradeup/perf/diagnosticMode';
import {
  cancelFrame,
  easeOutQuint,
  scheduleFrame,
} from '@/lib/tradeup/perf/rafClock';
import { setMetricsAnimating } from '@/lib/tradeup/perf/frameMetrics';

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
  /** CSS custom props for decade color without remounting cells */
  style?: CSSProperties;
  className?: string;
}

function indexOfId(items: NameReelItem[], id: string): number {
  const i = items.findIndex((it) => it.id === id);
  return i >= 0 ? i : 0;
}

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

/**
 * Horizontal name reel — ONE copy of each item, wrap via modulo translate.
 * Animates only with translate3d on the track (no per-frame React state).
 * Mounts N cells (teams≈30 / decades≈7), not N×reps.
 */
export const HorizontalNameReel = memo(function HorizontalNameReel({
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
  style,
  className = '',
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
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const plain = getDiagnosticFlags().plainTextSpinners;

  const strip = useMemo(() => items, [items]);

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

  const applyVisualX = (logicalX: number) => {
    offsetRef.current = logicalX;
    const track = trackRef.current;
    if (!track) return;
    const loop = Math.max(1, itemsRef.current.length) * cellWRef.current;
    const visual = mod(logicalX, loop);
    track.style.transform = `translate3d(${-visual}px,0,0)`;
  };

  useLayoutEffect(() => {
    if (!spinning || !targetId) return;
    const pool = itemsRef.current;
    if (pool.length === 0) return;
    const runId = ++runRef.current;
    const cell = readCell();
    const winner = indexOfId(pool, targetId);
    const loopW = pool.length * cell;
    const start = offsetRef.current;
    // Travel ≥ 2 full loops then land on winner
    const minTravel = loopW * 2 + winner * cell;
    let end = start + minTravel;
    // Snap end so visual land == winner (modulo)
    const endMod = mod(end, loopW);
    const wantMod = winner * cell;
    end += wantMod - endMod;
    if (end - start < minTravel) end += loopW;

    if (reduceMotion || getDiagnosticFlags().staticOnly) {
      applyVisualX(end);
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
    const dur = Math.max(750, durationMs);
    let lastTickAt = 0;
    const track = trackRef.current;
    if (track) track.style.willChange = 'transform';
    setMetricsAnimating(true);

    const step = (now: number) => {
      if (runId !== runRef.current) return;
      const t = Math.min(1, (now - t0) / dur);
      const x = start + (end - start) * easeOutQuint(t);
      applyVisualX(x);

      const idx = Math.floor(x / cell);
      const tickGap = qualityAllows('tickHaptics') ? 72 : 9999;
      if (idx !== lastTickRef.current && now - lastTickAt > tickGap) {
        lastTickRef.current = idx;
        lastTickAt = now;
        if (ownAudio) {
          hapticWheelTick(idx);
          playWheelTickSound();
        }
      }

      if (t < 1) {
        rafRef.current = scheduleFrame(step);
        return;
      }
      applyVisualX(end);
      if (track) track.style.willChange = 'auto';
      setMetricsAnimating(false);
      if (ownAudio) {
        stopTicketSpinHum();
        playWheelStopSound();
        hapticWheelStop();
      }
      completeRef.current?.();
    };
    rafRef.current = scheduleFrame(step);
    return () => {
      cancelFrame(rafRef.current);
      setMetricsAnimating(false);
      if (track) track.style.willChange = 'auto';
    };
  }, [spinToken, spinning, targetId, reduceMotion, durationMs, ownAudio]);

  useLayoutEffect(() => {
    if (spinning || !targetId || items.length === 0) return;
    const cell = readCell();
    const winner = indexOfId(items, targetId);
    applyVisualX(winner * cell);
  }, [targetId, spinning, items, compact]);

  useEffect(
    () => () => {
      cancelFrame(rafRef.current);
      setMetricsAnimating(false);
    },
    [],
  );

  return (
    <div
      ref={rootRef}
      className={`hn-reel hn-reel--${variant}${compact ? ' is-compact' : ''}${
        spinning ? ' is-spinning' : ''
      }${plain ? ' is-plain' : ''} ${className}`.trim()}
      aria-label={variant === 'decade' ? 'Decade spinner' : 'Team spinner'}
      style={
        {
          '--hn-cell': `${cellWRef.current}px`,
          ...style,
        } as CSSProperties
      }
    >
      <div className="hn-reel__window">
        <div className="hn-reel__pointer" aria-hidden />
        <div ref={trackRef} className="hn-reel__track">
          {strip.map((item) => (
            <div
              key={item.id}
              className="hn-reel__cell"
              style={
                plain
                  ? {
                      background: 'var(--hn-plain-bg, #1e293b)',
                      color: 'var(--hn-plain-fg, #f8fafc)',
                    }
                  : {
                      background: item.background,
                      color: item.color,
                    }
              }
            >
              <strong className="hn-reel__label">{item.label}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
