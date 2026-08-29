'use client';

/**
 * Dark navy themed gymnasium photo layer (~15% opacity).
 */
export function GymnasiumBackground() {
  return (
    <div className="gym-bg" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="gym-bg__photo"
        src="/images/home-gym-hoop-upper.jpg"
        alt=""
        decoding="async"
      />
      <div className="gym-bg__shade" />
    </div>
  );
}
