import type { Position, TradePlayer } from './types';
import { LINEUP_POSITIONS } from './startingLineup';

/**
 * Explicit multi-position stars (id / name-key → slots they may occupy).
 * Combined with mild natural alternates from primary position.
 */
const POSITION_OVERRIDES: Record<string, Position[]> = {
  // Modern / all-era stars
  lebron: ['PG', 'SG', 'SF', 'PF', 'C'],
  james: ['PG', 'SG', 'SF', 'PF', 'C'],
  giannis: ['SF', 'PF', 'C'],
  doncic: ['PG', 'SG', 'SF'],
  durant: ['SG', 'SF', 'PF'],
  jokic: ['C', 'PF'],
  embiid: ['C', 'PF'],
  tatum: ['SF', 'PF'],
  butler: ['SG', 'SF', 'PF'],
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
  // Classic / decade legends — realistic secondaries
  iverson: ['PG', 'SG'],
  'allen iverson': ['PG', 'SG'],
  jordan: ['SG', 'SF'],
  'michael jordan': ['SG', 'SF'],
  kobe: ['SG', 'SF'],
  bryant: ['SG', 'SF'],
  magic: ['PG', 'SG', 'SF'],
  'magic johnson': ['PG', 'SG', 'SF'],
  bird: ['SF', 'PF'],
  'larry bird': ['SF', 'PF'],
  stockton: ['PG', 'SG'],
  payton: ['PG', 'SG'],
  'gary payton': ['PG', 'SG'],
  pippen: ['SG', 'SF', 'PF'],
  'scottie pippen': ['SG', 'SF', 'PF'],
  garnett: ['PF', 'C'],
  'kevin garnett': ['PF', 'C'],
  duncan: ['PF', 'C'],
  'tim duncan': ['PF', 'C'],
  dirk: ['PF', 'C'],
  nowitzki: ['PF', 'C'],
  'dirk nowitzki': ['PF', 'C'],
  westbrook: ['PG', 'SG'],
  wall: ['PG', 'SG'],
  rose: ['PG', 'SG'],
  'derrick rose': ['PG', 'SG'],
  cp3: ['PG', 'SG'],
  'chris paul': ['PG', 'SG'],
  paul: ['PG', 'SG'],
  nash: ['PG', 'SG'],
  'steve nash': ['PG', 'SG'],
  wade: ['SG', 'PG', 'SF'],
  'dwyane wade': ['SG', 'PG', 'SF'],
  'tracy mcgrady': ['SG', 'SF'],
  mcgrady: ['SG', 'SF'],
  'vince carter': ['SG', 'SF'],
  carter: ['SG', 'SF'],
  'paul pierce': ['SG', 'SF'],
  pierce: ['SG', 'SF'],
  'ray allen': ['SG', 'SF'],
  'reggie miller': ['SG', 'SF'],
  miller: ['SG', 'SF'],
  'carmelo anthony': ['SF', 'PF'],
  anthony: ['SF', 'PF'],
  'paul george': ['SG', 'SF', 'PF'],
  george: ['SG', 'SF', 'PF'],
  'jimmy butler': ['SG', 'SF', 'PF'],
  'draymond green': ['PF', 'C', 'SF'],
  green: ['PF', 'C', 'SF'],
  'karl malone': ['PF', 'C'],
  malone: ['PF', 'C'],
  'charles barkley': ['PF', 'C'],
  barkley: ['PF', 'C'],
  'shaquille oneal': ['C'],
  shaq: ['C'],
  'hakeem olajuwon': ['C'],
  olajuwon: ['C'],
  'david robinson': ['C'],
  robinson: ['C', 'PF'],
  'patrick ewing': ['C'],
  ewing: ['C'],
  'bill russell': ['C', 'PF'],
  russell: ['C', 'PF'],
  'wilt chamberlain': ['C'],
  chamberlain: ['C'],
  'kareem abdul jabbar': ['C'],
  kareem: ['C'],
  'oscar robertson': ['PG', 'SG'],
  robertson: ['PG', 'SG'],
  'jerry west': ['PG', 'SG'],
  west: ['PG', 'SG'],
  'isiah thomas': ['PG', 'SG'],
  'john stockton': ['PG', 'SG'],
  'jason kidd': ['PG', 'SG'],
  kidd: ['PG', 'SG'],
  'penny hardaway': ['PG', 'SG', 'SF'],
  hardaway: ['PG', 'SG', 'SF'],
  'grant hill': ['SF', 'SG', 'PF'],
  hill: ['SF', 'SG', 'PF'],
  'kevin love': ['PF', 'C'],
  love: ['PF', 'C'],
  'blake griffin': ['PF', 'C'],
  griffin: ['PF', 'C'],
  'lamarcus aldridge': ['PF', 'C'],
  aldridge: ['PF', 'C'],
  'pau gasol': ['PF', 'C'],
  gasol: ['PF', 'C'],
  'anthony edwards': ['SG', 'SF'],
  edwards: ['SG', 'SF'],
  'ja morant': ['PG', 'SG'],
  'luka doncic': ['PG', 'SG', 'SF'],
  'jayson tatum': ['SF', 'PF'],
  'jaylen brown': ['SG', 'SF'],
  brown: ['SG', 'SF'],
  'devin booker': ['SG', 'SF'],
  'donovan mitchell': ['PG', 'SG'],
  'trae young': ['PG', 'SG'],
  young: ['PG', 'SG'],
  'zion williamson': ['PF', 'SF', 'C'],
  zion: ['PF', 'SF', 'C'],
  'kawhi leonard': ['SG', 'SF'],
  'james harden': ['PG', 'SG'],
  'stephen curry': ['PG', 'SG'],
  'kevin durant': ['SG', 'SF', 'PF'],
  'nikola jokic': ['C', 'PF'],
  'joel embiid': ['C', 'PF'],
  'giannis antetokounmpo': ['SF', 'PF', 'C'],
};

