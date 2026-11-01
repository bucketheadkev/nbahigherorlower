'use client';

import { memo } from 'react';
import { ArenaAtmosphere } from '../ArenaAtmosphere';

/** Shared $1B Run arena for Classic gameplay (court + graphite depth). */
export const GameBackground = memo(function GameBackground() {
  return (
    <div className="game-bg game-bg--arena" aria-hidden>
      <ArenaAtmosphere intensity="game" />
    </div>
  );
});
