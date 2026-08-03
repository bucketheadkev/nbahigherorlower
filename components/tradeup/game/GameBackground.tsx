'use client';

import type { CSSProperties } from 'react';

const ARENA_DUST = Array.from({ length: 16 }, (_, index) => ({
  x: (index * 37 + 9) % 100,
  y: (index * 53 + 13) % 100,
  size: 1 + ((index * 7) % 3),
  duration: 12 + ((index * 11) % 11),
  delay: -((index * 17) % 21),
  driftX: -20 + ((index * 13) % 41),
  driftY: -28 - ((index * 9) % 34),
  opacity: 0.1 + ((index * 9) % 20) / 100,
}));

/** Dark basketball-arena atmosphere shared by gameplay screens. */
export function GameBackground() {
  return (
    <div className="game-bg" aria-hidden>
      <div className="game-bg__base" />
      <div className="game-bg__brand-watermark" />
      <div className="game-bg__red-field game-bg__red-field--left" />
      <div className="game-bg__red-field game-bg__red-field--right" />
      <div className="game-bg__spotlight game-bg__spotlight--one" />
      <div className="game-bg__spotlight game-bg__spotlight--two" />
      <div className="game-bg__court" />
      <div className="game-bg__formation-light" />
      <div className="game-bg__dust">
        {ARENA_DUST.map((particle, index) => (
          <span
            key={index}
            style={
              {
                '--dust-x': `${particle.x}%`,
                '--dust-y': `${particle.y}%`,
                '--dust-size': `${particle.size}px`,
                '--dust-duration': `${particle.duration}s`,
                '--dust-delay': `${particle.delay}s`,
                '--dust-drift-x': `${particle.driftX}px`,
                '--dust-drift-y': `${particle.driftY}px`,
                '--dust-opacity': particle.opacity,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="game-bg__sweep game-bg__sweep--one" />
      <div className="game-bg__sweep game-bg__sweep--two" />
      <div className="game-bg__vignette" />
    </div>
  );
}
