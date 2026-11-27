'use client';

/**
 * Board backdrop — the Home arena (court plate is the screen background); this adds the rig light.
 */
export function LeaderboardBackdrop() {
  return (
    <div className="arena-atmo wb-backdrop" aria-hidden>
      <div className="rh10-cone" />
    </div>
  );
}
