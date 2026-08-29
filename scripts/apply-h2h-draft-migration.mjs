#!/usr/bin/env node
/**
 * Applies supabase/migrations/20260825_h2h_full_roster_draft.sql to the linked database.
 * Requires DATABASE_URL or SUPABASE_DB_URL in .env.local (Session pooler or direct Postgres).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env.local');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260825_h2h_full_roster_draft.sql',
);

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = { ...process.env, ...loadEnvFile(envPath) };
const dbUrl = env.SUPABASE_DB_URL || env.DATABASE_URL || env.POSTGRES_URL;

if (!fs.existsSync(migrationPath)) {
  console.error('Migration file missing:', migrationPath);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

if (!dbUrl) {
  console.error(
    'No DATABASE_URL / SUPABASE_DB_URL in .env.local.\n' +
      'Add your Supabase Postgres connection string, then re-run:\n' +
      '  node scripts/apply-h2h-draft-migration.mjs\n\n' +
      'Or paste this file into Supabase → SQL Editor:\n' +
      migrationPath,
  );
  process.exit(1);
}

const psql = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', migrationPath], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (psql.status !== 0) {
  console.error('Migration failed.');
  if (psql.stderr) console.error(psql.stderr.trim());
  if (psql.stdout) console.error(psql.stdout.trim());
  process.exit(psql.status || 1);
}

console.log('Applied 20260825_h2h_full_roster_draft.sql successfully.');
console.log('lock_h2h_pick now accepts any open position for classic/bounty/knockout.');
