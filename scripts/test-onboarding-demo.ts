/**
 * Guards the guided onboarding demo: real cards, real prices, exactly $1,005,000,000.
 * Run: npx tsx --tsconfig tsconfig.json scripts/test-onboarding-demo.ts
 */
import { playerFitsSlot } from '@/lib/tradeup/alternatePositions';
import { getDollarValueForSlot } from '@/lib/tradeup/billionDollar';
import {
  DEMO_TEAM_VALUE,
  DIRK,
  EWING,
  GOAL,
  KOBE,
  LEBRON,
  MAGIC,
  seatedValue,
  topLegends,
} from '@/components/tradeup/onboarding/introData';

let failed = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` → ${detail}` : ''}`);
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

console.log('demo lineup:');
check('team value is exactly $1,005,000,000', DEMO_TEAM_VALUE === 1_005_000_000, money(DEMO_TEAM_VALUE));
check('surplus is exactly $5,000,000', DEMO_TEAM_VALUE - GOAL === 5_000_000, money(DEMO_TEAM_VALUE - GOAL));

for (const [player, slot] of [
  [MAGIC, 'PG'],
  [DIRK, 'PF'],
  [EWING, 'C'],
  [KOBE, 'SG'],
  [LEBRON, 'SF'],
] as const) {
  check(
    `${player.name} at ${slot} matches Classic pricing`,
    seatedValue(player, slot) === getDollarValueForSlot(player, slot),
    money(seatedValue(player, slot)),
  );
}

console.log('position lesson:');
check('Kobe can play SF (alternate)', playerFitsSlot(KOBE, 'SF') && KOBE.primaryPosition === 'SG');
check(
  'Kobe at SF costs 3% less than at SG',
  seatedValue(KOBE, 'SF') < seatedValue(KOBE, 'SG'),
  `${money(seatedValue(KOBE, 'SF'))} vs ${money(seatedValue(KOBE, 'SG'))}`,
);
check('LeBron fits SF', playerFitsSlot(LEBRON, 'SF'));

console.log('showcase:');
const legends = topLegends(5);
check('five distinct legends', legends.length === 5 && new Set(legends.map((l) => l.name)).size === 5);
check(
  'Duncan, Magic, and Embiid are not shown',
  !legends.some((l) => ['Tim Duncan', 'Magic Johnson', 'Joel Embiid'].includes(l.name)),
);
check('sorted by value', legends.every((l, i) => i === 0 || legends[i - 1]!.value >= l.value));
for (const l of legends) console.log(`       ${l.name.padEnd(22)} ${l.teamId} ${l.era}  ${money(l.value)}`);

if (failed > 0) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
