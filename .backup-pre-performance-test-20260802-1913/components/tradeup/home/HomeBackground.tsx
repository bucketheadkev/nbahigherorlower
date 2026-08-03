'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';

const HOME_DUST = Array.from({ length: 28 }, (_, index) => ({
  x: (index * 41 + 7) % 100,
  y: (index * 67 + 13) % 100,
  size: 1 + ((index * 5) % 3),
  opacity: 0.12 + ((index * 11) % 25) / 100,
  duration: 12 + ((index * 7) % 15),
  delay: -((index * 13) % 24),
  drift: -16 + ((index * 17) % 33),
}));

interface HomeBackgroundProps {
  interactive?: boolean;
}

/** Home-only broadcast atmosphere; other screens retain the minimal backdrop. */
export function HomeBackground({ interactive = false }: HomeBackgroundProps) {
  const backgroundRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!interactive) return;
    const node = backgroundRef.current;
    if (!node) return;

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let frame: number | null = null;
    let pointerX = 0;
    let pointerY = 0;

    const applyShift = () => {
      frame = null;
      node.style.setProperty('--home-near-x', `${pointerX * 18}px`);
      node.style.setProperty('--home-near-y', `${pointerY * 12}px`);
      node.style.setProperty('--home-mid-x', `${pointerX * 10}px`);
      node.style.setProperty('--home-mid-y', `${pointerY * 7}px`);
      node.style.setProperty('--home-far-x', `${pointerX * 5}px`);
      node.style.setProperty('--home-far-y', `${pointerY * 4}px`);
    };

    const queueShift = () => {
      if (frame === null) frame = window.requestAnimationFrame(applyShift);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!finePointer.matches || getPrefersReducedMotion()) return;
      pointerX = event.clientX / Math.max(1, window.innerWidth) - 0.5;
      pointerY = event.clientY / Math.max(1, window.innerHeight) - 0.5;
      queueShift();
    };

    const resetPointer = () => {
      pointerX = 0;
      pointerY = 0;
      queueShift();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('blur', resetPointer);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('blur', resetPointer);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [interactive]);

  return (
    <div
      ref={backgroundRef}
      className={`home-bg${interactive ? ' home-bg--premium' : ''}`}
      aria-hidden
    >
      <div className="home-bg-base" />
      <div className="home-bg-brand-watermark" />
      <div className="home-bg-mid" />
      <div className="home-bg-accent" />
      {interactive ? (
        <>
          <div className="home-bg-court" />
          <div className="home-bg-red home-bg-red--one" />
          <div className="home-bg-red home-bg-red--two" />
          <div className="home-bg-spotlight" />
          <div className="home-bg-particles">
            {HOME_DUST.map((particle, index) => (
              <span
                key={index}
                style={
                  {
                    '--dust-x': `${particle.x}%`,
                    '--dust-y': `${particle.y}%`,
                    '--dust-size': `${particle.size}px`,
                    '--dust-opacity': particle.opacity,
                    '--dust-duration': `${particle.duration}s`,
                    '--dust-delay': `${particle.delay}s`,
                    '--dust-drift': `${particle.drift}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <div className="home-bg-sweep home-bg-sweep--one" />
          <div className="home-bg-sweep home-bg-sweep--two" />
          <div className="home-bg-interface-shield" />
        </>
      ) : null}
    </div>
  );
}
