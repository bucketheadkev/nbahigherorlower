/**
 * Draft-run generation for TradeUp:
 * Trade Tokens → position-ordered prints (PG→C) → optional Trade Up → vault.
 *
 * Accuracy rule: every ticket's team × era must match a real historical
 * decade-roster row. Never stamp modern ALL_PLAYERS onto an unrelated spin.
 */

import {
  buildEraRoster,
  listValidSpinPairs,
  type DecadeEra,
  type EraOfferPlayer,
  type SpinPair,
  type ValuedPlayer,
  withValue,
} from './billionDollar';
import { playerFitsSlot } from './alternatePositions';
import { getPlayerTier } from './tiers';
import { LINEUP_POSITIONS } from './startingLineup';
import type { Position, TeamInfo, TradePlayer } from './types';

export type DraftTicket = ValuedPlayer & {
  era: DecadeEra;
  team: TeamInfo;
  eraStats?: { ppg: number; rpg: number; apg: number };
  /** Slot this ticket fills (PG→C order). */
  slot: Position;
  /** Whether this ticket already used its one Trade Up */
  tradedUp: boolean;
  ticketId?: string;
  serial?: string;
};

export type TradeUpOption = DraftTicket;

function stampTicketMeta(ticket: DraftTicket, slotIndex: number): DraftTicket {
  return {
    ...ticket,
    ticketId:
      ticket.ticketId ??
      `TU-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`,
    serial:
      ticket.serial ??
      `${String(slotIndex + 1).padStart(2, '0')}-${Math.floor(Math.random() * 9000 + 1000)}`,
  };
}

function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

function pickOne<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

/** High B (TV 70+) through Low GOAT — never below High B. */
export function isStarterTierEligible(player: TradePlayer): boolean {
  return player.tradeValue >= 70;
}

/** Low S through High GOAT for Trade Up options. */
export function isTradeUpTierEligible(player: TradePlayer): boolean {
  return player.tradeValue >= 92;
}

export function isLowSOrBetter(player: TradePlayer): boolean {
  return player.tradeValue >= 92;
}

/**
 * Award 1–4 Trade Up Tokens for this run only.
 * 1 most common · 2 common · 3 uncommon · 4 very rare. Never 0.
 */
export function rollTradeTokens(): number {
  const roll = Math.random();
  if (roll < 0.52) return 1;
  if (roll < 0.82) return 2;
  if (roll < 0.96) return 3;
  return 4;
}

export function currentDraftPosition(filledCount: number): Position {
  return LINEUP_POSITIONS[Math.min(filledCount, LINEUP_POSITIONS.length - 1)]!;
}

function toDraftTicket(
  player: EraOfferPlayer | ValuedPlayer,
  team: TeamInfo,
  era: DecadeEra,
  slot: Position,
): DraftTicket {
  const valued =
    'dollarValue' in player && typeof player.dollarValue === 'number'
      ? player
      : withValue(player);
  return {
    ...valued,
    team,
    era,
    slot,
    eraStats:
      'eraStats' in player && player.eraStats
        ? player.eraStats
        : {
            ppg: valued.stats.ppg,
            rpg: valued.stats.rpg,
            apg: valued.stats.apg,
          },
    tradedUp: false,
  };
}

function excludeNames(
  pool: EraOfferPlayer[],
  usedNames: Set<string>,
): EraOfferPlayer[] {
  return pool.filter((p) => !usedNames.has(normalizeName(p.name)));
}

function filterTv(
  pool: EraOfferPlayer[],
  minTv: number,
  maxTv = 99,
): EraOfferPlayer[] {
  return pool.filter((p) => p.tradeValue >= minTv && p.tradeValue <= maxTv);
}

function filterSlot(
  pool: EraOfferPlayer[],
  slot: Position,
): EraOfferPlayer[] {
  return pool.filter((p) => playerFitsSlot(p, slot));
}

/**
 * Exact team×era historical pool only — never invent identities.
 */
function exactPairPool(
  pair: SpinPair,
  usedNames: Set<string>,
  minTv: number,
  slot: Position,
): EraOfferPlayer[] {
  return filterSlot(
    filterTv(excludeNames(buildEraRoster(pair.team, pair.era), usedNames), minTv),
    slot,
  );
}

/**
 * Valid spin pairs that have at least one position-eligible player at minTv.
 */
export function listSpinPairsForPosition(
  slot: Position,
  minTv = 70,
): SpinPair[] {
  return listValidSpinPairs().filter((pair) => {
    const roster = buildEraRoster(pair.team, pair.era);
    return roster.some(
      (p) => p.tradeValue >= minTv && playerFitsSlot(p, slot),
    );
  });
}

/**
 * Gather historical players across the decade DB for a slot.
 * Each entry keeps its real team × era identity.
 */
