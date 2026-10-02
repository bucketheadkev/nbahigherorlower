'use client';

import { memo, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { SpinStripItem } from './SpinReel';

interface BarrelReelProps {
  strip: SpinStripItem[];
  spinId: number;
  itemHeight: number;
  durationMs: number;
  /** Unused. Reels are already open, so travel starts immediately. */
  startDelayMs?: number;
  reduceMotion?: boolean;
  variant: 'team' | 'era';
  /** Travel axis. Vertical reels show one window and scroll upward. */
  axis?: 'x' | 'y';
  /** Center label before the first spin (TEAM / ERA). */
  readyLabel?: string | null;
  /** Held axis — full-width row, center card, no travel. */
  holdLabel?: string | null;
  holdStyle?: CSSProperties;
  /** Brief glow after the strip locks, before the pick list. */
  celebrate?: boolean;
  /** Visible tiles across the viewport. 1 fills the box for a header reroll. */
  columns?: number;
  /** Strip index that must land in the center. Defaults to the last card. */
  landIndex?: number;
  /**
   * Rare landing. The slowdown is the same either way; this only adds the
   * short slide into the white window after the reel has nearly stopped.
   */
  nudgeSettle?: boolean;
  onLocked?: () => void;
}

const COLS = 3;
const GAP = 8;
/** Share of spins, including rerolls, that slide into the window after stopping short. */
export const REEL_NUDGE_CHANCE = 0.2;

/**
 * Barrel reel. Horizontal shows three tiles; vertical shows one window.
 * The landing index is the predetermined card.
 * Motion is one CSS transform — no per-frame React updates.
 */
export const BarrelReel = memo(function BarrelReel({
  strip,
  spinId,
  itemHeight,
  durationMs,
  reduceMotion = false,
  variant,
  axis = 'x',
  readyLabel = null,
  holdLabel = null,
  holdStyle,
  celebrate = false,
  columns = COLS,
  landIndex,
  nudgeSettle = false,
  onLocked,
}: BarrelReelProps) {
  const viewRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const onLockedRef = useRef(onLocked);
  onLockedRef.current = onLocked;
  const timerRef = useRef(0);
  const playedSpinRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const apply = () => {
      const viewSize =
        axis === 'y' ? view.clientHeight || itemHeight : view.clientWidth || 320;
      const cols = Math.max(1, columns);
      const tile = cols <= 1 ? viewSize : (viewSize - GAP * (cols - 1)) / cols;
      view.style.setProperty('--barrel-tile', `${tile}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(view);
    return () => observer.disconnect();
  }, [axis, columns, itemHeight]);

  useLayoutEffect(() => {
    const el = stripRef.current;
    const view = viewRef.current;
    if (!el || !view) return;
    if (spinId <= 0 || strip.length < 2) return;

    const viewSize =
      axis === 'y' ? view.clientHeight || itemHeight : view.clientWidth || 320;
    const cols = Math.max(1, columns);
    const tile = cols <= 1 ? viewSize : (viewSize - GAP * (cols - 1)) / cols;
    const stride = tile + GAP;
    const centerPad = (viewSize - tile) / 2;
    const landAt = Math.min(
      Math.max(0, landIndex ?? strip.length - 1),
      strip.length - 1,
    );
    const target = centerPad - landAt * stride;
    const at = (pos: number) =>
      axis === 'y' ? `translate3d(0, ${pos}px, 0)` : `translate3d(${pos}px, 0, 0)`;
    let locked = false;

    const finish = () => {
      if (locked) return;
      locked = true;
      el.getAnimations().forEach((item) => item.cancel());
      el.style.transform = at(target);
      onLockedRef.current?.();
    };

    const onEnd = (event: AnimationEvent) => {
      if (event.target !== el || event.animationName !== 'barrel-reel-run') return;
      finish();
    };

    let anim: Animation | null = null;
    if (playedSpinRef.current === spinId) {
      if (reduceMotion) return;
      anim = el.getAnimations().find((item) => item.playState === 'running') ?? null;
    } else {
      playedSpinRef.current = spinId;
      if (reduceMotion) {
        el.style.transform = at(target);
        finish();
        return;
      }
      // Same total time. Cruise, then the same visible slowdown.
      // Most landings stop on the white window. About 1 in 5 stop just
      // short, then slide into center.
      const travel = target - centerPad;
      const cruise = centerPad + travel * 0.86;
      const direction = Math.sign(centerPad - target) || 1;
      const remaining = Math.abs(target - cruise);
      const miss = nudgeSettle ? Math.min(stride * 0.55, remaining * 0.4) : 0;
      const near = target + direction * miss;
      el.style.transform = at(centerPad);
      const frames: Keyframe[] = [
        { transform: at(centerPad), easing: 'linear' },
        {
          transform: at(cruise),
          offset: 0.56,
          easing: 'cubic-bezier(0.05, 0.42, 0.12, 1)',
        },
        {
          transform: at(near),
          offset: 0.82,
          easing: nudgeSettle ? 'cubic-bezier(0.42, 0, 0.2, 1)' : 'linear',
        },
        { transform: at(target) },
      ];
      anim = el.animate(frames, { duration: durationMs, fill: 'forwards' });
    }

    const onFinish = () => finish();
    anim?.addEventListener('finish', onFinish);
    el.addEventListener('animationend', onEnd);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(finish, durationMs + 30);
    return () => {
      anim?.removeEventListener('finish', onFinish);
      el.removeEventListener('animationend', onEnd);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [axis, columns, durationMs, itemHeight, landIndex, nudgeSettle, reduceMotion, spinId, strip.length]);

  const spinning = spinId > 0 && strip.length > 1;
  const holding = !spinning && Boolean(holdLabel);
  const ready = !spinning && !holding;
  const landAt = Math.min(
    Math.max(0, landIndex ?? Math.max(0, strip.length - 1)),
    Math.max(0, strip.length - 1),
  );

  const singleWindow = axis === 'y';
  const tileStyle = (extra?: CSSProperties): CSSProperties => ({
    height: singleWindow ? 'var(--barrel-tile, 100%)' : '100%',
    flex: singleWindow ? '0 0 var(--barrel-tile, 100%)' : undefined,
    ...extra,
  });

  return (
    <div
      ref={viewRef}
      className={`barrel-reel barrel-reel--${variant}${singleWindow ? ' is-vertical' : ''}${
        spinning ? ' is-live' : ''
      }${ready ? ' is-ready' : ''}${holding ? ' is-hold' : ''}${
        celebrate ? ' is-celebrate' : ''
      }`}
      style={{ height: itemHeight }}
    >
      {spinning ? (
        <div ref={stripRef} className="barrel-reel__strip">
          {strip.map((item, index) => (
            <div
              key={`${spinId}-${index}`}
              className={`barrel-card barrel-card--${variant}${
                index === landAt ? ' is-winner' : ''
              }`}
              style={tileStyle(
                variant === 'team' && item.background
                  ? {
                      background: `linear-gradient(180deg, ${item.background} 0%, color-mix(in srgb, ${item.background} 72%, #041018) 100%)`,
                      color: item.color,
                    }
                  : undefined,
              )}
            >
              {item.label}
            </div>
          ))}
        </div>
      ) : singleWindow ? (
        <div
          className={`${holding ? 'barrel-reel__hold' : 'barrel-reel__ready'} barrel-reel__solo`}
        >
          <div
            className={`barrel-card barrel-card--${variant} ${holding ? 'is-hold' : 'is-ready'}`}
            style={tileStyle(holding ? holdStyle : undefined)}
          >
            {holding ? holdLabel : readyLabel}
          </div>
        </div>
      ) : (
        <div className={holding ? 'barrel-reel__hold' : 'barrel-reel__ready'}>
          <div className={`barrel-card barrel-card--${variant} is-ghost`} style={tileStyle()} />
          <div
            className={`barrel-card barrel-card--${variant} ${holding ? 'is-hold' : 'is-ready'}`}
            style={tileStyle(holding ? holdStyle : undefined)}
          >
            {holding ? holdLabel : readyLabel}
          </div>
          <div className={`barrel-card barrel-card--${variant} is-ghost`} style={tileStyle()} />
        </div>
      )}
      <div className="barrel-reel__frame" aria-hidden />
    </div>
  );
});
