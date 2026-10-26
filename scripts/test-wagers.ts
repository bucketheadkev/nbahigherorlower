/**
 * Bet on Yourself rule checks — exact thresholds, just below, just above, slip validation and
 * payout math.   npx -y tsx scripts/test-wagers.ts
 */

import assert from 'node:assert/strict';
import {
  HIGH_ROLLER_TARGET,
  WAGERS,
  WAGER_BY_ID,
  WAGER_MAX_TEAM_TARGET,
  maxStakeFor,
  settleWagers,
  validateSlip,
  wagerReturn,
  type WagerRunFacts,
} from '../lib/tradeup/wagers';

const M = 1_000_000;
const facts = (total: number, draftValues: number[], rerollsUsed = false): WagerRunFacts => ({
  total,
  draftValues,
  rerollsUsed,
});
const five = (v: number) => [v, v, v, v, v];
const win = (id: keyof typeof WAGER_BY_ID, f: WagerRunFacts) => WAGER_BY_ID[id].wins(f);
let checks = 0;
const ok = (cond: boolean, label: string) => {
  assert.ok(cond, label);
  checks += 1;
};

// Billion or Bust
ok(win('billion_or_bust', facts(1_000 * M, five(200 * M))), 'billion: exactly $1B wins');
ok(!win('billion_or_bust', facts(1_000 * M - 1, five(200 * M))), 'billion: $1 short loses');
ok(win('billion_or_bust', facts(1_012 * M, five(202 * M))), 'billion: above wins');

// High Roller (never above the $1,025,000,000 ceiling)
ok(HIGH_ROLLER_TARGET <= WAGER_MAX_TEAM_TARGET, 'high roller target within ceiling');
ok(win('high_roller', facts(HIGH_ROLLER_TARGET, five(202 * M))), 'high roller: exact wins');
ok(!win('high_roller', facts(HIGH_ROLLER_TARGET - 1, five(202 * M))), 'high roller: $1 short loses');
ok(win('high_roller', facts(1_030 * M, five(206 * M))), 'high roller: true total above the ceiling still wins');

// Star Hunter
ok(win('star_hunter', facts(900 * M, [200 * M, 175 * M, 175 * M, 175 * M, 175 * M])), 'star: exactly $200M');
ok(!win('star_hunter', facts(900 * M, [200 * M - 1, 199 * M, 175 * M, 175 * M, 151 * M])), 'star: just under');

// Dynamic Duo (two distinct players)
ok(win('dynamic_duo', facts(900 * M, [190 * M, 190 * M, 100 * M, 100 * M, 100 * M])), 'duo: two at $190M');
ok(!win('dynamic_duo', facts(900 * M, [215 * M, 189 * M, 189 * M, 189 * M, 118 * M])), 'duo: only one qualifies');

// Triple Threat (three distinct players)
ok(win('triple_threat', facts(900 * M, [185 * M, 185 * M, 185 * M, 100 * M, 100 * M])), 'triple: three at $185M');
ok(!win('triple_threat', facts(900 * M, [220 * M, 220 * M, 184 * M, 184 * M, 92 * M])), 'triple: only two');

// Superteam (every player)
ok(win('superteam', facts(950 * M, five(190 * M))), 'superteam: all exactly $190M');
ok(!win('superteam', facts(950 * M, [220 * M, 220 * M, 220 * M, 220 * M, 190 * M - 1])), 'superteam: one short');
ok(!win('superteam', facts(900 * M, five(180 * M))), 'superteam: the old $170M bar no longer wins');
ok(!win('superteam', facts(800 * M, [200 * M, 200 * M, 200 * M, 200 * M])), 'superteam: needs five');
ok(WAGER_BY_ID.superteam.multiplierX100 === 145, 'superteam multiplier unchanged');

// Clutch Pick is gone
ok(!WAGERS.some((w) => (w.id as string) === 'clutch_pick'), 'clutch pick removed');

// No Rerolls
ok(win('no_rerolls', facts(900 * M, five(180 * M), false)), 'no rerolls: exact $900M');
ok(!win('no_rerolls', facts(990 * M, five(198 * M), true)), 'no rerolls: any reroll loses');
ok(!win('no_rerolls', facts(900 * M - 1, five(180 * M), false)), 'no rerolls: $1 short loses');
ok(WAGER_BY_ID.no_rerolls.multiplierX100 === 130, 'no rerolls pays 1.3×');

// A run can miss $1B and still win lower-target wagers.
const miss = facts(960 * M, [205 * M, 195 * M, 190 * M, 185 * M, 185 * M]);
ok(!win('billion_or_bust', miss) && win('dynamic_duo', miss) && win('triple_threat', miss), 'missed $1B can still win others');

// Payouts are whole dollars; caps hold.
ok(wagerReturn(250_000, 115) === 287_500, '1.15× of $250,000');
ok(wagerReturn(100_000, 105) === 105_000, '1.05× of $100,000');
ok(maxStakeFor('billion_or_bust') === 10_000_000, 'billion or bust takes up to $10,000,000');
ok(validateSlip([{ id: 'billion_or_bust', stake: 5_000_000 }], 1e9) === null, 'billion or bust $5,000,000 allowed');
ok(validateSlip([{ id: 'billion_or_bust', stake: 10_000_000 }], 1e9) === null, 'billion or bust $10,000,000 allowed');
ok(wagerReturn(10_000_000, 2000) === 200_000_000, '20× of $10,000,000');
ok(validateSlip([{ id: 'star_hunter', stake: 10_000_000 }], 1e9) === 'stake', '$10,000,000 only on Billion or Bust');

// Slip validation
ok(validateSlip([], 1e9) === 'count', 'empty slip rejected');
ok(
  validateSlip(
    [
      { id: 'star_hunter', stake: 100_000 },
      { id: 'dynamic_duo', stake: 100_000 },
      { id: 'superteam', stake: 100_000 },
      { id: 'no_rerolls', stake: 100_000 },
    ],
    1e9,
  ) === 'count',
  'four wagers rejected',
);
ok(validateSlip([{ id: 'star_hunter', stake: 100_000 }, { id: 'star_hunter', stake: 250_000 }], 1e9) === 'duplicate', 'duplicate rejected');
ok(validateSlip([{ id: 'star_hunter', stake: 123_456 }], 1e9) === 'stake', 'odd stake rejected');
ok(validateSlip([{ id: 'high_roller', stake: 5_000_000 }], 1e9) === 'stake', 'long-shot stake above cap rejected');
ok(validateSlip([{ id: 'star_hunter', stake: 500_000 }, { id: 'superteam', stake: 500_000 }], 999_999) === 'insufficient', 'over Bank rejected');
ok(validateSlip([{ id: 'star_hunter', stake: 500_000 }, { id: 'superteam', stake: 500_000 }], 1_000_000) === null, 'exactly the Bank allowed');

// Independent settlement
const results = settleWagers(
  [
    { id: 'billion_or_bust', stake: 1_000_000 },
    { id: 'star_hunter', stake: 500_000 },
  ],
  facts(985 * M, [212 * M, 196 * M, 194 * M, 192 * M, 191 * M]),
);
ok(!results[0]!.won && results[0]!.returned === 0, 'lost wager returns 0');
ok(results[1]!.won && results[1]!.returned === 575_000, 'won wager returns stake × multiplier');

console.log(`wager rules: ${checks} checks passed`);
