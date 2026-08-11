'use client';

import { memo } from 'react';
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
  selectedName?: string | null;
  canRerollTeam: boolean;
  canRerollEra: boolean;
  hint: string;
  onSelect: (player: EraOfferPlayer) => void;
  onReroll: (kind: TicketRerollKind) => void;
}

/**
 * Post-reveal player selection — compact team/era header + player rows.
 */
export const FranchisePickScreen = memo(function FranchisePickScreen({
  team,
  era,
  offers,
  openPositions,
  selectedId,
  canRerollTeam,
  canRerollEra,
  hint,
  onSelect,
  onReroll,
}: FranchisePickScreenProps) {
  const colors = getTeamColors(team.id);
  const posInk = contrastOnPrimary(colors.primary);

  return (
    <section className="franchise-pick" aria-label="Player selection">
      <BallionScratchTicket
        compact
        teamName={team.fullName.toUpperCase()}
        era={era}
        teamPrimary={colors.primary}
        onRevealed={() => {}}
      />

      {(canRerollTeam || canRerollEra) ? (
        <div className="franchise-pick__rerolls">
          <button
            type="button"
            className="franchise-pick__reroll"
            disabled={!canRerollTeam}
            onPointerDown={(e) => {
              e.preventDefault();
              if (!canRerollTeam) return;
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
            disabled={!canRerollEra}
            onPointerDown={(e) => {
              e.preventDefault();
              if (!canRerollEra) return;
              hapticMedium();
              onReroll('era');
            }}
          >
            <em>{canRerollEra ? '1 left' : 'Used'}</em>
            <strong>Reroll Era</strong>
          </button>
        </div>
      ) : null}

      <p className="franchise-pick__hint">{hint}</p>

      <ul className="franchise-pick__list" aria-label="Available players">
        {offers.map((player) => {
          const selected = selectedId === player.id;
          const canPlay = openPositions.some((pos) => playerFitsSlot(player, pos));
          return (
            <li key={player.id}>
              <button
                type="button"
                className={`franchise-pick__row${selected ? ' is-selected' : ''}${
                  canPlay ? '' : ' is-disabled'
                }`}
                disabled={!canPlay}
                aria-disabled={!canPlay}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!canPlay) return;
                  onSelect(player);
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
                <span className={`franchise-pick__check${selected ? ' is-on' : ''}`} aria-hidden>
                  {selected ? '✓' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
