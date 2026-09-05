'use client';

import { memo, useState, type CSSProperties } from 'react';
import type { DecadeEra, EraOfferPlayer } from '@/lib/tradeup/billionDollar';
import { playerFitsSlot } from '@/lib/tradeup/alternatePositions';
import { hapticMedium } from '@/lib/tradeup/haptics';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import type { Position, TeamInfo } from '@/lib/tradeup/types';
import type { TicketRerollKind } from './BallionTicketMachine';
import { BallionScratchTicket } from './BallionScratchTicket';

interface FranchisePickScreenProps {
  team: TeamInfo;
  era: DecadeEra;
  offers: EraOfferPlayer[];
  openPositions: Position[];
  selectedId: string | null;
  /** True only while confirmed placement animation runs. */
  placing?: boolean;
  selectedName?: string | null;
  canRerollTeam: boolean;
  canRerollEra: boolean;
  hint: string;
  onSelect: (player: EraOfferPlayer) => void;
  onReroll: (kind: TicketRerollKind) => void;
}

/**
 * Player selection — select only; position is chosen on the dock.
 */
export const FranchisePickScreen = memo(function FranchisePickScreen({
  team,
  era,
  offers,
  openPositions,
  selectedId,
  placing = false,
  canRerollTeam,
  canRerollEra,
  hint,
  onSelect,
  onReroll,
}: FranchisePickScreenProps) {
  const colors = getTeamColors(team.id);
  const posInk = contrastOnPrimary(colors.primary);
  const [pressedId, setPressedId] = useState<string | null>(null);

  return (
    <section
      className={`franchise-pick${selectedId ? ' has-selection' : ''}${
        placing ? ' is-placing' : ''
      }`}
      aria-label="Player selection"
      style={{ ['--pick-team' as string]: colors.primary } as CSSProperties}
    >
      <BallionScratchTicket
        compact
        teamName={team.fullName.toUpperCase()}
        era={era}
        teamPrimary={colors.primary}
        onRevealed={() => {}}
      />

      <div className="franchise-pick__rerolls">
        <button
          type="button"
          className="franchise-pick__reroll"
          disabled={!canRerollTeam || placing}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!canRerollTeam || placing) return;
            hapticMedium();
            onReroll('team');
          }}
        >
          <em>{canRerollTeam ? '1 left' : 'Used'}</em>
          <strong>Reroll Team</strong>
        </button>
        <button
          type="button"
          className="franchise-pick__reroll"
          disabled={!canRerollEra || placing}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!canRerollEra || placing) return;
            hapticMedium();
            onReroll('era');
          }}
        >
          <em>{canRerollEra ? '1 left' : 'Used'}</em>
          <strong>Reroll Era</strong>
        </button>
      </div>

      <p className="franchise-pick__hint">{hint}</p>

      <ul className="franchise-pick__list" aria-label="Available players">
        {offers.map((player) => {
          const selected = selectedId === player.id;
          const canPlay = openPositions.some((pos) => playerFitsSlot(player, pos));
          const pressed = pressedId === player.id;
          return (
            <li key={player.id}>
              <button
                type="button"
                className={`franchise-pick__row${selected ? ' is-selected' : ''}${
                  pressed ? ' is-pressed' : ''
                }${canPlay ? '' : ' is-disabled'}`}
                data-draft-player-id={player.id}
                disabled={!canPlay || placing}
                aria-disabled={!canPlay || placing}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!canPlay || placing) return;
                  setPressedId(player.id);
                  onSelect(player);
                  window.setTimeout(
                    () => setPressedId((id) => (id === player.id ? null : id)),
                    100,
                  );
                }}
              >
                <span
                  className="franchise-pick__pos"
                  style={{
                    background: colors.primary,
                    color: posInk,
                  }}
                >
                  {player.primaryPosition}
                </span>
                <span className="franchise-pick__meta">
                  <strong>{player.name}</strong>
                  <em className="franchise-pick__stats">
                    {Number.isFinite(player.eraStats?.ppg)
                      ? `${player.eraStats.ppg.toFixed(1)} PTS`
                      : '— PTS'}
                    {' · '}
                    {Number.isFinite(player.eraStats?.rpg)
                      ? `${player.eraStats.rpg.toFixed(1)} REB`
                      : '— REB'}
                    {' · '}
                    {Number.isFinite(player.eraStats?.apg)
                      ? `${player.eraStats.apg.toFixed(1)} AST`
                      : '— AST'}
                  </em>
                </span>
                <span
                  className={`franchise-pick__check${selected ? ' is-on' : ''}`}
                  aria-hidden
                >
                  {selected ? 'SELECTED' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
