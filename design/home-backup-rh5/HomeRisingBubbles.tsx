'use client';

/**
 * Home arena motes — sparse, slow money/atmosphere particles.
 * Intentionally few so the baked growth bars stay the hero metaphor.
 */
const MOTES = [
  { left: 12, delay: 0, dur: 6.8, size: 3.6, drift: 14, tone: 'green' },
  { left: 28, delay: 1.8, dur: 7.4, size: 2.8, drift: -10, tone: 'white' },
  { left: 46, delay: 0.9, dur: 6.2, size: 4.0, drift: 8, tone: 'green' },
  { left: 63, delay: 3.2, dur: 7.8, size: 2.6, drift: -12, tone: 'white' },
  { left: 78, delay: 2.1, dur: 6.5, size: 3.4, drift: 9, tone: 'green' },
  { left: 88, delay: 4.0, dur: 7.1, size: 2.4, drift: -6, tone: 'white' },
] as const;

export function HomeRisingBubbles() {
  return (
    <div className="rh5-bubbles" aria-hidden>
      {MOTES.map((b, i) => (
        <span
          key={i}
          className={`rh5-bubble rh5-bubble--${b.tone}`}
          style={{
            left: `${b.left}%`,
            width: `${b.size}px`,
            height: `${b.size}px`,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
            ['--rh5-bubble-drift' as string]: `${b.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
