/**
 * Static + unit security checks for SECURE coin/bank REVIEW v2.
 * Does not require a live Supabase project. Run:
 *   node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs scripts/check-secure-coin-bank.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = path.join(root, 'supabase/admin/2026-11-23_SECURE_coin_bank_REVIEW.sql');
const edgePath = path.join(root, 'supabase/functions/iap-purchase/index.ts');
const rollbackPath = path.join(root, 'supabase/admin/2026-11-23_SECURE_coin_bank_ROLLBACK.sql');

const sql = fs.readFileSync(sqlPath, 'utf8');
const edge = fs.readFileSync(edgePath, 'utf8');
const rollback = fs.readFileSync(rollbackPath, 'utf8');

function mustInclude(hay: string, needle: string, label: string) {
  assert.ok(hay.includes(needle), `missing ${label}: ${needle}`);
}
function mustNotInclude(hay: string, needle: string, label: string) {
  assert.ok(!hay.includes(needle), `must not contain ${label}: ${needle}`);
}

// 1) Trivia shuffle — no correct_index in issue return payload.
mustInclude(sql, '_trivia_shuffle_choices', 'shuffle helper');
mustInclude(sql, 'Fisher', 'fisher-yates comment or shuffle');
assert.ok(
  /RETURN jsonb_build_object\(\s*'challenge_id'[\s\S]*?'choices',\s*v_shuffled\s*->\s*'choices'/m.test(sql),
  'trivia_issue must return shuffled choices',
);
assert.ok(!/RETURN jsonb_build_object\([\s\S]*'correct_index',\s*q\.correct_index/m.test(
  sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_issue(p_session_id uuid')),
), 'trivia_issue must not return q.correct_index');

// 2) Trivia attempt uniqueness
mustInclude(sql, 'trivia_challenges_session_diff_uidx', 'unique attempt index');
mustInclude(sql, 'trivia_attempt_used', 're-issue rejection');
mustInclude(sql, "status = 'expired'", 'expire terminal status');
mustInclude(sql, "'incorrect'", 'incorrect terminal status');

// 3/4) Classic validation + no 45s gate; server-authored spins
mustInclude(sql, 'classic_spin', 'server spin rpc');
mustInclude(sql, "RAISE EXCEPTION 'use_classic_spin'", 'client spin reject');
mustInclude(sql, 'classic_pick_commit', 'pick validation');
mustInclude(sql, 'classic_swap_commit', 'player swap effect');
mustInclude(sql, 'classic_run_submit', 'session submit');
mustInclude(sql, 'invalid_pick_history', 'pick history reject');
mustInclude(sql, 'p_action_id', 'stable action ids');
mustInclude(sql, 'run_award_daily_cap', 'award wrapper daily cap');
mustInclude(sql, '_iap_recompute_entitlements', 'entitlement recompute');
mustInclude(sql, 'iap_refund_debts', 'refund debt table');
mustInclude(sql, "RAISE EXCEPTION 'use_classic_run_submit'", 'legacy submit block');
mustInclude(sql, 'LANGUAGE plpgsql VOLATILE', 'volatile shuffle');
mustNotInclude(sql, 'run_too_fast', '45s minimum');
mustNotInclude(sql, "interval '45 seconds'", '45s interval');

// 5) Boosts require active session
mustInclude(sql, 'run_session_closed', 'closed session reject');
mustInclude(sql, 'classic_boost_reroll', 'atomic reroll');
assert.ok(
  /CREATE OR REPLACE FUNCTION public\.coin_spend_reroll[\s\S]*run_session_required/m.test(sql),
  'coin_spend_reroll requires session',
);

// 6) Session UUID idempotency
mustInclude(sql, "'run:' || s.id::text", 'run award key uses session id');
mustInclude(sql, "'trivia:' || c.session_id::text || ':'", 'trivia key uses session id');
mustInclude(sql, "'iap_tx:' || v_tx", 'iap key uses apple tx');

// 7) Atomic boost + pay (coin_post before boosts_used increment in reroll)
{
  const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.classic_boost_reroll'));
  const payAt = fn.indexOf('coin_post');
  const boostAt = fn.indexOf('boosts_used = boosts_used + 1');
  assert.ok(payAt > 0 && boostAt > payAt, 'reroll must pay before incrementing boosts_used');
}

// 8) spend_my_coins rejected
mustInclude(sql, "RAISE EXCEPTION 'use_dedicated_rpc'", 'spend_my_coins reject');

// 9) Locks
mustInclude(sql, 'pg_advisory_xact_lock', 'advisory lock');
mustInclude(sql, '_user_xact_lock', 'user lock helper');

// 10) coin_post / bank_post permissions
mustInclude(sql, 'REVOKE ALL ON FUNCTION public.coin_post', 'coin_post revoke');
mustInclude(sql, 'REVOKE ALL ON FUNCTION public.bank_post', 'bank_post revoke');
mustInclude(sql, 'insufficient_coins', 'coin insufficient');
mustInclude(sql, 'insufficient_funds', 'bank insufficient');
mustInclude(sql, 'coin_ledger_unique_source', 'coin unique source');
mustInclude(sql, 'bank_ledger_unique_source', 'bank unique source');

// 11) IAP uniqueness / revoke / service role
mustInclude(sql, 'iap_transactions', 'iap tx table');
mustInclude(sql, 'PRIMARY KEY', 'iap pk');
mustInclude(sql, 'iap_revoke_transaction', 'revoke rpc');
mustInclude(sql, '_require_service_role', 'service role gate');
mustInclude(sql, 'user_entitlements', 'entitlements table');
mustInclude(edge, 'fetchTransaction', 'apple fetch');
mustInclude(edge, 'appAccountToken', 'account token check');
mustInclude(edge, 'iap_revoke_transaction', 'edge revoke call');
mustInclude(edge, 'coin_grant_iap', 'edge grant call');
mustInclude(edge, 'account_mismatch', 'ownership check');

// 12) No destructive balance wipes
mustNotInclude(sql, 'TRUNCATE public.coin_', 'truncate coins');
mustNotInclude(sql, 'DELETE FROM public.coin_accounts', 'delete coin accounts');
mustNotInclude(sql, 'DELETE FROM public.bank_accounts', 'delete bank accounts');
mustNotInclude(sql, 'DELETE FROM public.user_perk_inventory', 'delete perk inventory');

// 13) Safe rollback preserves player/audit tables (no destructive drops)
{
  mustNotInclude(rollback, 'DROP TABLE IF EXISTS public.classic_run_sessions', 'no session table drop');
  mustNotInclude(rollback, 'DROP TABLE IF EXISTS public.iap_refund_debts', 'no refund debt drop');
  mustNotInclude(rollback, 'DROP TABLE IF EXISTS public.trivia_challenges', 'no trivia challenge drop');
  mustInclude(rollback, 'PRESERVED', 'rollback preserves note');
  mustInclude(rollback, 'user_perk_inventory', 'rollback preserves inventory note');
  mustInclude(rollback, 'iap_transactions', 'rollback preserves iap history note');
  mustInclude(sql, 'classic_run_abandon', 'abandoned run recovery');
  mustInclude(sql, 'subscription_expires_required', 'no fabricated subscription expiry');
  mustInclude(sql, 'iap_refund', 'iap_refund kind');
  mustInclude(edge, 'IAP_APPLE_ENVIRONMENT', 'explicit apple environment');
  mustInclude(edge, 'verifyAppleJws', 'apple jws verify');
  mustInclude(edge, 'environment_mismatch', 'sandbox/prod isolation');
}

// 14) Unit: shuffle remaps correct index (mirrors SQL intent)
function shuffleChoices(choices: string[], correct: number, rand: () => number) {
  const order = [0, 1, 2, 3];
  for (let i = 3; i >= 1; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  const out = order.map((i) => choices[i]!);
  const newCorrect = order.indexOf(correct);
  return { out, newCorrect };
}
{
  let n = 0;
  const rand = () => {
    const seq = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7];
    return seq[n++ % seq.length]!;
  };
  const choices = ['A', 'B', 'C', 'D'];
  const { out, newCorrect } = shuffleChoices(choices, 2, rand);
  assert.equal(out[newCorrect], 'C');
  assert.equal(out.length, 4);
  assert.deepEqual([...out].sort(), [...choices].sort());
}

// Fabrication / abuse surface assertions (RPC surface)
for (const banned of ['credit_my_coins', "RAISE EXCEPTION 'use_trivia_answer'"]) {
  mustInclude(sql, banned.includes('RAISE') ? banned : `DROP FUNCTION IF EXISTS public.${banned}`, `surface ${banned}`);
}
mustInclude(sql, "RAISE EXCEPTION 'use_trivia_answer'", 'trivia bonus reject');

console.log('check-secure-coin-bank: ok');
console.log(
  JSON.stringify(
    {
      sqlBytes: sql.length,
      sqlLines: sql.split('\n').length,
      edgeBytes: edge.length,
      findingsCovered: 14,
    },
    null,
    2,
  ),
);
