'use client';

import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react';
import { getTeamColors } from '@/lib/tradeup/teamColors';
import { getTeamLogoUrl } from '@/lib/tradeup/teamLogos';
import {
  TEAM_WHEEL_COUNT,
  TEAM_WHEEL_SEGMENT_DEG,
  computeTeamWheelLandingRotation,
  getTeamWheelIndex,
  getTeamWheelTeams,
  rotationAtProgress,
  teamIndexFromRotation,
} from '@/lib/tradeup/teamWheel';
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

interface TeamPrizeWheelProps {
  /** Predetermined valid team id — must match onResult */
  targetTeamId: string | null;
  /** Increment to start a new spin toward targetTeamId */
  spinToken: number;
  spinning: boolean;
  reduceMotion?: boolean;
  durationMs?: number;
  compact?: boolean;
  onSpinComplete?: () => void;
}

/**
 * True 30-team circular prize wheel.
 * Outcome is preselected; final rotation is calculated so the pointer
 * lands exactly on that team's segment. Visual rotation uses GPU transforms.
 */
export function TeamPrizeWheel({
  targetTeamId,
  spinToken,
  spinning,
  reduceMotion = false,
  durationMs = 3200,
  compact = false,
  onSpinComplete,
}: TeamPrizeWheelProps) {
  const teams = useMemo(() => getTeamWheelTeams(), []);
  const discRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<HTMLDivElement | null>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef(0);
  const lastSegRef = useRef(-1);
  const runRef = useRef(0);

  const conic = useMemo(() => {
    const stops: string[] = [];
    teams.forEach((team, i) => {
      const colors = getTeamColors(team.id);
      const start = i * TEAM_WHEEL_SEGMENT_DEG;
      const end = (i + 1) * TEAM_WHEEL_SEGMENT_DEG;
      // Alternate slight darkening for readability; tint with team primary
      const a = i % 2 === 0 ? colors.primary : mixHex(colors.primary, '#0a0a0a', 0.18);
      stops.push(`${a} ${start}deg ${end}deg`);
    });
    return `conic-gradient(from -90deg, ${stops.join(', ')})`;
  }, [teams]);

  useEffect(() => {
    if (!spinning || !targetTeamId) return;

    const runId = ++runRef.current;
    const startRot = rotationRef.current;
    const winnerIndex = getTeamWheelIndex(targetTeamId);
    const segmentCenter =
      winnerIndex * TEAM_WHEEL_SEGMENT_DEG + TEAM_WHEEL_SEGMENT_DEG / 2;
    const targetMod = (360 - segmentCenter + 360) % 360;
    const currentMod = ((startRot % 360) + 360) % 360;
    let delta = (targetMod - currentMod + 360) % 360;
    if (delta < 20) delta += 360;
    delta += (6 + Math.floor(Math.random() * 2)) * 360;
    const endRot = startRot + delta;

    if (reduceMotion) {
      rotationRef.current = endRot;
      if (discRef.current) {
        discRef.current.style.transform = `rotate(${endRot}deg)`;
      }
      lastSegRef.current = winnerIndex;
      onSpinComplete?.();
      return;
    }

    cancelAnimationFrame(rafRef.current);
    startTicketSpinHum();
    hapticWheelStart();
    lastSegRef.current = teamIndexFromRotation(startRot);
    const t0 = performance.now();
    const dur = Math.max(1200, durationMs);

    const step = (now: number) => {
      if (runId !== runRef.current) return;
      const t = Math.min(1, (now - t0) / dur);
      const rot = rotationAtProgress(startRot, endRot, t);
      rotationRef.current = rot;
      if (discRef.current) {
        discRef.current.style.transform = `rotate(${rot}deg)`;
      }

      const seg = teamIndexFromRotation(rot);
      if (seg !== lastSegRef.current) {
        lastSegRef.current = seg;
        hapticWheelTick(seg);
        playWheelTickSound();
        if (pointerRef.current) {
          pointerRef.current.classList.remove('is-tick');
          void pointerRef.current.offsetWidth;
          pointerRef.current.classList.add('is-tick');
        }
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      rotationRef.current = endRot;
      if (discRef.current) {
        discRef.current.style.transform = `rotate(${endRot}deg)`;
      }
      stopTicketSpinHum();
      playWheelStopSound();
      hapticWheelStop();
      onSpinComplete?.();
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [spinToken, spinning, targetTeamId, reduceMotion, durationMs, onSpinComplete]);

  // Idle / locked display — snap to target without spinning
  useEffect(() => {
    if (spinning || !targetTeamId) return;
    const idx = getTeamWheelIndex(targetTeamId);
    const parked = computeTeamWheelLandingRotation(idx, 0);
    rotationRef.current = parked;
    if (discRef.current) {
      discRef.current.style.transform = `rotate(${parked}deg)`;
    }
  }, [targetTeamId, spinning]);

  return (
    <div
      className={`team-prize-wheel${compact ? ' is-compact' : ''}${
        spinning ? ' is-spinning' : ''
      }`}
      aria-label="30-team prize wheel"
    >
      <div ref={pointerRef} className="team-prize-wheel__pointer" aria-hidden />
      <div className="team-prize-wheel__ring" aria-hidden />
      <div
        ref={discRef}
        className="team-prize-wheel__disc"
        style={
          {
            background: conic,
            transform: `rotate(${rotationRef.current}deg)`,
          } as CSSProperties
        }
      >
        {teams.map((team, index) => {
          const angle = index * TEAM_WHEEL_SEGMENT_DEG + TEAM_WHEEL_SEGMENT_DEG / 2;
          const logoUrl = getTeamLogoUrl(team.id, 'thumb');
          return (
            <div
              key={team.id}
              className="team-prize-wheel__seg"
              style={{
                transform: `rotate(${angle}deg) translateY(-42%)`,
              }}
            >
              <span
                className="team-prize-wheel__logo"
                style={{ transform: `rotate(${-angle}deg)` }}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt=""
                    draggable={false}
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <em>{team.id}</em>
                )}
              </span>
            </div>
          );
        })}
        <div className="team-prize-wheel__hub" aria-hidden>
          <span>NBA</span>
        </div>
      </div>
      <p className="team-prize-wheel__count" aria-hidden>
        {TEAM_WHEEL_COUNT} teams
      </p>
    </div>
  );
}

function mixHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  if (!pa || !pb) return a;
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${m(pa.r, pb.r)}, ${m(pa.g, pb.g)}, ${m(pa.b, pb.b)})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}
