'use client';

/** Text wordmark for in-game chrome — logo only on splash/home until transparent asset is ready. */
export function BallionWordmark({
  className = '',
}: {
  className?: string;
}) {
  return (
    <span
      className={`ballion-wordmark${className ? ` ${className}` : ''}`}
      aria-label="Ballion"
    >
      BALLION
    </span>
  );
}