/** Mild natural flexibility when no star override exists. */
function naturalAlternates(primary: Position): Position[] {
  switch (primary) {
    case 'PG':
      return ['PG', 'SG'];
    case 'SG':
      return ['SG', 'PG'];
    case 'SF':
      return ['SF', 'SG', 'PF'];
    case 'PF':
      return ['PF', 'SF', 'C'];
    case 'C':
      return ['C', 'PF'];
    default:
      return [primary];
  }
}

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

function normalizedName(player: TradePlayer): string {
  return player.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function overrideKeyForPlayer(player: TradePlayer): string | null {
  const id = player.id.toLowerCase();
  if (POSITION_OVERRIDES[id]) return id;

  const nameKey = normalizedName(player);
  if (POSITION_OVERRIDES[nameKey]) return nameKey;

  // Historical decade IDs look like hist_2010s_LAL_lebron_james
  if (nameKey.includes('lebron')) return 'lebron';
  if (nameKey.includes('giannis')) return 'giannis';
  if (nameKey.includes('doncic') || nameKey.includes('doncic')) return 'doncic';
  if (nameKey.includes('durant')) return 'durant';
  if (nameKey.includes('jokic') || nameKey.includes('jokic')) return 'jokic';
  if (nameKey.includes('embiid')) return 'embiid';
  if (nameKey.includes('tatum')) return 'tatum';
  if (nameKey.includes('butler')) return 'butler';
  if (nameKey.includes('leonard')) return 'leonard';
  if (nameKey.includes('anthony davis')) return 'davis';
  if (nameKey.includes('towns')) return 'towns';
  if (nameKey.includes('adebayo')) return 'adebayo';
  if (nameKey.includes('stephen curry') || nameKey === 'curry') return 'curry';
  if (nameKey.includes('harden')) return 'harden';
  if (nameKey.includes('booker')) return 'booker';
  if (nameKey.includes('donovan mitchell') || nameKey === 'mitchell') return 'mitchell';
  if (nameKey.includes('morant')) return 'morant';
  if (nameKey.includes('wembanyama') || nameKey.includes('wemby')) return 'wemby';
  if (nameKey.includes('iverson')) return 'iverson';
  if (nameKey.includes('michael jordan') || nameKey === 'jordan') return 'jordan';
  if (nameKey.includes('kobe')) return 'kobe';
  if (nameKey.includes('magic johnson') || nameKey === 'magic') return 'magic';
  if (nameKey.includes('larry bird') || nameKey === 'bird') return 'bird';
  if (nameKey.includes('pippen')) return 'pippen';
  if (nameKey.includes('garnett')) return 'garnett';
  if (nameKey.includes('duncan')) return 'duncan';
  if (nameKey.includes('nowitzki') || nameKey.includes('dirk')) return 'dirk';
  if (nameKey.includes('westbrook')) return 'westbrook';
  if (nameKey.includes('chris paul')) return 'cp3';
  if (nameKey.includes('wade')) return 'wade';
  if (nameKey.includes('mcgrady')) return 'mcgrady';
  if (nameKey.includes('carmelo')) return 'anthony';
  if (nameKey.includes('paul george')) return 'george';
  if (nameKey.includes('draymond')) return 'green';
  if (nameKey.includes('karl malone')) return 'malone';
  if (nameKey.includes('barkley')) return 'barkley';
  if (nameKey.includes('stockton')) return 'stockton';
  if (nameKey.includes('jason kidd')) return 'kidd';
  if (nameKey.includes('penny hardaway') || nameKey.includes('anfernee')) return 'hardaway';
  if (nameKey.includes('grant hill')) return 'hill';
  if (nameKey.includes('trae young')) return 'young';
  if (nameKey.includes('zion')) return 'zion';
  if (nameKey.includes('jaylen brown')) return 'brown';
  if (nameKey.includes('anthony edwards')) return 'edwards';

  // hist_{era}_{team}_{slug} must not inherit a star list from the last token.
  // "james" / "george" / "paul" / "brown" would otherwise collide across eras.
  if (id.startsWith('hist_')) return null;

  const last = id.split(/[_-]/).pop();
  if (last && POSITION_OVERRIDES[last]) return last;
  return null;
}

/**
 * Positions this player may occupy.
 * Star overrides + mild natural wing/guard/big flexibility.
 */
export function getEligiblePositions(player: TradePlayer): Position[] {
  const key = overrideKeyForPlayer(player);
  if (key) {
    const override = POSITION_OVERRIDES[key];
    if (override) return uniquePositions(override);
  }
  return uniquePositions(naturalAlternates(player.primaryPosition));
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

/** True when the seated slot is the player's primary position. */
export function isPrimarySlot(player: TradePlayer, slot: Position): boolean {
  return player.primaryPosition === slot;
}

export { LINEUP_POSITIONS };
