'use client';

import { ArenaAtmosphere } from '../ArenaAtmosphere';

/** Shared $1B Run arena for Classic gameplay (court + graphite depth). */
export function GameBackground() {
  return (
    <div className="game-bg game-bg--arena" aria-hidden>
      <ArenaAtmosphere intensity="game" />
    </div>
  );
}
