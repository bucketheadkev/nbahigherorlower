'use client';

import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { getTeamColors } from '@/lib/tradeup/teamColors';
import {
  getTeamLogoFallbackUrl,
  getTeamLogoUrl,
} from '@/lib/tradeup/teamLogos';
import { TEAMS } from '@/lib/tradeup/teams';
import type { TeamInfo } from '@/lib/tradeup/types';
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

const CELL_W = 72; // px — synced with CSS --ht-cell

interface HorizontalTeamSpinnerProps {
  targetTeamId: string | null;
  spinToken: number;
  spinning: boolean;
  reduceMotion?: boolean;
  durationMs?: number;
  compact?: boolean;
  onSpinComplete?: () => void;
}

function easeOutCubic(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

function indexOfTeam(id: string): number {
  const i = TEAMS.findIndex((t) => t.id === id);
  return i >= 0 ? i : 0;
}

/**
 * Horizontal franchise spinner — ~4 logos visible, lands on one predetermined team.
 * Transform-only animation (GPU) for iPhone smoothness.
 */
export function HorizontalTeamSpinner({
  targetTeamId,
  spinToken,
  spinning,
  reduceMotion = false,
  durationMs = 2800,
  compact = false,
  onSpinComplete,
}: HorizontalTeamSpinnerProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const runRef = useRef(0);
  const lastIdxRef = useRef(-1);

  const strip = useMemo(() => {
    // Repeat the 30-team list so we can scroll through several revolutions
    const reps: TeamInfo[] = [];
    for (let r = 0; r < 8; r += 1) reps.push(...TEAMS);
    return reps;
  }, []);

  const cell = compact ? 52 : CELL_W;

  useEffect(() => {
    if (!spinning || !targetTeamId) return;
    const runId = ++runRef.current;
    const winner = indexOfTeam(targetTeamId);
    // Land near the end of the strip for drama (rep 6) — index centered via track padding
    const landIndex = TEAMS.length * 6 + winner;
    const start = offsetRef.current;
    const end = landIndex * cell;

    if (reduceMotion) {
      offsetRef.current = end;
      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(${-end}px,0,0)`;
      }
      onSpinComplete?.();
      return;
    }

    cancelAnimationFrame(rafRef.current);
    startTicketSpinHum();
    hapticWheelStart();
    lastIdxRef.current = Math.round(start / cell);
    const t0 = performance.now();
    const dur = Math.max(1400, durationMs);

    const step = (now: number) => {
      if (runId !== runRef.current) return;
      const t = Math.min(1, (now - t0) / dur);
      const eased = easeOutCubic(t);
      const x = start + (end - start) * eased;
      offsetRef.current = x;
      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(${-x}px,0,0)`;
      }
      const idx = Math.round(x / cell);
      if (idx !== lastIdxRef.current) {
        lastIdxRef.current = idx;
        hapticWheelTick(idx);
        playWheelTickSound();
      }
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      offsetRef.current = end;
      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(${-end}px,0,0)`;
      }
      stopTicketSpinHum();
      playWheelStopSound();
      hapticWheelStop();
      onSpinComplete?.();
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [spinToken, spinning, targetTeamId, reduceMotion, durationMs, cell, onSpinComplete]);

  // Park on target when idle/locked
  useEffect(() => {
    if (spinning || !targetTeamId) return;
    const winner = indexOfTeam(targetTeamId);
    const park = (TEAMS.length * 2 + winner) * cell;
    offsetRef.current = park;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${-park}px,0,0)`;
    }
  }, [targetTeamId, spinning, cell]);

  return (
    <div
      className={`ht-spinner${compact ? ' is-compact' : ''}${
        spinning ? ' is-spinning' : ''
      }`}
      aria-label="Team logo spinner"
      style={{ '--ht-cell': `${cell}px` } as CSSProperties}
    >
      <div className="ht-spinner__window">
        <div className="ht-spinner__pointer" aria-hidden />
        <div ref={trackRef} className="ht-spinner__track">
          {strip.map((team, i) => {
            const colors = getTeamColors(team.id);
            const logo = getTeamLogoUrl(team.id, 'thumb');
            const fallback = getTeamLogoFallbackUrl(team.id);
            return (
              <div
                key={`${team.id}-${i}`}
                className="ht-spinner__cell"
                style={{
                  background: `linear-gradient(160deg, ${colors.primary}ee, ${colors.primary}99)`,
                }}
              >
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo}
                    alt=""
                    draggable={false}
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (fallback && img.src !== fallback) {
                        img.src = fallback;
                      }
                    }}
                  />
                ) : (
                  <span>{team.id}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="ht-spinner__caption" aria-live="polite">
        {targetTeamId && !spinning
          ? TEAMS.find((t) => t.id === targetTeamId)?.fullName ?? ''
          : spinning
            ? 'Selecting franchise…'
            : '30 NBA franchises'}
      </p>
    </div>
  );
}
