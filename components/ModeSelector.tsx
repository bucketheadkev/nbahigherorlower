'use client';

import { GAME_MODES } from '@/lib/categories';
import type { GameMode } from '@/types/game';

interface ModeSelectorProps {
  selected: GameMode;
  onSelect: (mode: GameMode) => void;
  modeBests?: Partial<Record<GameMode, number>>;
}

export function ModeSelector({ selected, onSelect, modeBests = {} }: ModeSelectorProps) {
  return (
    <div className="mode-grid">
      {GAME_MODES.map((mode) => {
        const isActive = selected === mode.key;
        const best = modeBests[mode.key];

        return (
          <button
            key={mode.key}
            type="button"
            onClick={() => onSelect(mode.key)}
            className={`mode-card ${isActive ? 'mode-card-active' : ''}`}
          >
            <span className="mode-card-label">{mode.label}</span>
            {best !== undefined && best > 0 ? (
              <span className="mode-card-best">Best streak: {best}</span>
            ) : (
              <span className="mode-card-best">Tap to select</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
