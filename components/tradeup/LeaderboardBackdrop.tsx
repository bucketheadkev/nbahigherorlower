'use client';

/**
 * Wins board backdrop — home navy field (no gold court art).
 * Static: nothing animates or scrolls.
 */
export function LeaderboardBackdrop() {
  return (
    <div className="arena-atmo wb-backdrop" aria-hidden>
      <div className="wb-backdrop__void" />
      <div className="wb-backdrop__vignette" />
    </div>
  );
}
