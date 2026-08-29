/**
 * Two-client simulation of position-synced 1V1 (PG→C).
 * Mirrors server rules: private locks, single resolve, dual continue, no skip-ahead.
 */
const H2H_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

function nextH2HPosition(position) {
  const idx = H2H_POSITIONS.indexOf(position);
  if (idx < 0 || idx >= H2H_POSITIONS.length - 1) return null;
  return H2H_POSITIONS[idx + 1];
}

function applyHeadToHeadResult(leftValue, rightValue) {
  const p1 = Math.round(leftValue);
  const p2 = Math.round(rightValue);
  if (p1 === p2) return { winner: 'tie', p1Adjusted: p1, p2Adjusted: p2, penalty: 0 };
  if (p1 > p2) {
    const penalty = Math.round((p1 - p2) * 0.375);
    return { winner: 'p1', p1Adjusted: p1, p2Adjusted: Math.max(0, p2 - penalty), penalty };
  }
  const penalty = Math.round((p2 - p1) * 0.375);
  return { winner: 'p2', p1Adjusted: Math.max(0, p1 - penalty), p2Adjusted: p2, penalty };
}

function createMatch() {
  return {
    current: 'PG',
    phase: 'selecting',
    p1Total: 0,
    p2Total: 0,
    p1Continue: false,
    p2Continue: false,
    locks: {},
    rounds: {},
    resolveCount: {},
  };
}

function lock(match, who, position, value) {
  if (match.phase !== 'selecting') throw new Error(`${who} cannot lock: phase=${match.phase}`);
  if (match.current !== position) throw new Error(`${who} cannot skip to ${position}`);
  const key = `${position}:${who}`;
  if (match.locks[key]) throw new Error(`${who} duplicate lock`);
  match.locks[key] = value;
  const p1 = match.locks[`${position}:p1`];
  const p2 = match.locks[`${position}:p2`];
  if (p1 == null || p2 == null) {
    return { waiting: true };
  }
  match.resolveCount[position] = (match.resolveCount[position] || 0) + 1;
  const result = applyHeadToHeadResult(p1, p2);
  match.p1Total += result.p1Adjusted;
  match.p2Total += result.p2Adjusted;
  match.rounds[position] = result;
  match.phase = 'reveal';
  match.p1Continue = false;
  match.p2Continue = false;
  return { resolved: true, result };
}

function ack(match, who) {
  if (match.phase !== 'reveal') throw new Error(`${who} cannot continue yet`);
  if (who === 'p1') match.p1Continue = true;
  else match.p2Continue = true;
  if (!(match.p1Continue && match.p2Continue)) return { waiting: true };
  const next = nextH2HPosition(match.current);
  if (!next) {
    match.phase = 'finished';
    return { finished: true };
  }
  match.current = next;
  match.phase = 'selecting';
  match.p1Continue = false;
  match.p2Continue = false;
  return { advanced: next };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const match = createMatch();
const values = {
  PG: [285_000_000, 198_000_000],
  SG: [120_000_000, 150_000_000],
  SF: [90_000_000, 90_000_000],
  PF: [200_000_000, 110_000_000],
  C: [348_000_000, 400_000_000],
};

let skipBlocked = false;
try {
  lock(match, 'p1', 'SG', 1);
} catch {
  skipBlocked = true;
}
assert(skipBlocked, 'faster player must not skip to SG');

for (const pos of H2H_POSITIONS) {
  const [v1, v2] = values[pos];
  const first = lock(match, 'p1', pos, v1);
  assert(first.waiting, `${pos}: p1 must wait`);
  assert(match.phase === 'selecting', `${pos}: must not reveal before p2 locks`);
  let dupBlocked = false;
  try {
    lock(match, 'p1', pos, v1);
  } catch {
    dupBlocked = true;
  }
  assert(dupBlocked, `${pos}: duplicate resolve/lock blocked`);
  const second = lock(match, 'p2', pos, v2);
  assert(second.resolved, `${pos}: resolve once both lock`);
  assert(match.resolveCount[pos] === 1, `${pos}: resolved exactly once`);
  const cont1 = ack(match, 'p1');
  assert(cont1.waiting, `${pos}: p1 continue waits for p2`);
  assert(match.current === pos, `${pos}: cannot advance on one continue`);
  ack(match, 'p2');
}

assert(match.phase === 'finished', 'C continue should finish');
assert(Object.keys(match.rounds).join(',') === 'PG,SG,SF,PF,C', 'all five positions');
const pg = match.rounds.PG;
assert(pg.winner === 'p1', 'PG winner is p1');
assert(pg.p1Adjusted === 285_000_000, 'winner keeps full value');
assert(pg.p2Adjusted === 198_000_000 - Math.round((285_000_000 - 198_000_000) * 0.375), 'loser penalty');
assert(match.rounds.SF.winner === 'tie', 'equal values tie with full value');
assert(match.rounds.SF.p1Adjusted === 90_000_000 && match.rounds.SF.p2Adjusted === 90_000_000, 'tie full value');

console.log('sync_ok=true');
console.log('final_p1=' + match.p1Total);
console.log('final_p2=' + match.p2Total);
console.log('winner=' + (match.p1Total > match.p2Total ? 'p1' : match.p2Total > match.p1Total ? 'p2' : 'tie'));
