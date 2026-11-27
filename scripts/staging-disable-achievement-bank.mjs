#!/usr/bin/env node
/**
 * Apply achievement-Bank disable SQL to staging only.
 *   node scripts/staging-disable-achievement-bank.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STG = 'wxifsgypdyrruxybcrcw';
const PROD = 'rqogjyjfatnyuoorvyix';

const env = {};
const envFile = path.join(ROOT, '.env.staging.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(STAGING_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const dbUrl = (env.STAGING_DATABASE_URL || process.env.STAGING_DATABASE_URL || '').trim();
if (!dbUrl.includes(STG) || dbUrl.includes(PROD)) {
  console.error('Refusing: STAGING_DATABASE_URL must target staging only.');
  process.exit(2);
}

const sqlPath = path.join(ROOT, 'supabase/admin/2026-11-27_DISABLE_ACHIEVEMENT_BANK_REWARDS.sql');
const raw = fs.readFileSync(sqlPath, 'utf8');
const [applySql, verifyPart] = raw.split(/\n-- Verify\n/);
const verifySql = (verifyPart || '').replace(/^-- expect:[^\n]*\n?/m, '');

const require = createRequire(path.join(ROOT, 'tmp/pg-client/package.json'));
const pg = require('pg');
const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
console.log(`Target staging ${STG}`);
await client.query(applySql);
console.log('Applied DISABLE_ACHIEVEMENT_BANK_REWARDS');
if (verifySql.trim()) {
  const res = await client.query(verifySql);
  console.log('Verify:', JSON.stringify(res.rows[0]));
  const row = res.rows[0] || {};
  if (
    Number(row.elite_company_pays) !== 0 ||
    Number(row.hit_1b_pays) !== 0 ||
    row.trigger_still_present === true
  ) {
    console.error('FAIL: disable verify mismatch');
    process.exit(1);
  }
}

const users = await client.query('select id from auth.users limit 1');
if (users.rows[0]) {
  const uid = users.rows[0].id;
  const before = await client.query(
    `select coalesce(sum(amount),0)::bigint as s from public.bank_ledger where user_id=$1 and kind='achievement'`,
    [uid],
  );
  await client.query(
    `insert into public.user_achievement_progress (user_id, completed_ids, billion_streak, h2h_wins, counted_h2h_rooms)
     values ($1, array['elite-company','hit-1b'], 0, 0, '{}')
     on conflict (user_id) do update set completed_ids = excluded.completed_ids`,
    [uid],
  );
  const after = await client.query(
    `select coalesce(sum(amount),0)::bigint as s from public.bank_ledger where user_id=$1 and kind='achievement'`,
    [uid],
  );
  console.log(`Achievement ledger before=${before.rows[0].s} after=${after.rows[0].s}`);
  if (Number(after.rows[0].s) !== Number(before.rows[0].s)) {
    console.error('FAIL: achievement upsert still minted Bank cash');
    process.exit(1);
  }
  console.log('PASS: upsert no longer mints achievement Bank cash');
}

await client.end();
console.log('DONE');
