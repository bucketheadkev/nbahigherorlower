/**
 * Staging-only secure-economy smoke using service role + a temporary auth user.
 * Does not print secrets. Deletes the temp user at the end.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STG = 'wxifsgypdyrruxybcrcw';
const PROD = 'rqogjyjfatnyuoorvyix';
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.staging.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(STAGING_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const url = env.STAGING_SUPABASE_URL.replace(/\/$/, '');
const anon = env.STAGING_SUPABASE_ANON_KEY;
const service = env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = env.STAGING_DATABASE_URL;
if (!url.includes(STG) || url.includes(PROD) || !dbUrl.includes(STG)) {
  console.error('Refusing: not staging');
  process.exit(2);
}

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `staging-smoke-${Date.now()}@example.com`;
const password = `SmokeTest_${Math.random().toString(36).slice(2)}9!`;
let userId = null;
let fails = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail ?? ''}`}`);
  if (!ok) fails += 1;
};

try {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    console.error('Could not create smoke user:', created.error?.message);
    process.exit(1);
  }
  userId = created.data.user.id;

  const userClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await userClient.auth.signInWithPassword({ email, password });
  check('signIn', !!signed.data.session, signed.error?.message);

  const username = `Smoke${Date.now().toString(36).slice(-6)}`;
  const profile = await userClient
    .from('profiles')
    .insert({ user_id: userId, username })
    .select('username')
    .single();
  check('create profile', !profile.error && profile.data?.username === username, profile.error?.message);

  const bal0 = await userClient.rpc('get_my_coin_balance');
  check('get_my_coin_balance', !bal0.error && Number(bal0.data) === 0, bal0.error?.message ?? bal0.data);

  const welcome = await userClient.rpc('coin_claim_welcome');
  check(
    'coin_claim_welcome',
    !welcome.error && Number(welcome.data) > 0,
    welcome.error?.message ?? String(welcome.data),
  );

  const bal1 = await userClient.rpc('get_my_coin_balance');
  check(
    'balance after welcome',
    !bal1.error && Number(bal1.data) === Number(welcome.data),
    bal1.error?.message ?? String(bal1.data),
  );

  const bank = await userClient.rpc('get_my_bank_balance');
  check('get_my_bank_balance', !bank.error && Number(bank.data) === 0, bank.error?.message ?? String(bank.data));

  // Anon must not mint via credit_my_coins (should be absent)
  const mint = await userClient.rpc('credit_my_coins', {
    p_amount: 100,
    p_kind: 'test',
    p_ref: 'x',
  });
  check(
    'credit_my_coins rejected',
    !!mint.error,
    mint.error ? mint.error.message : 'UNEXPECTED SUCCESS',
  );

  // classic_run_begin should work for permanent user
  const begin = await userClient.rpc('classic_run_begin', {
    p_client_run_id: `smoke-${Date.now()}`,
  });
  check(
    'classic_run_begin',
    !begin.error && !!begin.data,
    begin.error?.message ?? JSON.stringify(begin.data)?.slice(0, 120),
  );

  const room = await userClient.rpc('create_room', { display_name: 'SmokeHost' });
  check('create_room', !room.error && !!room.data, room.error?.message ?? JSON.stringify(room.data)?.slice(0, 120));

  // SQL secure surface again
  const require = createRequire(path.join(ROOT, 'tmp/pg-client/package.json'));
  const pg = require('pg');
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const sec = await client.query(`
    select
      not has_function_privilege('authenticated','public.coin_post(uuid,bigint,text,text,jsonb)','execute') as no_client_coin_post,
      to_regprocedure('public.credit_my_coins(bigint,text,text)') is null as no_credit_my_coins,
      has_function_privilege('service_role','public.coin_grant_iap(uuid,text,text,text,text,timestamptz)','execute') as svc_iap
  `);
  await client.query('ROLLBACK');
  await client.end();
  check('auth cannot coin_post', sec.rows[0].no_client_coin_post);
  check('credit_my_coins absent', sec.rows[0].no_credit_my_coins);
  check('service can coin_grant_iap', sec.rows[0].svc_iap);
} finally {
  if (userId) {
    const del = await admin.auth.admin.deleteUser(userId);
    check('cleanup smoke user', !del.error, del.error?.message);
  }
}

console.log(fails ? `\n${fails} FAIL` : '\nALL SMOKE PASS');
process.exit(fails ? 1 : 0);
