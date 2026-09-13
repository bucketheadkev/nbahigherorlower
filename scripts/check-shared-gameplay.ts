/**
 * Focused regression checks for shared pricing, roster totals, and showdown steps.
 * Run: node --experimental-strip-types scripts/check-shared-gameplay.ts
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { getEligiblePositions } from '../lib/tradeup/alternatePositions';
import {
  BILLION_GOAL,
  getDollarValueForSlot,
  playerVersionKey,
  resolveAuthoritativePlayerValue,
} from '../lib/tradeup/billionDollar';
import { resultPhrase } from '../lib/tradeup/resultPhrase';
import { displayedRoundValue, sumDisplayedRoster } from '../lib/multiplayer/modeConfig';
import { IDLE_SHOWDOWN, nextShowdownCursor } from '../lib/multiplayer/showdownCursor';
import type { TradePlayer } from '../lib/tradeup/types';
import type { H2HRoundPublic } from '../lib/multiplayer/h2hState';

const require = createRequire(import.meta.url);
const decadeData = require('../lib/tradeup/data/decadeRosters.json') as Record<
  string,
  Record<string, Array<{ name: string; pos: string }>>
>;

function card(partial: Partial<TradePlayer> & Pick<TradePlayer, 'id' | 'name' | 'teamId'>): TradePlayer {
  return {
    primaryPosition: 'PF',
    position: 'PF',
    age: 28,
    stats: { ppg: 20, rpg: 8, apg: 3, spg: 1, bpg: 1 },
    tradeValue: 90,
    isStarter: true,
    ...partial,
  };
}

function findVersions(name: string) {
  const hits: Array<{ era: string; team: string; pos: string; name: string }> = [];
  for (const [era, teams] of Object.entries(decadeData)) {
    for (const [team, players] of Object.entries(teams)) {
      for (const player of players) {
        if (player.name === name) hits.push({ era, team, pos: player.pos, name: player.name });
      }
    }
  }
  return hits;
}

const corrections: Array<{ key: string; millions: number }> = [
  { key: '2010s|MIA|Chris Bosh', millions: 193 },
  { key: '2000s|ORL|J.J. Redick', millions: 110 },
  { key: '2020s|TOR|Scottie Barnes', millions: 183 },
  { key: '2020s|IND|Pascal Siakam', millions: 181 },
  { key: '2020s|TOR|Pascal Siakam', millions: 181 },
  { key: '1980s|BOS|Larry Bird', millions: 213 },
];

for (const correction of corrections) {
  const [era, team, name] = correction.key.split('|');
  const player = card({
    id: `hist_${era}_${team}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    name: name!,
    teamId: team!,
    primaryPosition: 'PF',
  });
  assert.equal(playerVersionKey(player), correction.key);
  const classic = resolveAuthoritativePlayerValue(player);
  const h2h = getDollarValueForSlot(player, player.primaryPosition);
  assert.equal(classic, correction.millions * 1_000_000, correction.key);
  assert.equal(h2h, classic, `${correction.key} must match across Classic and 1v1`);
  assert.equal(classic % 1_000_000, 0);
  assert.equal(resolveAuthoritativePlayerValue(player), classic, 'resolver must be stable');
}

const jaylenBos = card({
  id: 'hist_2020s_BOS_jaylen_brown',
  name: 'Jaylen Brown',
  teamId: 'BOS',
  primaryPosition: 'SG',
  tradeValue: 92,
  stats: { ppg: 23, rpg: 6, apg: 3, spg: 1.1, bpg: 0.3 },
});
const jaylenPhi = card({
  ...jaylenBos,
  id: 'hist_2020s_PHI_jaylen_brown',
  teamId: 'PHI',
});
const jaylenEarly = card({
  ...jaylenBos,
  id: 'hist_2010s_BOS_jaylen_brown',
  teamId: 'BOS',
  tradeValue: 57,
  stats: { ppg: 13.5, rpg: 4.2, apg: 1.4, spg: 0.8, bpg: 0.2 },
});
assert.equal(resolveAuthoritativePlayerValue(jaylenBos), 196_000_000);
assert.equal(getDollarValueForSlot(jaylenBos, 'SG'), 196_000_000);
assert.equal(getDollarValueForSlot(jaylenPhi, 'SG'), 196_000_000);
assert.notEqual(resolveAuthoritativePlayerValue(jaylenEarly), 196_000_000);

const lamelo = card({
  id: 'hist_2020s_CHA_lamelo_ball',
  name: 'LaMelo Ball',
  teamId: 'CHA',
  primaryPosition: 'PG',
  tradeValue: 92,
  stats: { ppg: 21, rpg: 6.1, apg: 7.4, spg: 1.1, bpg: 0.3 },
});
assert.equal(resolveAuthoritativePlayerValue(lamelo), 189_000_000);
assert.equal(getDollarValueForSlot(lamelo, 'PG'), 189_000_000);

const phrases = [400_000_000, 800_000_000, 950_000_000, BILLION_GOAL, 1_200_000_000].map(resultPhrase);
assert.deepEqual(phrases, ['MARKET MISS', 'KEEP BUILDING', 'SO CLOSE', 'BILLION', 'BILLION RUN']);
assert.ok(phrases.every((phrase) => !phrase.endsWith('.')));

const bird90s = card({
  id: 'hist_1990s_BOS_larry_bird',
  name: 'Larry Bird',
  teamId: 'BOS',
  primaryPosition: 'SF',
  tradeValue: 94,
  stats: { ppg: 21.6, rpg: 9.2, apg: 7.2, spg: 1, bpg: 1 },
});
const bird80s = card({
  id: 'hist_1980s_BOS_larry_bird',
  name: 'Larry Bird',
  teamId: 'BOS',
  primaryPosition: 'PF',
  tradeValue: 97,
  stats: { ppg: 25, rpg: 10.2, apg: 6.1, spg: 1, bpg: 1 },
});
assert.notEqual(resolveAuthoritativePlayerValue(bird90s), resolveAuthoritativePlayerValue(bird80s));
assert.equal(resolveAuthoritativePlayerValue(bird80s), 213_000_000);
assert.notEqual(resolveAuthoritativePlayerValue(bird90s), 213_000_000);

const boshTor = card({
  id: 'hist_2000s_TOR_chris_bosh',
  name: 'Chris Bosh',
  teamId: 'TOR',
  tradeValue: 89,
  stats: { ppg: 20.2, rpg: 9.4, apg: 2.2, spg: 1, bpg: 1 },
});
assert.equal(resolveAuthoritativePlayerValue(boshTor), 185_000_000);
assert.notEqual(resolveAuthoritativePlayerValue(boshTor), 193_000_000);

const redick2010 = card({
  id: 'hist_2010s_PHI_j_j_redick',
  name: 'J.J. Redick',
  teamId: 'PHI',
  primaryPosition: 'SG',
  tradeValue: 62,
  stats: { ppg: 15, rpg: 2.2, apg: 2, spg: 0.4, bpg: 0.1 },
});
assert.notEqual(resolveAuthoritativePlayerValue(redick2010), 110_000_000);

const siakam2010 = card({
  id: 'hist_2010s_TOR_pascal_siakam',
  name: 'Pascal Siakam',
  teamId: 'TOR',
  tradeValue: 61,
  stats: { ppg: 13, rpg: 6, apg: 2.5, spg: 0.8, bpg: 0.5 },
});
assert.notEqual(resolveAuthoritativePlayerValue(siakam2010), 181_000_000);

const offPrimary = getDollarValueForSlot(bird80s, 'SF');
const primary = getDollarValueForSlot(bird80s, 'PF');
assert.equal(primary, 213_000_000);
assert.equal(offPrimary, 200_000_000);
assert.equal(offPrimary % 1_000_000, 0);
assert.equal(getDollarValueForSlot(bird80s, 'SF'), offPrimary);

const rounds: H2HRoundPublic[] = [
  { position: 'PG', matchup_resolved: true, p1_raw_value: 110_000_000, p2_raw_value: 90_000_000, p1_adjusted_value: 110_000_000, p2_adjusted_value: 72_500_000 },
  { position: 'SG', matchup_resolved: true, p1_raw_value: 80_000_000, p2_raw_value: 100_000_000, p1_adjusted_value: 72_500_000, p2_adjusted_value: 100_000_000 },
  { position: 'SF', matchup_resolved: true, p1_raw_value: 193_000_000, p2_raw_value: 150_000_000 },
  { position: 'PF', matchup_resolved: true, p1_raw_value: 213_000_000, p2_raw_value: 181_000_000 },
  { position: 'C', matchup_resolved: true, p1_raw_value: 140_000_000, p2_raw_value: 160_000_000 },
];
const shown = rounds.map((round) => displayedRoundValue(round, 'p1'));
const totals = sumDisplayedRoster(rounds);
assert.equal(totals.p1, shown.reduce((sum, value) => sum + value, 0));
assert.equal(totals.p1, 736_000_000);
assert.equal(totals.p2, 681_000_000);
assert.equal(totals.p1 % 1_000_000, 0);
assert.ok(totals.p1 > totals.p2);

const bounty = sumDisplayedRoster(rounds, 'PF', 2);
assert.equal(bounty.p1, totals.p1 + 213_000_000);
assert.equal(bounty.p1, rounds.reduce((sum, round) => sum + displayedRoundValue(round, 'p1', 'PF', 2), 0));
assert.equal(bounty.p1 > bounty.p2, true);

let cursor = IDLE_SHOWDOWN;
const start = nextShowdownCursor(cursor, { started: true, index: 0, finished: false });
assert.equal(start.ok, true);
if (!start.ok) throw new Error('start');
cursor = start.cursor;
assert.equal(cursor.index, 0);
assert.equal(cursor.revision, 1);
const duplicate = nextShowdownCursor(cursor, { started: true, index: 0, finished: false });
assert.equal(duplicate.ok && duplicate.cursor.revision, 1);
const skip = nextShowdownCursor(cursor, { started: true, index: 2, finished: false });
assert.equal(skip.ok, false);
const step = nextShowdownCursor(cursor, { started: true, index: 1, finished: false });
assert.equal(step.ok, true);
if (!step.ok) throw new Error('step');
cursor = step.cursor;
const finishEarly = nextShowdownCursor(cursor, { started: true, index: 0, finished: true });
assert.equal(finishEarly.ok, false);
const finish = nextShowdownCursor(cursor, { started: true, index: 1, finished: true });
assert.equal(finish.ok, true);
if (!finish.ok) throw new Error('finish');
const after = nextShowdownCursor(finish.cursor, { started: true, index: 2, finished: false });
assert.equal(after.ok, false);

const gervin70 = card({
  id: 'hist_1970s_SAS_george_gervin',
  name: 'George Gervin',
  teamId: 'SAS',
  primaryPosition: 'SF',
});
const gervin80 = card({
  id: 'hist_1980s_SAS_george_gervin',
  name: 'George Gervin',
  teamId: 'SAS',
  primaryPosition: 'SG',
});
const cummings = card({
  id: 'hist_1980s_LAC_terry_cummings',
  name: 'Terry Cummings',
  teamId: 'LAC',
  primaryPosition: 'PF',
});
assert.deepEqual(getEligiblePositions(gervin70), getEligiblePositions({ ...gervin70, id: 'other-mode' }));
assert.ok(!getEligiblePositions(gervin70).includes('PG'));
assert.deepEqual(getEligiblePositions(cummings), ['PF', 'SF', 'C']);
assert.equal(getEligiblePositions(gervin80).join('/'), getEligiblePositions({ ...gervin80 }).join('/'));

const records = {
  cummings: findVersions('Terry Cummings'),
  gervin: findVersions('George Gervin'),
  cassell: findVersions('Sam Cassell'),
};
assert.equal(records.cummings.length, 3);
assert.equal(records.gervin.length, 2);
assert.equal(records.cassell.length, 6);
assert.ok(records.cummings.every((row) => row.pos === 'PF'));

console.log('shared gameplay checks passed');
console.log(JSON.stringify(records, null, 2));
