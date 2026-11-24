'use client';

import { memo, useRef, type CSSProperties, type ReactNode } from 'react';
import type { EraOfferPlayer } from '@/lib/tradeup/billionDollar';
import { playerFitsSlot } from '@/lib/tradeup/alternatePositions';
import { hapticMedium, hapticTap } from '@/lib/tradeup/haptics';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import type { Position, TeamInfo } from '@/lib/tradeup/types';
import type { TicketRerollKind } from '../BallionTicketMachine';

const TAP_SLOP_PX = 18;

/** Horizontal player bar tinted with the board team's primary. */
function teamRowFill(primary: string): string {
  return `linear-gradient(180deg, ${primary} 0%, color-mix(in srgb, ${primary} 68%, #041018) 100%)`;
}

interface Props {
  team: TeamInfo;
  /** Changes when a reroll lands, so the list refreshes for the new board. */
  boardKey: string;
  offers: EraOfferPlayer[];
  openPositions: Position[];
  selectedId: string | null;
  canRerollTeam: boolean;
  canRerollEra: boolean;
  rerollsOff?: boolean;
  teamRerollLabel?: string;
  eraRerollLabel?: string;
  showValues?: boolean;
  interactionLocked?: boolean;
  hint: string;
  /** Rendered under Team/Era rerolls (Classic perks). */
  belowRerolls?: ReactNode;
  onSelect: (player: EraOfferPlayer) => void;
  onReroll: (kind: TicketRerollKind) => void;
}

function RerollIcon() {
  return (
    <svg className="ap-reroll__icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M19.2 12a7.2 7.2 0 0 1-12.6 4.8M4.8 12a7.2 7.2 0 0 1 12.6-4.8" />
      <path d="M17.6 3.4v4h-4M6.4 20.6v-4h4" />
    </svg>
  );
}

/**
 * Classic player selection (inside the draft sheet).
 * Jumbotron already shows team + era — sheet starts with rerolls + perks, then a spaced player list.
 * Position chip uses the board team's primary color. No top position filters.
 */
export const ArenaPicker = memo(function ArenaPicker({
  team,
  offers,
  openPositions,
  selectedId,
  canRerollTeam,
  canRerollEra,
  rerollsOff = false,
  teamRerollLabel,
  eraRerollLabel,
  showValues = false,
  interactionLocked = false,
  hint,
  belowRerolls,
  onSelect,
  onReroll,
}: Props) {
  const colors = getTeamColors(team.id);
  const ink = contrastOnPrimary(colors.primary);
  const muted = ink === '#ffffff' ? 'rgba(255, 255, 255, 0.78)' : 'rgba(10, 16, 28, 0.68)';
  const rowStyle = {
    background: teamRowFill(colors.primary),
    borderColor: `color-mix(in srgb, ${colors.primary} 45%, rgba(255, 255, 255, 0.35))`,
    ['--ap-ink' as string]: ink,
    ['--ap-muted' as string]: muted,
  } as CSSProperties;
  const pointer = useRef<{ id: number; x: number; y: number; playerId: string } | null>(null);
  const dragged = useRef(false);

  const reroll = (kind: TicketRerollKind, can: boolean) => {
    const open = can && !interactionLocked;
    return (
      <button
        type="button"
        className={`ap-reroll ap-reroll--${kind}${can ? '' : ' is-used'}`}
        disabled={!open}
        onPointerDown={(e) => {
          if (e.button !== 0 || !open) return;
          e.preventDefault();
          hapticMedium();
          onReroll(kind);
        }}
        onClick={(e) => e.preventDefault()}
      >
        <RerollIcon />
        <span className="ap-reroll__copy">
          <strong>{kind === 'team' ? 'REROLL TEAM' : 'REROLL ERA'}</strong>
          <em>
            {can
              ? kind === 'team'
                ? teamRerollLabel ?? 'FREE'
                : eraRerollLabel ?? 'FREE'
              : rerollsOff
                ? 'OFF'
                : 'USED'}
          </em>
        </span>
      </button>
    );
  };

  return (
    <section className="ap" aria-label="Player selection">
      <div className="ap__rerolls">
        {reroll('team', canRerollTeam)}
        {reroll('era', canRerollEra)}
      </div>

      {belowRerolls ? <div className="ap__below-rerolls">{belowRerolls}</div> : null}

      <p className="ap__hint">{hint}</p>

      <ul className="ap__list" aria-label="Available players">
        {offers.length === 0 ? <li className="ap__empty">No players on this board.</li> : null}
        {offers.map((player) => {
          const selected = selectedId === player.id;
          const ineligible = !openPositions.some((pos) => playerFitsSlot(player, pos));
          return (
            <li key={player.id}>
              <button
                type="button"
                className={`ap-row${selected ? ' is-selected' : ''}${ineligible ? ' is-disabled' : ''}`}
                style={rowStyle}
                data-draft-player-id={player.id}
                disabled={ineligible}
                aria-pressed={selected}
                onPointerDown={(e) => {
                  dragged.current = false;
                  if (ineligible || e.button !== 0) return;
                  pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, playerId: player.id };
                }}
                onPointerMove={(e) => {
                  const start = pointer.current;
                  if (!start || start.id !== e.pointerId) return;
                  // Vertical list: only Y travel counts as scroll (ignore X jitter).
                  if (Math.abs(e.clientY - start.y) > TAP_SLOP_PX) {
                    pointer.current = null;
                    dragged.current = true;
                  }
                }}
                onPointerCancel={() => {
                  pointer.current = null;
                  dragged.current = true;
                }}
                onPointerUp={(e) => {
                  const start = pointer.current;
                  if (!start || start.id !== e.pointerId) return;
                  pointer.current = null;
                  // A scroll that ends on a row is not a pick.
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  if (ineligible || interactionLocked) return;
                  hapticTap();
                  onSelect(player);
                }}
                onClick={(e) => {
                  // Selection already handled on pointerup (avoids click lag).
                  e.preventDefault();
                }}
              >
                <span className="ap-row__pos" style={{ background: colors.primary, color: ink }}>
                  {player.primaryPosition}
                </span>
                <span className="ap-row__meta">
                  <strong>{player.name}</strong>
                  <em>
                    {showValues ? (
                      <>${Math.round(player.dollarValue).toLocaleString('en-US')}</>
                    ) : (
                      <>
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
                      </>
                    )}
                  </em>
                </span>
                <span className={`ap-row__check${selected ? ' is-on' : ''}`} aria-hidden>
                  {selected ? (
                    <svg viewBox="0 0 24 24">
                      <path d="M5.5 12.5l4.2 4.2 8.8-9.4" />
                    </svg>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
