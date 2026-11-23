'use client';

/**
 * Official five-jersey court centerpiece.
 * Transparent stage plate + optional PG glow — object-fit:contain, never cover/crop.
 */
export function HomeJerseyStage() {
  return (
    <div className="home-stage-art" role="img" aria-label="Five-jersey court lineup">
      <img
        className="home-stage-art__glow"
        src="/images/home-v4/home-pg-glow@3x.png"
        alt=""
        width={1170}
        height={700}
        decoding="async"
        draggable={false}
        aria-hidden
      />
      <img
        className="home-stage-art__img"
        src="/images/home-v4/home-jersey-stage@3x.webp"
        alt=""
        width={1170}
        height={700}
        decoding="async"
        fetchPriority="high"
        draggable={false}
      />
    </div>
  );
}
