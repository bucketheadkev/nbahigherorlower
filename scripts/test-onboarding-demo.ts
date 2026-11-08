/**
 * Guards the tutorial: real cards, the game's own prices and position rule, a $1B+ practice five.
 * Run: npx tsx --tsconfig tsconfig.json scripts/test-onboarding-demo.ts
 */
import { playerFitsSlot } from '@/lib/tradeup/alternatePositions';
import { getDollarValueForSlot } from '@/lib/tradeup/billionDollar';
import {
  FINAL_FIVE,
  FINAL_TOTAL,
  GOAL,
  KOBE,
  kobeSpinPair,
  LEBRON,
  LEBRON_LAL,
  seatedValue,
} from '@/components/tradeup/onboarding/introData';

let failed = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` → ${detail}` : ''}`);
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

console.log('valuation example:');
check('LeBron (Cavaliers) and LeBron (Lakers) are different cards', LEBRON.id !== LEBRON_LAL.id);
check(
  'their values differ',
  LEBRON.base !== LEBRON_LAL.base,
  `${LEBRON.teamId} ${LEBRON.era} ${money(LEBRON.base)} · ${LEBRON_LAL.teamId} ${LEBRON_LAL.era} ${money(LEBRON_LAL.base)}`,
);
check('values are real (no $0)', LEBRON.base > 0 && LEBRON_LAL.base > 0);

console.log('spin + position lesson:');
const spin = kobeSpinPair();
check('spin lands on Kobe’s team and decade', spin.team.id === KOBE.teamId && spin.era === KOBE.era, `${spin.team.id} ${spin.era}`);
check('Kobe is a SG who can play SF', KOBE.primaryPosition === 'SG' && playerFitsSlot(KOBE, 'SF'));
const sg = seatedValue(KOBE, 'SG');
const sf = seatedValue(KOBE, 'SF');
check('SG price is his full value', sg === KOBE.base, money(sg));
check('SF price is also his full value', sf === getDollarValueForSlot(KOBE, 'SF') && sf === sg, money(sf));

console.log('practice five:');
for (const [player, slot] of FINAL_FIVE) {
  check(`${player.name} can play ${slot}`, playerFitsSlot(player, slot), money(seatedValue(player, slot)));
}
check('Kobe is at his primary position', FINAL_FIVE.some(([p, slot]) => p.id === KOBE.id && slot === 'SG'));
check('five different seats', new Set(FINAL_FIVE.map(([, slot]) => slot)).size === 5);
const sum = FINAL_FIVE.reduce((s, [p, slot]) => s + getDollarValueForSlot(p, slot), 0);
check('total matches the valuation sum', sum === FINAL_TOTAL, money(FINAL_TOTAL));
check('total reaches $1,000,000,000', FINAL_TOTAL >= GOAL, `${money(FINAL_TOTAL)} (+${money(FINAL_TOTAL - GOAL)})`);

if (failed > 0) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
