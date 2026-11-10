'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { EraOfferPlayer } from '@/lib/tradeup/billionDollar';
import { getEligiblePositions, playerFitsSlot } from '@/lib/tradeup/alternatePositions';
import { hapticLight, hapticMedium } from '@/lib/tradeup/haptics';
import { LINEUP_POSITIONS } from '@/lib/tradeup/startingLineup';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import type { Position, TeamInfo } from '@/lib/tradeup/types';
import type { TicketRerollKind } from '../BallionTicketMachine';

const TAP_SLOP_PX = 18;
type Filter = 'ALL' | Position;

interface Props {
  team: TeamInfo;
  /** Changes when a reroll lands, so the filter resets for the new board. */
  boardKey: string;
  offers: EraOfferPlayer[];
  openPositions: Position[];
  selectedId: string | null;
  canRerollTeam: boolean;
  canRerollEra: boolean;
  rerollsOff?: boolean;
  interactionLocked?: boolean;
  hint: string;
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
 * Classic player selection (inside the draft sheet). The Jumbotron already shows the team and era,
 * so this is the rerolls, position filters and the players.
 */
export const ArenaPicker = memo(function ArenaPicker({
  team,
  boardKey,
  offers,
  openPositions,
  selectedId,
  canRerollTeam,
  canRerollEra,
  rerollsOff = false,
  interactionLocked = false,
  hint,
  onSelect,
  onReroll,
}: Props) {
  const colors = getTeamColors(team.id);
  const ink = contrastOnPrimary(colors.primary);
  const [filter, setFilter] = useState<Filter>('ALL');
  const pointer = useRef<{ id: number; x: number; y: number; playerId: string } | null>(null);
  const dragged = useRef(false);

  useEffect(() => setFilter('ALL'), [boardKey]);

  const counts = useMemo(() => {
    const out = {} as Record<Position, number>;
    for (const pos of LINEUP_POSITIONS) out[pos] = offers.filter((p) => playerFitsSlot(p, pos)).length;
    return out;
  }, [offers]);
  const shown = filter === 'ALL' ? offers : offers.filter((p) => playerFitsSlot(p, filter));

  const reroll = (kind: TicketRerollKind, can: boolean) => {
    const open = can && !interactionLocked;
    return (
      <button
        type="button"
        className={`ap-reroll ap-reroll--${kind}${can ? '' : ' is-used'}`}
        disabled={!open}
        onClick={(e) => {
          e.preventDefault();
          if (!open) return;
          hapticMedium();
          onReroll(kind);
        }}
      >
        <RerollIcon />
        <span className="ap-reroll__copy">
          <strong>{kind === 'team' ? 'REROLL TEAM' : 'REROLL ERA'}</strong>
          <em>{can ? '1 FREE' : rerollsOff ? 'OFF' : 'USED'}</em>
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

      <div className="ap__filters" role="tablist" aria-label="Filter by position">
        {(['ALL', ...LINEUP_POSITIONS] as Filter[]).map((key) => {
          const filled = key !== 'ALL' && !openPositions.includes(key);
          const count = key === 'ALL' ? offers.length : counts[key];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`ap-filter${filter === key ? ' is-on' : ''}${filled ? ' is-filled' : ''}${
                count === 0 ? ' is-empty' : ''
              }`}
              onClick={() => {
                hapticLight();
                setFilter(key);
              }}
            >
              <span className="ap-filter__label">{key}</span>
              <span className="ap-filter__count">{filled ? '✓' : count}</span>
            </button>
          );
        })}
      </div>

      <p className="ap__hint">{hint}</p>

      <ul className="ap__list" aria-label="Available players">
        {shown.length === 0 ? (
          <li className="ap__empty">No {filter} on this board — try another position.</li>
        ) : null}
        {shown.map((player) => {
          const selected = selectedId === player.id;
          const eligible = getEligiblePositions(player);
          const ineligible = !openPositions.some((pos) => playerFitsSlot(player, pos));
          return (
            <li key={player.id}>
              <button
                type="button"
                className={`ap-row${selected ? ' is-selected' : ''}${ineligible ? ' is-disabled' : ''}`}
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
                  if (Math.abs(e.clientX - start.x) > TAP_SLOP_PX || Math.abs(e.clientY - start.y) > TAP_SLOP_PX) {
                    pointer.current = null;
                    dragged.current = true;
                  }
                }}
                onPointerCancel={() => {
                  pointer.current = null;
                  dragged.current = true;
                }}
                onClick={() => {
                  pointer.current = null;
                  // A scroll that ends on a row is not a pick.
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  if (ineligible || interactionLocked) return;
                  onSelect(player);
                }}
              >
                <span className="ap-row__pos" style={{ background: colors.primary, color: ink }}>
                  {player.primaryPosition}
                </span>
                <span className="ap-row__meta">
                  <strong>{player.name}</strong>
                  <em>
                    {Number.isFinite(player.eraStats?.ppg) ? `${player.eraStats.ppg.toFixed(1)} PTS` : '— PTS'}
                    {' · '}
                    {Number.isFinite(player.eraStats?.rpg) ? `${player.eraStats.rpg.toFixed(1)} REB` : '— REB'}
                    {' · '}
                    {Number.isFinite(player.eraStats?.apg) ? `${player.eraStats.apg.toFixed(1)} AST` : '— AST'}
                  </em>
                  <span className="ap-row__fits" aria-label={`Plays ${eligible.join(', ')}`}>
                    <span className="ap-row__fits-label" aria-hidden>
                      PLAYS
                    </span>
                    {eligible.map((pos) => (
                      <span key={pos} className={openPositions.includes(pos) ? 'is-open' : 'is-taken'}>
                        {pos}
                      </span>
                    ))}
                  </span>
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
