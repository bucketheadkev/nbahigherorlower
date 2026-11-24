'use client';

import { useSound } from '@/hooks/useSound';
import { usePerkInventory } from '@/hooks/usePerkInventory';
import { useXpProfile } from '@/hooks/useXpProfile';
import {
  MAX_PERK_USES,
  PERK_DEFS,
  type PerkId,
} from '@/lib/tradeup/perks';
import { PerkIcon } from './PerkIcon';

/** Draft-sheet perks only — Swap stays in the Shop. */
const DRAFT_PERK_IDS: readonly PerkId[] = ['double_draft', 'xray'];

interface ClassicPerksBarProps {
  /** Shared Classic boost count (rerolls + perk activations). Cap is MAX_PERK_USES. */
  activationsUsed: number;
  active: Partial<Record<PerkId, boolean>>;
  disabled?: boolean;
  onActivate: (id: PerkId) => void;
}

export function ClassicPerksBar({
  activationsUsed,
  active,
  disabled,
  onActivate,
}: ClassicPerksBarProps) {
  const { resume, playTap } = useSound();
  const inv = usePerkInventory();
  const { coins } = useXpProfile();
  const remaining = Math.max(0, MAX_PERK_USES - activationsUsed);
  const perks = PERK_DEFS.filter((p) => DRAFT_PERK_IDS.includes(p.id));

  return (
    <div className="perk-bar" aria-label="Perks">
      <div className="perk-bar__row perk-bar__row--pair">
        {perks.map((perk) => {
          const isOn = Boolean(active[perk.id]);
          const stock = inv[perk.id] ?? 0;
          const canAfford = stock > 0 || coins >= perk.cost;
          const locked = disabled || remaining <= 0 || isOn || !canAfford;
          return (
            <button
              key={perk.id}
              type="button"
              className={`perk-card perk-card--compact perk-card--${perk.id} ui-tap${isOn ? ' is-on' : ''}`}
              disabled={locked && !isOn}
              title={perk.blurb}
              onClick={() => {
                void resume();
                playTap();
                onActivate(perk.id);
              }}
            >
              <span className="perk-card__icon" aria-hidden>
                <PerkIcon id={perk.id} size={52} />
              </span>
              <span className="perk-card__tap">{perk.tapLine}</span>
              <span className="perk-card__price">
                {isOn ? 'On' : stock > 0 ? `×${stock}` : `${perk.cost}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
