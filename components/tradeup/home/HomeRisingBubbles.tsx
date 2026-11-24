'use client';

/** Fast rising green + white bubbles over the home arena. */
const BUBBLES = [
  { left: 8, delay: 0, dur: 1.55, size: 4.2, drift: 10, tone: 'green' },
  { left: 18, delay: 0.45, dur: 1.35, size: 3.4, drift: -8, tone: 'white' },
  { left: 29, delay: 0.95, dur: 1.7, size: 4.6, drift: 6, tone: 'green' },
  { left: 41, delay: 0.2, dur: 1.4, size: 3.2, drift: -12, tone: 'white' },
  { left: 52, delay: 0.75, dur: 1.6, size: 3.9, drift: 9, tone: 'green' },
  { left: 63, delay: 0.1, dur: 1.3, size: 3.1, drift: -5, tone: 'white' },
  { left: 74, delay: 1.15, dur: 1.5, size: 4.1, drift: 11, tone: 'green' },
  { left: 86, delay: 0.6, dur: 1.4, size: 3.6, drift: -7, tone: 'white' },
  { left: 14, delay: 1.4, dur: 1.55, size: 3.3, drift: 4, tone: 'green' },
  { left: 57, delay: 1.65, dur: 1.35, size: 3.8, drift: -9, tone: 'white' },
] as const;

export function HomeRisingBubbles() {
  return (
    <div className="rh5-bubbles" aria-hidden>
      {BUBBLES.map((b, i) => (
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
