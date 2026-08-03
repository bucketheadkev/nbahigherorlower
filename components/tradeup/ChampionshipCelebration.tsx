'use client';

import { useEffect, useMemo, useState } from 'react';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { ChampionshipRingVisual } from './ChampionshipRingVisual';

interface ChampionshipCelebrationProps {
  active: boolean;
  teamLabel: string;
  mvpName?: string | null;
  onFinished: () => void;
}

const PIECE_COUNT = 72;

/** Full-screen title celebration — confetti + trophy — then hands off to end CTAs. */
export function ChampionshipCelebration({
  active,
  teamLabel,
  mvpName,
  onFinished,
}: ChampionshipCelebrationProps) {
  const [burstKey, setBurstKey] = useState(0);
  const reduceMotion = getPrefersReducedMotion();

  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, index) => ({
        id: index,
        left: `${(index * 17 + 11) % 100}%`,
        delay: `${(index % 18) * 0.08}s`,
        duration: `${2.4 + (index % 7) * 0.22}s`,
        hue: index % 5,
        size: 6 + (index % 5) * 2,
        drift: `${((index % 9) - 4) * 18}px`,
      })),
    [burstKey],
  );

  useEffect(() => {
    if (!active) return;
    setBurstKey((value) => value + 1);
    const ms = reduceMotion ? 900 : 5600;
    const timer = window.setTimeout(onFinished, ms);
    return () => window.clearTimeout(timer);
  }, [active, onFinished, reduceMotion]);

  if (!active) return null;

  return (
    <div className="champ-burst" role="status" aria-live="polite">
      <div className="champ-burst__glow" aria-hidden />
      <div className="champ-burst__rays" aria-hidden />

      <div className="champ-burst__confetti" aria-hidden>
        {pieces.map((piece) => (
          <span
            key={`${burstKey}-${piece.id}`}
            className={`champ-burst__piece champ-burst__piece--${piece.hue}`}
            style={{
              left: piece.left,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
              width: piece.size,
              height: piece.size * 1.4,
              ['--drift' as string]: piece.drift,
            }}
          />
        ))}
      </div>

      <div className="champ-burst__stage">
        <ChampionshipRingVisual size="hero" animate />
        <p className="champ-burst__eyebrow">NBA Champions</p>
        <h2 className="champ-burst__title">{teamLabel}</h2>
        {mvpName ? (
          <p className="champ-burst__mvp">
            Finals MVP · <strong>{mvpName}</strong>
          </p>
        ) : null}
      </div>
    </div>
  );
}
