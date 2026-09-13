/**
 * Unit checks for Classic Run challenge boundary logic (no DOM / localStorage).
 * Run: node scripts/verify-challenges.mjs
 */

const BILLION = 1_000_000_000;
const MAX_PLAYER = 225_000_000;

function evaluate(snapshot) {
  const teamValue = Math.round(snapshot.teamValue);
  const values = snapshot.players.map((p) => Math.round(p.dollarValue));
  const completed = [];

  const mark = (id, met) => {
    if (met) completed.push(id);
  };

  if (teamValue >= BILLION && !snapshot.teamRerollUsed && !snapshot.eraRerollUsed) {
    mark('no-second-chances', true);
  }
  if (teamValue >= BILLION && snapshot.teamRerollUsed && snapshot.eraRerollUsed) {
    mark('all-in', true);
  }
  if (teamValue >= BILLION && values.length === 5 && values.every((v) => v >= 200_000_000)) {
    mark('two-hundred-m-club', true);
  }
  if (teamValue >= BILLION && values.length === 5) {
    const spread = Math.max(...values) - Math.min(...values);
    if (spread <= 15_000_000) mark('balanced-books', true);
  }
  if (teamValue >= BILLION && teamValue <= 1_015_000_000) mark('just-enough', true);
  if (teamValue >= 1_050_000_000) mark('billion-and-beyond', true);
  if (teamValue >= 1_075_000_000) mark('elite-company', true);
  if (teamValue >= BILLION && values.every((v) => v <= 210_000_000)) mark('no-headliners', true);
  if (
    teamValue >= BILLION &&
    values.every((v) => v >= 195_000_000 && v <= 215_000_000)
  ) {
    mark('five-star-portfolio', true);
  }
  const eras = snapshot.players.map((p) => p.era).filter(Boolean);
  if (teamValue >= BILLION && new Set(eras).size >= 4) mark('generational-wealth', true);
  const teams = snapshot.players.map((p) => p.teamId);
  if (teamValue >= BILLION && new Set(teams).size >= 5) mark('league-tour', true);
  if (values.filter((v) => v >= 215_000_000).length >= 2) mark('double-trouble', true);
  if (values.filter((v) => v >= 210_000_000).length >= 3) mark('triple-threat', true);
  if (values.some((v) => v >= 220_000_000)) mark('top-of-the-market', true);
  if (
    snapshot.fourPlayerTotalBeforeFifth != null &&
    snapshot.fourPlayerTotalBeforeFifth < 800_000_000 &&
    teamValue >= BILLION
  ) {
    mark('clutch-investment', true);
  }
  if (teamValue >= 1_025_000_000 && teamValue <= 1_035_000_000) mark('perfect-range', true);

  return completed;
}

function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`);
  console.log(`ok: ${name}`);
}

const five = (vals, extra = {}) =>
  vals.map((dollarValue, i) => ({
    dollarValue,
    teamId: `T${i}`,
    era: `${1960 + i * 10}s`,
    ...extra,
  }));

assert('just-enough lower bound', evaluate({ teamValue: BILLION, players: five([200e6, 200e6, 200e6, 200e6, 200e6]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: null }).includes('just-enough'));
assert('just-enough upper bound', evaluate({ teamValue: 1_015_000_000, players: five([203e6, 203e6, 203e6, 203e6, 203e6]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: null }).includes('just-enough'));
assert('just-enough above range fails', !evaluate({ teamValue: 1_015_000_001, players: five([203e6, 203e6, 203e6, 203e6, 203.2e6]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: null }).includes('just-enough'));

assert('perfect-range bounds', evaluate({ teamValue: 1_025_000_000, players: five([205e6, 205e6, 205e6, 205e6, 205e6]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: null }).includes('perfect-range'));
assert('perfect-range upper', evaluate({ teamValue: 1_035_000_000, players: five([207e6, 207e6, 207e6, 207e6, 207e6]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: null }).includes('perfect-range'));

assert('elite-company at 1.075B', evaluate({ teamValue: 1_075_000_000, players: five([215e6, 215e6, 215e6, 215e6, 215e6]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: null }).includes('elite-company'));
assert('elite-company max theoretical 1.125B', evaluate({ teamValue: 1_125_000_000, players: five([MAX_PLAYER, MAX_PLAYER, MAX_PLAYER, MAX_PLAYER, MAX_PLAYER]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: null }).includes('elite-company'));

assert('double-trouble without 1B', evaluate({ teamValue: 900_000_000, players: five([215e6, 215e6, 150e6, 150e6, 150e6]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: null }).includes('double-trouble'));
assert('triple-threat without 1B', evaluate({ teamValue: 850_000_000, players: five([210e6, 210e6, 210e6, 110e6, 110e6]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: null }).includes('triple-threat'));

assert('top-of-market at 220M', evaluate({ teamValue: 900_000_000, players: five([220_000_000, 180e6, 180e6, 180e6, 180e6]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: null }).includes('top-of-the-market'));

assert('clutch investment', evaluate({ teamValue: BILLION, players: five([150e6, 150e6, 150e6, 150e6, 400e6]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: 600_000_000 }).includes('clutch-investment'));
assert('clutch fails if four-player already 800M+', !evaluate({ teamValue: BILLION, players: five([200e6, 200e6, 200e6, 200e6, 200e6]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: 800_000_000 }).includes('clutch-investment'));

assert('all-in rerolls', evaluate({ teamValue: BILLION, players: five([200e6, 200e6, 200e6, 200e6, 200e6]), teamRerollUsed: true, eraRerollUsed: true, fourPlayerTotalBeforeFifth: null }).includes('all-in'));
assert('no-second-chances', evaluate({ teamValue: BILLION, players: five([200e6, 200e6, 200e6, 200e6, 200e6]), teamRerollUsed: false, eraRerollUsed: false, fourPlayerTotalBeforeFifth: null }).includes('no-second-chances'));

// Streak simulation
let streak = 0;
const completed = new Set();
function finishRun(value) {
  if (value >= BILLION) {
    streak += 1;
    if (streak >= 2) completed.add('back-to-back-billions');
    if (streak >= 3) completed.add('three-peat');
  } else {
    streak = 0;
  }
}
finishRun(BILLION);
assert('streak after one billion', streak === 1);
finishRun(BILLION);
assert('back-to-back after two', completed.has('back-to-back-billions'));
finishRun(900_000_000);
assert('streak reset on fail', streak === 0);
assert('back-to-back preserved after fail', completed.has('back-to-back-billions'));

console.log('\nAll challenge verification checks passed.');
console.log('Max obtainable player value:', MAX_PLAYER);