function historicalSlotPool(
  slot: Position,
  usedNames: Set<string>,
  minTv: number,
): Array<{ player: EraOfferPlayer; pair: SpinPair }> {
  const out: Array<{ player: EraOfferPlayer; pair: SpinPair }> = [];
  const seen = new Set<string>();

  for (const pair of listValidSpinPairs()) {
    for (const player of exactPairPool(pair, usedNames, minTv, slot)) {
      const key = `${normalizeName(player.name)}|${pair.team.id}|${pair.era}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ player, pair });
    }
  }
  return out;
}

function weightedStarterPick(
  pool: EraOfferPlayer[],
  needStar: boolean,
): EraOfferPlayer | undefined {
  if (pool.length === 0) return undefined;
  if (needStar) {
    const stars = filterTv(pool, 92);
    if (stars.length > 0) return pickOne(stars);
  }

  const highB = filterTv(pool, 70, 91);
  const lowS = filterTv(pool, 92, 93);
  const midS = filterTv(pool, 94, 94);
  const highS = filterTv(pool, 95, 96);
  const lowGoat = filterTv(pool, 97, 97);

  const buckets: { weight: number; items: EraOfferPlayer[] }[] = [
    { weight: 28, items: highB },
    { weight: 26, items: lowS },
    { weight: 18, items: midS },
    { weight: 18, items: highS },
    { weight: 10, items: lowGoat },
  ].filter((b) => b.items.length > 0);

  if (buckets.length === 0) return pickOne(pool);

  const total = buckets.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * total;
  for (const b of buckets) {
    r -= b.weight;
    if (r <= 0) return pickOne(b.items);
  }
  return pickOne(buckets[buckets.length - 1]!.items);
}

/**
 * Pick the auto-printed player for a spin at the current position.
 * Ticket team/era always match the historical row (the spun pair).
 */
export function pickPrintedPlayer(
  pair: SpinPair,
  roster: DraftTicket[],
  slot: Position = currentDraftPosition(roster.length),
): DraftTicket {
  const used = new Set(roster.map((t) => normalizeName(t.name)));
  const starsHave = roster.filter((t) => isLowSOrBetter(t)).length;
  const remaining = 5 - roster.length;
  const forceStar = starsHave < 2 && remaining <= 2 - starsHave;
  const needStar = starsHave < 2 && remaining <= 2 - starsHave + 1;
  const minTv = forceStar ? 92 : 70;

  let pool = exactPairPool(pair, used, minTv, slot);
  let ticketPair = pair;

  // If this pair is thin for the slot, pull another real historical placement —
  // still never invent team×era.
  if (pool.length === 0) {
    const broader = historicalSlotPool(slot, used, minTv);
    const pick = pickOne(broader);
    if (pick) {
      pool = [pick.player];
      ticketPair = pick.pair;
    }
  }
  if (pool.length === 0) {
    const any = historicalSlotPool(slot, used, 50);
    const pick = pickOne(any);
    if (pick) {
      pool = [pick.player];
      ticketPair = pick.pair;
    }
  }

  const picked =
    weightedStarterPick(pool, forceStar || needStar) ?? pickOne(pool);

  if (!picked) {
    // Absolute last resort: any historical slot player (should be unreachable).
    const emergency = historicalSlotPool(slot, used, 22);
    const fall = emergency[0];
    if (!fall) {
      throw new Error(`[draftRun] No historical players for slot ${slot}`);
    }
    return stampTicketMeta(
      toDraftTicket(fall.player, fall.pair.team, fall.pair.era, slot),
      roster.length,
    );
  }

  return stampTicketMeta(
    toDraftTicket(picked, ticketPair.team, ticketPair.era, slot),
    roster.length,
  );
}

/**
 * Three Trade Up options for the current position.
 * Each option keeps its real historical team × era.
 */
export function generateTradeUpOptions(
  current: DraftTicket,
  roster: DraftTicket[],
  slot: Position = current.slot,
): TradeUpOption[] {
  const used = new Set([
    ...roster.map((t) => normalizeName(t.name)),
    normalizeName(current.name),
  ]);

  const entries = historicalSlotPool(slot, used, 92);
  const byPlayer = entries.map((e) => e.player);
  const lowGoat = filterTv(byPlayer, 97, 97);
  const midHighGoat = filterTv(byPlayer, 98, 99);
  const sTier = filterTv(byPlayer, 92, 96);

  const picks: EraOfferPlayer[] = [];
  const take = (list: EraOfferPlayer[]) => {
    const p = pickOne(list.filter((x) => !picks.some((y) => y.id === x.id)));
    if (p) picks.push(p);
  };

  if (lowGoat.length > 0 && Math.random() < 0.55) take(lowGoat);
  if (midHighGoat.length > 0 && Math.random() < 0.12) take(midHighGoat);

  while (picks.length < 3) {
    if (sTier.length > 0) take(sTier);
    else if (byPlayer.length > 0) take(byPlayer);
    else break;
  }

  // If still short, relax TV but stay historical + on-slot
  if (picks.length < 3) {
    for (const entry of shuffle(historicalSlotPool(slot, used, 70))) {
      if (picks.some((p) => p.id === entry.player.id)) continue;
      picks.push(entry.player);
      if (picks.length >= 3) break;
    }
  }

  return shuffle(picks)
    .slice(0, 3)
    .map((p, i) => {
      const match =
        entries.find((e) => e.player.id === p.id) ??
        historicalSlotPool(slot, new Set(), 22).find((e) => e.player.id === p.id);
      if (!match) {
        return stampTicketMeta(
          {
            ...toDraftTicket(p, current.team, current.era, slot),
            tradedUp: true,
          },
          i,
        );
      }
      return stampTicketMeta(
        {
          ...toDraftTicket(match.player, match.pair.team, match.pair.era, slot),
          tradedUp: true,
        },
        i,
      );
    });
}

/** Always "1980s Bulls" — decade first, then team nickname/full name. */
export function formatTicketHeadline(team: TeamInfo, era: DecadeEra): string {
  const decade = era.replace(/s$/i, '').trim();
  const nick = team.name?.trim() || team.fullName;
  return `${decade}s ${nick}`;
}

export function draftTicketTierLabel(player: TradePlayer): string {
  return getPlayerTier(player);
}

export function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}
