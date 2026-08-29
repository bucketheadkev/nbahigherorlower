#!/usr/bin/env node
/**
 * Applies supabase/migrations/20260830_delete_my_data.sql to the linked database.
 * Requires DATABASE_URL or SUPABASE_DB_URL in .env.local.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env.local');
const migrationPath = path.join(root, 'supabase/migrations/20260830_delete_my_data.sql');

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
const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL;

if (!fs.existsSync(migrationPath)) {
  console.error('Missing migration:', migrationPath);
  process.exit(1);
}

if (!dbUrl) {
  console.error(
    'Set DATABASE_URL or SUPABASE_DB_URL in .env.local, then re-run:\n  node scripts/apply-delete-my-data-migration.mjs',
  );
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const result = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', migrationPath], {
  env,
  stdio: 'inherit',
});

if (result.status !== 0) {
  console.error('Migration failed.');
  process.exit(result.status ?? 1);
}

console.log('Applied delete_my_data migration successfully.');
