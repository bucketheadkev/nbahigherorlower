import { ALL_PLAYERS } from './rosters';
import { getEligibleForSlot, getPlayersByPrimaryPosition } from './lineupEligibility';
import { OFFERS_PER_CARD, canAffordPurchase, getPlayerPrice } from './lineupBudget';
import {
  assertLineupPositionsInDev,
  assertPrimaryPositionsInDev,
  assertTradeUpOffersInDev,
} from './primaryPositionValidation';
import { LINEUP_POSITIONS } from './startingLineup';
import { isSTier } from './tiers';
import type { Position, TradePlayer } from './types';

assertPrimaryPositionsInDev();

/**
 * Chance that a new run’s five free cards include at least one S-tier player.
 * When this rolls true, exactly one random position is assigned the S-tier slot;
 * other positions still use the normal pool and can independently roll S (rare).
 */
export const FREE_LINEUP_GUARANTEED_S_CHANCE = 0.65;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function fingerprint(ids: string[]): string {
  return [...ids].sort().join('|');
}

/** Roll once per run: which free slot (if any) is forced to an S-tier player. */
export function rollGuaranteedSSlot(): Position | null {
  if (Math.random() >= FREE_LINEUP_GUARANTEED_S_CHANCE) return null;
  const eligibleSlots = LINEUP_POSITIONS.filter((slot) =>
    getPlayersByPrimaryPosition(slot).some(isSTier),
  );
  if (eligibleSlots.length === 0) return null;
  const index = Math.floor(Math.random() * eligibleSlots.length);
  return eligibleSlots[index] ?? null;
}

/**
 * Preassign all five free cards when a run starts. This lets the reveal UI
 * react to hidden player traits without exposing the player before the flip.
 */
export function generateFreeLineup(guaranteedSSlot: Position | null): Record<Position, TradePlayer> {
  const usedIds = new Set<string>();
  const players = {} as Record<Position, TradePlayer>;

  for (const slot of LINEUP_POSITIONS) {
    const player = generateFreePlayer({
      slot,
      excludeIds: usedIds,
      preferSTier: slot === guaranteedSSlot,
    });
    if (!player) {
      throw new Error(`Unable to generate a free player for ${slot}.`);
    }
    players[slot] = player;
    usedIds.add(player.id);
  }

  assertLineupPositionsInDev(players);
  return players;
}

/** One free random player for a position (F through S). */
export function generateFreePlayer(options: {
  slot: Position;
  excludeIds: Set<string>;
  /** When true, prefer an S-tier eligible player for this slot. */
  preferSTier?: boolean;
}): TradePlayer | null {
  const pool = getEligibleForSlot(options.slot, ALL_PLAYERS, options.excludeIds);
  if (pool.length === 0) return null;

  if (options.preferSTier) {
    const sPool = pool.filter(isSTier);
    if (sPool.length > 0) return shuffle(sPool)[0] ?? null;
  }

  return shuffle(pool)[0] ?? null;
}

/**
 * Build up to 3 market alternatives for a position.
 * Filters by primaryPosition first, then affordability / uniqueness.
 * Never fills gaps with players from other positions.
 */
export function generateMarketOffers(options: {
  slot: Position;
  credits: number;
  excludeIds: Set<string>;
  avoidFingerprint?: string | null;
}): TradePlayer[] {
  const { slot, credits, excludeIds, avoidFingerprint } = options;
  const pool = getEligibleForSlot(slot, ALL_PLAYERS, excludeIds);
  if (pool.length === 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[primaryPosition] Trade Up ${slot}: no same-position candidates after exclusions.`,
      );
    }
    assertTradeUpOffersInDev(slot, []);
    return [];
  }

  const affordable = shuffle(
    pool.filter((player) => canAffordPurchase(credits, getPlayerPrice(player))),
  );
  const others = shuffle(
    pool.filter((player) => !canAffordPurchase(credits, getPlayerPrice(player))),
  );
  const maxOffers = Math.min(OFFERS_PER_CARD, pool.length);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const picks = new Map<string, TradePlayer>();

    // Prefer at least one affordable option when possible (market is optional).
    const anchor = affordable[attempt % Math.max(1, affordable.length)] ?? pool[0];
    if (anchor) picks.set(anchor.id, anchor);

    const preferred = shuffle([
      ...affordable.filter((player) => player.id !== anchor?.id),
      ...others.slice(0, Math.max(4, maxOffers)),
    ]);

    for (const player of preferred) {
      if (picks.size >= maxOffers) break;
      picks.set(player.id, player);
    }

    if (picks.size < maxOffers) {
      for (const player of shuffle(pool)) {
        if (picks.size >= maxOffers) break;
        picks.set(player.id, player);
      }
    }

    const offers = Array.from(picks.values()).slice(0, maxOffers);
    const print = fingerprint(offers.map((player) => player.id));
    if (!avoidFingerprint || print !== avoidFingerprint || attempt === 7) {
      assertTradeUpOffersInDev(slot, offers);
      return shuffle(offers);
    }
  }

  const fallback = shuffle(pool).slice(0, maxOffers);
  assertTradeUpOffersInDev(slot, fallback);
  return fallback;
}

export function offersFingerprint(ids: string[]): string {
  return fingerprint(ids);
}
