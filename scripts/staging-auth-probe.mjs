#!/usr/bin/env node
/**
 * Read-only staging probe: Auth settings + whether the tables/RPCs the client calls exist.
 *
 * Uses only the public (anon / publishable) key and GET requests. RPCs are probed with a
 * bogus parameter so PostgREST resolves the name without executing the function.
 * Refuses to run against production.
 *
 *   npm run staging:probe
 *
 * Reads STAGING_SUPABASE_URL / STAGING_SUPABASE_ANON_KEY from the environment, else
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from .env.staging.local
 * or .env.local.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION_REF = 'rqogjyjfatnyuoorvyix';

function readEnvFile(name) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const files = { ...readEnvFile('.env.local'), ...readEnvFile('.env.staging.local') };
const url = (
  process.env.STAGING_SUPABASE_URL ||
  files.STAGING_SUPABASE_URL ||
  files.NEXT_PUBLIC_SUPABASE_URL ||
  ''
)
  .trim()
  .replace(/\/$/, '');
const key = (
  process.env.STAGING_SUPABASE_ANON_KEY ||
  files.STAGING_SUPABASE_ANON_KEY ||
  files.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  ''
).trim();

if (!url || !key) {
  console.error('STOP: staging URL or publishable key missing (.env.local / .env.staging.local).');
  process.exit(2);
}
if (url.includes(PRODUCTION_REF)) {
  console.error('STOP: URL points at PRODUCTION. This probe only runs against staging.');
  process.exit(2);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

const TABLES = [
  'profiles',
  'user_achievement_progress',
  'user_classic_progress',
  'user_classic_runs',
  'classic_player_seat_values',
  'user_leaderboard_runs',
  'user_leaderboard_pb',
  'bank_ledger',
  'coin_ledger',
  'rooms',
  'room_players',
  'h2h_matches',
  'match_results',
];

const RPCS = {
  'Coins / bank': [
    'get_my_coin_balance',
    'coin_claim_welcome',
    'coin_award_classic_run',
    'coin_spend_reroll',
    'coin_buy_perk_pack',
    'coin_buy_perk_bundle',
    'get_my_bank_balance',
    'get_run_bonus',
    'post_my_trivia_bonus',
    'trivia_issue',
    'trivia_answer',
  ],
  'Classic run (secure session)': [
    'classic_run_begin',
    'classic_spin',
    'classic_pick_commit',
    'classic_swap_commit',
    'classic_boost_reroll',
    'classic_perk_activate',
    'classic_run_submit',
  ],
  Leaderboards: [
    'submit_classic_leaderboard_lineup',
    'get_bank_leaderboard_top',
    'get_my_bank_leaderboard_rank',
    'get_classic_wins_daily',
    'get_classic_wins_all_time',
    'get_my_classic_wins_daily',
    'get_my_classic_wins_all_time',
    'settle_classic_wins_daily',
    'claim_rank_rewards',
    'get_wall_of_fame_page',
    'get_my_wall_signature',
    'stamp_wall_of_fame',
  ],
  'Progression modes': [
    'get_circuit',
    'enter_circuit',
    'start_circuit_run',
    'get_circuit_standings',
    'dynasty_state',
  ],
  'Account / 1v1': ['delete_my_data', 'create_room', 'join_room', 'get_h2h_state'],
};

async function getJson(p) {
  const res = await fetch(`${url}${p}`, { headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, body };
}

/** Probe RPC existence without executing meaningful work. */
async function probeRpc(name) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, body };
}

let missing = 0;
const line = (ok, label, note = '') =>
  console.log(`  ${ok === true ? 'OK  ' : ok === false ? 'MISS' : 'WARN'}  ${label}${note ? `  (${note})` : ''}`);

console.log(`Staging probe: ${new URL(url).host}\n`);

console.log('Auth settings');
const settings = await getJson('/auth/v1/settings');
if (settings.status !== 200 || !settings.body) {
  line(false, 'GET /auth/v1/settings', `HTTP ${settings.status} — check the publishable key`);
  process.exit(1);
}
const s = settings.body;
line(s.external?.email === true, 'Email provider enabled');
line(s.disable_signup !== true, 'Sign-ups allowed', s.disable_signup ? 'Allow new users to sign up is OFF' : '');
line(
  s.mailer_autoconfirm === true ? true : null,
  `Confirm email: ${s.mailer_autoconfirm ? 'OFF (instant session)' : 'ON (user must click the email link before logging in)'}`,
);
line(s.external?.anonymous_users === true ? true : null, `Anonymous sign-ins: ${s.external?.anonymous_users ? 'ON' : 'OFF (1v1 guest rooms need this)'}`);

console.log('\nTables');
for (const t of TABLES) {
  const r = await getJson(`/rest/v1/${t}?select=*&limit=0`);
  const code = r.body?.code;
  if (r.status === 200) line(true, t);
  else if (code === '42501') line(true, t, 'exists; anon cannot read (expected for private tables)');
  else if (code === 'PGRST205' || code === '42P01' || r.status === 404) {
    missing += 1;
    line(false, t);
  } else line(null, t, `HTTP ${r.status} ${code ?? ''}`);
}

const escape = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [group, names] of Object.entries(RPCS)) {
  console.log(`\n${group}`);
  for (const name of names) {
    const r = await probeRpc(name);
    const text = `${r.body?.message ?? ''} ${r.body?.details ?? ''} ${r.body?.hint ?? ''}`;
    // PostgREST: wrong/missing args still prove the name is in the schema cache when
    // the error mentions public.<name> or suggests an overload.
    const named = new RegExp(`public\\.${escape(name)}(\\(|\\s|$|,|\\))`).test(text);
    const suggested = new RegExp(`function public\\.${escape(name)}\\(`).test(r.body?.hint ?? '');
    if (r.status === 200 || r.status === 400 || r.status === 401 || r.status === 403) {
      line(true, name, `HTTP ${r.status}`);
    } else if (r.body?.code === 'PGRST202' && (named || suggested)) {
      line(true, name, 'in schema cache');
    } else if (r.body?.code === 'PGRST202') {
      missing += 1;
      line(false, name);
    } else line(null, name, `HTTP ${r.status} ${text.trim().slice(0, 80)}`);
  }
}

console.log(
  `\n${missing === 0 ? 'No missing tables/RPCs detected.' : `${missing} missing table(s)/RPC(s). Staging schema is incomplete.`}`,
);
process.exit(missing === 0 ? 0 : 1);
