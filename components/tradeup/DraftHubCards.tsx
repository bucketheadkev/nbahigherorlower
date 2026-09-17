'use client';

import {
  type CSSProperties,
  useEffect,
  useRef,
  useState,
} from 'react';
import { POSITION_LABELS } from '@/lib/tradeup/startingLineup';
import { contrastOnPrimary, getTeamColors } from '@/lib/tradeup/teamColors';
import { getTeam } from '@/lib/tradeup/teams';
import { eraShortLabel, type DecadeEra, type ValuedPlayer } from '@/lib/tradeup/billionDollar';
import type { Position } from '@/lib/tradeup/types';

export type HubCardPlayer = ValuedPlayer & { era?: DecadeEra };

type DraftHubCardsProps = {
  slots: Record<Position, HubCardPlayer | null>;
  justFilledSlot?: Position | null;
};

/** Court slot order for a11y / DOM (paint → wings → point). */
const COURT_SLOTS: Position[] = ['PF', 'C', 'SG', 'SF', 'PG'];

function resolveEra(player: HubCardPlayer): DecadeEra | null {
  if (player.era) return player.era;
  const match = /^hist_(\d{4}s)_/.exec(player.id);
  if (match) return match[1] as DecadeEra;
  return null;
}

function teamLine(player: HubCardPlayer): string {
  const team = getTeam(player.teamId);
  if (!team) return player.teamId;
  return `${team.city} ${team.name}`.trim();
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '—', last: '' };
  if (parts.length === 1) return { first: parts[0]!, last: '' };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}

function playerInitials(name: string): string {
  const { first, last } = splitName(name);
  if (!last) return first.slice(0, 2).toUpperCase();
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

/**
 * Experimental classic-hub court roster (replaces the five position rows).
 * Flip EXPERIMENTAL_DRAFT_HUB_CARDS off in BillionTradeEngine to restore the rows.
 *
 * True bird's-eye half-court: PF/C in paint, SG/SF/PG outside the 3-point arc.
 */
export function DraftHubCards({ slots, justFilledSlot = null }: DraftHubCardsProps) {
  const [detailSlot, setDetailSlot] = useState<Position | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  const detailPlayer = detailSlot ? slots[detailSlot] : null;
  const detailColors = detailPlayer ? getTeamColors(detailPlayer.teamId) : null;
  const detailInk = detailColors
    ? contrastOnPrimary(detailColors.primary)
    : undefined;

  useEffect(() => {
    if (!detailSlot) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailSlot(null);
    };

    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest('.draft-hub-court__pop')) return;
      if (target.closest('.draft-hub-court__slot')) return;
      setDetailSlot(null);
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [detailSlot]);

  useEffect(() => {
    if (detailSlot && !slots[detailSlot]) setDetailSlot(null);
  }, [detailSlot, slots]);

  return (
    <aside
      ref={rootRef}
      className="draft-hub-court"
      aria-label="Your five"
    >
      <div className="draft-hub-court__floor" aria-hidden="true">
        {/*
          Reference half-court: near-square frame (fills width), paint + FT
          circle centered on midline, shallow 3pt, PG just under the arc.
        */}
        <svg
          className="draft-hub-court__lines"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Outer boundary */}
          <rect x="1.2" y="1.2" width="97.6" height="97.6" rx="0.4" />

          {/* Paint — centered on midline, bottom edge = free-throw line */}
          <rect x="28" y="1.2" width="44" height="51.7" />

          {/* FT circle bisected by free-throw line (cy = paint bottom) */}
          <path
            d="M 34 52.9 A 16 16 0 0 1 66 52.9"
            strokeDasharray="2.4 2.2"
          />
          <path d="M 34 52.9 A 16 16 0 0 0 66 52.9" />

          {/* 3pt arc — meets the outer sidelines so it reads continuous */}
          <path d="M 1.2 46.78 A 54.2 54.2 0 0 0 98.8 46.78" />
        </svg>
      </div>

      {COURT_SLOTS.map((slot) => {
        const player = slots[slot];
        const colors = player ? getTeamColors(player.teamId) : null;
        const ink = colors ? contrastOnPrimary(colors.primary) : undefined;
        const filled = Boolean(player);
        const seating = justFilledSlot === slot && filled;
        const open = detailSlot === slot && filled;

        return (
          <button
            key={slot}
            type="button"
            className={`draft-hub-court__slot draft-hub-court__slot--${slot.toLowerCase()}${
              filled ? ' is-filled' : ' is-empty'
            }${seating ? ' is-seating-in' : ''}${open ? ' is-open' : ''}`}
            style={
              filled && colors
                ? ({
                    '--slot-primary': colors.primary,
                    '--slot-accent': colors.accent,
                    '--slot-ink': ink,
                    backgroundColor: colors.primary,
                    color: ink,
                    borderColor: colors.primary,
                  } as CSSProperties)
                : undefined
            }
            aria-label={
              player
                ? `${POSITION_LABELS[slot]}: ${player.name}`
                : `Empty ${POSITION_LABELS[slot]}`
            }
            aria-expanded={open || undefined}
            onClick={(event) => {
              event.stopPropagation();
              if (!player) {
                setDetailSlot(null);
                return;
              }
              setDetailSlot((prev) => (prev === slot ? null : slot));
            }}
          >
            <span className="draft-hub-court__slot-ring" aria-hidden="true" />
            <span className="draft-hub-court__slot-mark">
              {player ? playerInitials(player.name) : slot}
            </span>
          </button>
        );
      })}

      {detailSlot && detailPlayer && detailColors ? (
        <div
          className={`draft-hub-court__pop draft-hub-court__pop--${detailSlot.toLowerCase()}`}
          role="dialog"
          aria-label={`${POSITION_LABELS[detailSlot]} details`}
          style={
            {
              '--slot-primary': detailColors.primary,
              '--slot-accent': detailColors.accent,
              '--slot-ink': detailInk,
            } as CSSProperties
          }
          onPointerDown={(event) => event.stopPropagation()}
        >
          {(() => {
            const { first, last } = splitName(detailPlayer.name);
            const era = resolveEra(detailPlayer);
            return (
              <>
                <p className="draft-hub-court__pop-pos">{detailSlot}</p>
                <p className="draft-hub-court__pop-first">{first}</p>
                {last ? (
                  <p className="draft-hub-court__pop-last">{last}</p>
                ) : null}
                <p className="draft-hub-court__pop-team">{teamLine(detailPlayer)}</p>
                {era ? (
                  <p className="draft-hub-court__pop-era">{eraShortLabel(era)}</p>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}
    </aside>
  );
}
