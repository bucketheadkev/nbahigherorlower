/**
 * Keeps Dynasty Road's client catalog and the server's seed in step, and reports which starters
 * Classic can deal (only those can be signed from a $1B run).
 * Run: npx tsx --tsconfig tsconfig.json scripts/check-dynasty-catalog.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DYNASTY_COLLECTIONS, DYNASTY_SLOT_COUNT, inClassicPool } from '@/lib/tradeup/dynasty/catalog';
import { CHEST_EARN_WEIGHTS, CHEST_REWARD_WEIGHTS, PLAYER_RARITY, type ChestTier } from '@/lib/tradeup/dynasty/chests';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261107_1_dynasty_road.sql'), 'utf8');
const seats = new Set(
  (JSON.parse(readFileSync(join(process.cwd(), 'data/classic-player-seat-values.json'), 'utf8')) as { player_id: string }[]).map(
    (r) => r.player_id,
  ),
);

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` → ${detail}` : ''}`);
};

const seeded = new Set([...sql.matchAll(/\('([a-z0-9-]+)', '(hist_[^']+)', '(PG|SG|SF|PF|C)', (\d)\)/g)].map((m) => `${m[1]}|${m[2]}|${m[3]}|${m[4]}`));
const expected = new Set(
  DYNASTY_COLLECTIONS.flatMap((c) => c.slots.map((s, i) => `${c.id}|${s.playerId}|${s.position}|${i + 1}`)),
);
check('server seed matches the client catalog', seeded.size === expected.size && [...expected].every((k) => seeded.has(k)));

for (const c of DYNASTY_COLLECTIONS) {
  check(`${c.id} listed in the server catalog`, sql.includes(`('${c.id}', ${c.order}, '${c.kind}'`));
  if (c.kind === 'final') {
    check(`${c.id} is sealed (no lineup yet)`, c.slots.length === 0 && sql.includes(`'${c.id}', ${c.order}, 'final', NULL, NULL, NULL, 'The Billion Five', false`));
    continue;
  }
  check(`${c.id} has five starters`, c.slots.length === DYNASTY_SLOT_COUNT);
  check(`${c.id} positions PG SG SF PF C`, c.slots.map((s) => s.position).join(' ') === 'PG SG SF PF C');
  for (const s of c.slots) {
    const tagged = s.playerId.startsWith(`hist_${c.era}_${c.teamId}_`);
    check(`${s.name} is the ${c.era} ${c.teamId} card`, tagged);
    const dealt = inClassicPool(s.playerId);
    const priced = seats.has(s.playerId);
    if (!dealt || !priced) console.log(`  note  ${s.name} (${c.id}) is not in Classic's pool yet: can't be signed from a run`);
  }
}

// Phase 2: the client's display mirror of the balance tables matches the server's seed.
const chestSql = readFileSync(join(process.cwd(), 'supabase/migrations/20261108_1_dynasty_chests.sql'), 'utf8');
const sqlRarity = new Map([...chestSql.matchAll(/\('[a-z0-9-]+', '(hist_[^']+)', '(pro|all_star|superstar|legend|goat)'\)/g)].map((m) => [m[1], m[2]]));
const everySlot = DYNASTY_COLLECTIONS.flatMap((c) => c.slots.map((s) => s.playerId));
check('every collectible has a rarity on the server', everySlot.every((id) => sqlRarity.has(id)));
check('client rarity map matches the server', everySlot.every((id) => PLAYER_RARITY[id] === sqlRarity.get(id)));
const sqlWeights = [...chestSql.matchAll(/\('(pro|all_star|superstar|legend|goat)', '(pro|all_star|superstar|legend|goat)', (\d+)\)/g)];
check(
  'client chest × rarity weights match the server',
  sqlWeights.length === 25 && sqlWeights.every((m) => CHEST_REWARD_WEIGHTS[m[1] as ChestTier][m[2] as ChestTier] === Number(m[3])),
);
const sqlTiers = [...chestSql.matchAll(/\('(pro|all_star|superstar|legend|goat)', (\d), (\d+)\)/g)];
check('client chest tier odds match the server', sqlTiers.length === 5 && sqlTiers.every((m) => CHEST_EARN_WEIGHTS[m[1] as ChestTier] === Number(m[3])));
for (const tier of Object.keys(CHEST_REWARD_WEIGHTS) as ChestTier[]) {
  const shares = Object.entries(CHEST_REWARD_WEIGHTS[tier]).map(([r, w]) => `${r} ${w}`);
  console.log(`  info  ${tier} chest → ${shares.join(' · ')}`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
