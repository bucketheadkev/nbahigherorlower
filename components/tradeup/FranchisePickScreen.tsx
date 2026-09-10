'use client';

import { memo, useRef } from 'react';
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
  /** Blocks select/reroll during slam, placement, or handoff. */
  interactionLocked?: boolean;
  hint: string;
  onSelect: (player: EraOfferPlayer) => void;
  onReroll: (kind: TicketRerollKind) => void;
}

const TAP_SLOP_PX = 12;

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
  interactionLocked = false,
  hint,
  onSelect,
  onReroll,
}: FranchisePickScreenProps) {
  const colors = getTeamColors(team.id);
  const posInk = contrastOnPrimary(colors.primary);
  const teamRerollOpen = canRerollTeam && !interactionLocked;
  const eraRerollOpen = canRerollEra && !interactionLocked;
  const pointerStartRef = useRef<{
    id: number;
    x: number;
    y: number;
    playerId: string;
  } | null>(null);

  return (
    <section
      className={`franchise-pick${interactionLocked ? ' is-locked' : ''}`}
      aria-label="Player selection"
      aria-busy={interactionLocked || undefined}
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
          disabled={!teamRerollOpen}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!teamRerollOpen) return;
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
          disabled={!eraRerollOpen}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!eraRerollOpen) return;
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
          const canPlay =
            !interactionLocked &&
            openPositions.some((pos) => playerFitsSlot(player, pos));
          return (
            <li key={player.id}>
              <button
                type="button"
                className={`franchise-pick__row${selected ? ' is-selected' : ''}${
                  canPlay ? '' : ' is-disabled'
                }`}
                data-draft-player-id={player.id}
                disabled={!canPlay}
                aria-disabled={!canPlay}
                onPointerDown={(e) => {
                  if (!canPlay || interactionLocked) return;
                  pointerStartRef.current = {
                    id: e.pointerId,
                    x: e.clientX,
                    y: e.clientY,
                    playerId: player.id,
                  };
                }}
                onPointerMove={(e) => {
                  const start = pointerStartRef.current;
                  if (!start || start.id !== e.pointerId) return;
                  if (
                    Math.abs(e.clientX - start.x) > TAP_SLOP_PX ||
                    Math.abs(e.clientY - start.y) > TAP_SLOP_PX
                  ) {
                    pointerStartRef.current = null;
                  }
                }}
                onPointerCancel={() => {
                  pointerStartRef.current = null;
                }}
                onPointerUp={(e) => {
                  const start = pointerStartRef.current;
                  pointerStartRef.current = null;
                  if (!canPlay || interactionLocked || !start) return;
                  if (start.id !== e.pointerId || start.playerId !== player.id) {
                    return;
                  }
                  if (
                    Math.abs(e.clientX - start.x) > TAP_SLOP_PX ||
                    Math.abs(e.clientY - start.y) > TAP_SLOP_PX
                  ) {
                    return;
                  }
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
