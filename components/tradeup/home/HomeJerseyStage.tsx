'use client';

/**
 * 5-jersey court stage from the official home reference.
 * Photo plate for composition fidelity + light SVG polish glow on PG.
 */
export function HomeJerseyStage() {
  return (
    <div className="home-stage-art" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="home-stage-art__plate"
        src="/images/home-v4/home-jersey-stage.png"
        alt=""
        width={524}
        height={389}
        decoding="async"
        draggable={false}
      />
      <span className="home-stage-art__pg-glow" />
    </div>
  );
}
