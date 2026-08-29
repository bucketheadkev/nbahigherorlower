import { getDollarValueForSlot, type DecadeEra, type ValuedPlayer } from './billionDollar';
import type { H2HPosition } from '@/lib/multiplayer/h2hPenalty';
import type { H2HPickSelection } from '@/lib/multiplayer/h2hState';
import type { Position, TeamInfo } from './types';
import { TEAMS } from './teams';

export type SyncedH2HPick = {
  position: H2HPosition;
  selection: H2HPickSelection;
  raw_value: number;
};

/** Server pick → local roster player for BillionTradeEngine. */
export function pickSelectionToPlayer(
  selection: H2HPickSelection,
  rawValue: number,
): ValuedPlayer {
  const primary = (selection.primarySlot ?? selection.position) as Position;
  const dollarValue = selection.baseDollarValue ?? rawValue;
  return {
    id: selection.playerId,
    name: selection.name,
    teamId: selection.teamId,
    primaryPosition: primary,
    position: primary,
    age: 28,
    stats: { ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0 },
    tradeValue: dollarValue,
    isStarter: true,
    dollarValue,
  };
}

/** Local roster player → server lock payload. */
export function playerToH2HPick(
  player: ValuedPlayer,
  slot: Position,
  era: DecadeEra,
  team?: TeamInfo | null,
): { selection: H2HPickSelection; rawValue: number } {
  const rawValue = Math.round(getDollarValueForSlot(player, slot));
  const teamName =
    team?.fullName ?? TEAMS.find((t) => t.id === player.teamId)?.fullName ?? '—';
  return {
    rawValue,
    selection: {
      name: player.name,
      position: slot as H2HPosition,
      teamId: player.teamId,
      teamName,
      era,
      dollarValue: rawValue,
      playerId: player.id,
      primarySlot: player.primaryPosition as H2HPosition,
      baseDollarValue: player.dollarValue,
    },
  };
}

export function syncedPicksToSlots(
  picks: SyncedH2HPick[],
): Partial<Record<Position, ValuedPlayer>> {
  const out: Partial<Record<Position, ValuedPlayer>> = {};
  for (const pick of picks) {
    out[pick.position as Position] = pickSelectionToPlayer(pick.selection, pick.raw_value);
  }
  return out;
}
