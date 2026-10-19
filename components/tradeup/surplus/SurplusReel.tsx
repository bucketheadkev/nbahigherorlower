'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatMultiplier, multiplierTier } from '@/lib/tradeup/surplusSpin';

/**
 * Fixed reel strip (tenths). Symbol counts mirror rarity — common multipliers repeat,
 * each 4×–10× appears once. The strip never changes per spin; the reel simply stops on
 * the already-decided outcome, so neighbours are never staged.
 */
const STRIP = [0, 5, 30, 10, 50, 0, 20, 5, 0, 80, 10, 0, 40, 5, 60, 20, 0, 30, 10, 5, 100, 0, 20, 10, 0, 70, 5, 20, 0, 10, 90, 5];
const CYCLES = 5;
const LAND_CYCLE = 3;
const START_INDEX = 2;
export const REEL_SPIN_MS = 2600;

function landingIndex(target: number, seed: number): number {
  const spots = STRIP.flatMap((t, i) => (t === target ? [i] : []));
  const spot = spots.length > 0 ? spots[seed % spots.length]! : 0;
  return LAND_CYCLE * STRIP.length + spot;
}

interface SurplusReelProps {
  /** Decided multiplier (tenths). Null shows the idle reel. */
  target: number | null;
  /** Animate to the target; false renders it already landed. */
  animate: boolean;
  reduceMotion: boolean;
  onLanded?: () => void;
}

export function SurplusReel({ target, animate, reduceMotion, onLanded }: SurplusReelProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [landed, setLanded] = useState(target != null && !animate);
  const tiles = useMemo(() => Array.from({ length: CYCLES }, () => STRIP).flat(), []);
  const seedRef = useRef(Math.floor(Math.random() * 1000));
  const landedRef = useRef(false);
  const onLandedRef = useRef(onLanded);
  onLandedRef.current = onLanded;

  const finalIndex = target == null ? START_INDEX : landingIndex(target, seedRef.current);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const tileAt = (index: number) => track.children[index] as HTMLElement | undefined;
    const first = tileAt(0);
    if (!first) return;
    const trackLeft = track.getBoundingClientRect().left;
    const center = viewport.clientWidth / 2 - first.getBoundingClientRect().width / 2;
    // Per-tile rects (read before any move): a multiplied pitch drifts with sub-pixel rounding.
    const offsets = new Map<number, number>();
    for (const index of [START_INDEX, finalIndex]) {
      offsets.set(index, (tileAt(index)?.getBoundingClientRect().left ?? trackLeft) - trackLeft);
    }
    const at = (index: number) => center - (offsets.get(index) ?? 0);

    const land = () => {
      if (landedRef.current) return;
      landedRef.current = true;
      setLanded(true);
      onLandedRef.current?.();
    };

    if (target == null || !animate || reduceMotion) {
      track.style.transition = 'none';
      track.style.transform = `translate3d(${at(finalIndex)}px, 0, 0)`;
      if (target != null && animate) land();
      return;
    }

    track.style.transition = 'none';
    track.style.transform = `translate3d(${at(START_INDEX)}px, 0, 0)`;
    void track.offsetWidth;
    track.style.transition = `transform ${REEL_SPIN_MS}ms cubic-bezier(0.12, 0.62, 0.16, 1)`;
    track.style.transform = `translate3d(${at(finalIndex)}px, 0, 0)`;
    const onEnd = (event: TransitionEvent) => {
      if (event.target === track) land();
    };
    track.addEventListener('transitionend', onEnd);
    const fallback = window.setTimeout(land, REEL_SPIN_MS + 250);
    return () => {
      track.removeEventListener('transitionend', onEnd);
      window.clearTimeout(fallback);
    };
  }, [animate, finalIndex, reduceMotion, target]);

  return (
    <div className={`sreel${landed ? ' is-landed' : ''}`} aria-hidden>
      <div ref={viewportRef} className="sreel__viewport">
        <div ref={trackRef} className="sreel__track">
          {tiles.map((tenths, i) => (
            <span
              key={i}
              className={`sreel__tile sreel__tile--${multiplierTier(tenths)}${
                landed && i === finalIndex ? ' is-hit' : ''
              }${tenths === 0 ? ' is-zero' : ''}`}
            >
              {formatMultiplier(tenths)}
            </span>
          ))}
        </div>
      </div>
      <span className="sreel__marker" />
    </div>
  );
}
