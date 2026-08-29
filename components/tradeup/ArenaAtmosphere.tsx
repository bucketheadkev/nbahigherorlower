'use client';

/**
 * Branded arena atmosphere — icon-navy field + soft icon-blue haze + dim gym photo.
 */
export function ArenaAtmosphere({
  intensity = 'hub',
}: {
  intensity?: 'hub' | 'splash' | 'game';
}) {
  return (
    <div className={`arena-atmo arena-atmo--${intensity}`} aria-hidden>
      <div className="arena-atmo__base" />
      {intensity === 'hub' ? (
        <div className="arena-atmo__gym">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="arena-atmo__gym-photo"
            src="/images/home-gym-hoop-upper.jpg"
            alt=""
            decoding="async"
          />
        </div>
      ) : (
        <div className="arena-atmo__court">
          <span className="arena-atmo__hoop" />
          <span className="arena-atmo__lane" />
          <span className="arena-atmo__arc" />
          <span className="arena-atmo__key" />
          <span className="arena-atmo__circle" />
          <span className="arena-atmo__sideline" />
        </div>
      )}
      <div className="arena-atmo__grain" />
      <div className="arena-atmo__bloom" />
      <div className="arena-atmo__hero-glow" />
      {intensity === 'game' ? <div className="arena-atmo__stage" /> : null}
      <div className="arena-atmo__vignette" />
    </div>
  );
}
