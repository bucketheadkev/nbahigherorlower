import type { Position, TradePlayer } from './types';
import { LINEUP_POSITIONS } from './startingLineup';

/**
 * Explicit multi-position stars (id → slots they may occupy).
 * Everyone else is primary-only — no natural wing/big alternates.
 */
const POSITION_OVERRIDES: Record<string, Position[]> = {
  lebron: ['PG', 'SG', 'SF', 'PF', 'C'],
  james: ['PG', 'SG', 'SF', 'PF', 'C'],
  giannis: ['SF', 'PF', 'C'],
  doncic: ['PG', 'SG', 'SF'],
  durant: ['SG', 'SF', 'PF'],
  jokic: ['C', 'PF'],
  embiid: ['C', 'PF'],
  tatum: ['SF', 'PF'],
  butler: ['SF', 'PF'],
  kawhi: ['SG', 'SF'],
  leonard: ['SG', 'SF'],
  davis: ['PF', 'C'],
  towns: ['C', 'PF'],
  bam: ['PF', 'C'],
  adebayo: ['PF', 'C'],
  curry: ['PG', 'SG'],
  harden: ['PG', 'SG'],
  booker: ['SG', 'SF'],
  mitchell: ['PG', 'SG'],
  morant: ['PG', 'SG'],
  wemby: ['PF', 'C'],
  wembanyama: ['PF', 'C'],
};

function uniquePositions(list: Position[]): Position[] {
  const seen = new Set<Position>();
  const out: Position[] = [];
  for (const pos of list) {
    if (!seen.has(pos)) {
      seen.add(pos);
      out.push(pos);
    }
  }
  return out;
}

function overrideKeyForPlayer(player: TradePlayer): string | null {
  const id = player.id.toLowerCase();
  if (POSITION_OVERRIDES[id]) return id;
  // Historical decade IDs look like hist_2010s_LAL_lebron_james
  const nameKey = player.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (nameKey.includes('lebron')) return 'lebron';
  if (nameKey.includes('giannis')) return 'giannis';
  if (nameKey.includes('doncic') || nameKey.includes('dončić')) return 'doncic';
  if (nameKey.includes('durant')) return 'durant';
  if (nameKey.includes('jokic') || nameKey.includes('jokić')) return 'jokic';
  if (nameKey.includes('embiid')) return 'embiid';
  if (nameKey.includes('tatum')) return 'tatum';
  if (nameKey.includes('butler')) return 'butler';
  if (nameKey.includes('leonard')) return 'leonard';
  if (nameKey.includes('anthony davis') || nameKey === 'davis') return 'davis';
  if (nameKey.includes('towns')) return 'towns';
  if (nameKey.includes('adebayo')) return 'adebayo';
  if (nameKey.includes('stephen curry') || nameKey === 'curry') return 'curry';
  if (nameKey.includes('harden')) return 'harden';
  if (nameKey.includes('booker')) return 'booker';
  if (nameKey.includes('donovan mitchell') || nameKey === 'mitchell') return 'mitchell';
  if (nameKey.includes('morant')) return 'morant';
  if (nameKey.includes('wembanyama') || nameKey.includes('wemby')) return 'wemby';
  // Fallback: last token of modern ids
  const last = id.split(/[_-]/).pop();
  if (last && POSITION_OVERRIDES[last]) return last;
  return null;
}

/**
 * Positions this player may occupy.
 * Default: primary only. Overrides (e.g. LeBron) keep multi-slot flexibility.
 */
export function getEligiblePositions(player: TradePlayer): Position[] {
  const key = overrideKeyForPlayer(player);
  if (key) {
    const override = POSITION_OVERRIDES[key];
    if (override) return uniquePositions(override);
  }
  return [player.primaryPosition];
}

export function playerFitsSlot(player: TradePlayer, slot: Position): boolean {
  return getEligiblePositions(player).includes(slot);
}

export function canMoveToSlot(
  player: TradePlayer,
  fromSlot: Position,
  toSlot: Position,
): boolean {
  if (fromSlot === toSlot) return false;
  return playerFitsSlot(player, toSlot);
}

export function hasAlternatePositions(player: TradePlayer): boolean {
  return getEligiblePositions(player).length > 1;
}

export function formatEligiblePositions(player: TradePlayer): string {
  return getEligiblePositions(player).join('/');
}

export { LINEUP_POSITIONS };
