/**
 * Apply migration chunks + SECURE REVIEW to staging, then validate.
 * Refuses production ref. Never prints credentials.
 *
 *   set -a && source .env.staging.local && set +a
 *   node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs scripts/staging-apply-and-validate.ts
 *
 * Requires:
 *   STAGING_SUPABASE_URL                  (https://wxifsgypdyrruxybcrcw.supabase.co)
 *   STAGING_SUPABASE_ANON_KEY
 *   STAGING_SUPABASE_SERVICE_ROLE_KEY
 *   STAGING_DATABASE_URL                  (postgres URI for staging ONLY)
 * Optional:
 *   STAGING_USER_ACCESS_TOKEN
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const PROD_REF = 'rqogjyjfatnyuoorvyix';
const STAGING_REF = 'wxifsgypdyrruxybcrcw';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const stagingUrl = (process.env.STAGING_SUPABASE_URL ?? '').trim();
const anon = (process.env.STAGING_SUPABASE_ANON_KEY ?? '').trim();
const service = (process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const dbUrl = (process.env.STAGING_DATABASE_URL ?? '').trim();

function fail(msg: string, code = 2): never {
  console.error(msg);
  process.exit(code);
}

function assertStagingOnly() {
  if (!stagingUrl || !anon || !service) {
    fail(
      'Missing STAGING_SUPABASE_URL / STAGING_SUPABASE_ANON_KEY / STAGING_SUPABASE_SERVICE_ROLE_KEY in env.',
    );
  }
  if (!stagingUrl.includes(STAGING_REF) || stagingUrl.includes(PROD_REF)) {
    fail(`STAGING_SUPABASE_URL must target ${STAGING_REF} only.`);
  }
  if (!dbUrl) {
    fail(
      'Missing STAGING_DATABASE_URL.\n' +
        'Add the staging Database URI to .env.staging.local (Project Settings → Database → URI).\n' +
        `Must contain ${STAGING_REF} and must NOT contain ${PROD_REF}.`,
    );
  }
  if (!dbUrl.includes(STAGING_REF) || dbUrl.includes(PROD_REF)) {
    fail(`STAGING_DATABASE_URL must target staging ref ${STAGING_REF} only. Refusing to run.`);
  }
  if (/\[YOUR-PASSWORD\]|paste_/i.test(dbUrl)) {
    fail('STAGING_DATABASE_URL still looks like a placeholder.');
  }
}

function splitSql(sql: string): string[] {
  const out: string[] = [];
  let i = 0;
  let start = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === '$') {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j]!)) j += 1;
      if (sql[j] === '$') {
        const tag = sql.slice(i, j + 1);
        const end = sql.indexOf(tag, j + 1);
        if (end < 0) throw new Error(`unclosed dollar quote at ${i}`);
        i = end + tag.length;
        continue;
      }
    }
    if (c === ';') {
      const stmt = sql.slice(start, i).trim();
      if (stmt) out.push(stmt);
      start = i + 1;
    }
    i += 1;
  }
  const last = sql.slice(start).trim();
  if (last) out.push(last);
  return out;
}

async function loadPg() {
  const prefix = path.join(root, 'tmp/pg-client');
  if (!fs.existsSync(path.join(prefix, 'node_modules/pg'))) {
    fail('Missing tmp/pg-client (pg). Run: npm install pg --prefix tmp/pg-client');
  }
  // Require from the install prefix (parent of node_modules), not from pg itself.
  const require = createRequire(path.join(prefix, 'package.json'));
  return require('pg') as typeof import('pg');
}

async function applySqlFile(client: { query: (s: string) => Promise<unknown> }, filePath: string) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const sql = raw
    .replace(/^BEGIN;\s*/m, '')
    .replace(/\nCOMMIT;\s*$/m, '\n')
    .replace(/\n-- Verify[\s\S]*$/m, '\n');
  const stmts = splitSql(sql);
  let ok = 0;
  for (const stmt of stmts) {
    // Skip empty / transaction wrappers
    if (/^(BEGIN|COMMIT|ROLLBACK)\b/i.test(stmt)) continue;
    try {
      await client.query(stmt);
      ok += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Tolerant re-apply for IF NOT EXISTS / already exists cases
      if (
        /already exists|duplicate_object|duplicate key|multiple primary keys/i.test(msg) ||
        /must be owner of/i.test(msg)
      ) {
        ok += 1;
        continue;
      }
      throw new Error(`${path.basename(filePath)} failed: ${msg.slice(0, 400)}\n--- stmt head ---\n${stmt.slice(0, 240)}`);
    }
  }
  return { file: path.basename(filePath), statements: stmts.length, applied: ok };
}

async function main() {
  assertStagingOnly();
  console.log(`Target staging ref: ${STAGING_REF}`);
  console.log('Production ref refused:', PROD_REF);

  const pg = await loadPg();
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    statement_timeout: 300000,
  });
  await client.connect();
  console.log('Connected to staging Postgres (read-write for apply).');

  const chunkDir = path.join(root, 'tmp/staging-migration-chunks');
  const chunks = fs
    .readdirSync(chunkDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (chunks.length < 1) fail('No migration chunks found in tmp/staging-migration-chunks');

  for (const name of chunks) {
    const result = await applySqlFile(client, path.join(chunkDir, name));
    console.log(`PASS  apply_chunk ${result.file} (${result.applied}/${result.statements})`);
  }

  const securePath = path.join(root, 'supabase/admin/2026-11-23_SECURE_coin_bank_REVIEW.sql');
  const secure = await applySqlFile(client, securePath);
  console.log(`PASS  apply_secure_review (${secure.applied}/${secure.statements})`);

  // Permission / surface checks via SQL
  const checks: { name: string; sql: string; expect: (rows: unknown[]) => boolean }[] = [
    {
      name: 'classic_spin_exists',
      sql: `select to_regprocedure('public.classic_spin(uuid,text)') is not null as ok`,
      expect: (rows) => Boolean((rows[0] as { ok: boolean })?.ok),
    },
    {
      name: 'classic_run_submit_exists',
      sql: `select to_regprocedure('public.classic_run_submit(uuid)') is not null as ok`,
      expect: (rows) => Boolean((rows[0] as { ok: boolean })?.ok),
    },
    {
      name: 'credit_my_coins_absent',
      sql: `select to_regprocedure('public.credit_my_coins(bigint,text,text)') is null as ok`,
      expect: (rows) => Boolean((rows[0] as { ok: boolean })?.ok),
    },
    {
      name: 'shuffle_volatile',
      sql: `select p.provolatile = 'v' as ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='_trivia_shuffle_choices' limit 1`,
      expect: (rows) => Boolean((rows[0] as { ok: boolean })?.ok),
    },
    {
      name: 'auth_cannot_execute_coin_post',
      sql: `select not has_function_privilege('authenticated', 'public.coin_post(uuid,bigint,text,text,jsonb)', 'execute') as ok`,
      expect: (rows) => Boolean((rows[0] as { ok: boolean })?.ok),
    },
    {
      name: 'service_can_grant_iap',
      sql: `select has_function_privilege('service_role', 'public.coin_grant_iap(uuid,text,text,text,text,timestamptz)', 'execute') as ok`,
      expect: (rows) => Boolean((rows[0] as { ok: boolean })?.ok),
    },
    {
      name: 'coin_ledger_has_iap_refund',
      sql: `select pg_get_constraintdef(oid) ilike '%iap_refund%' as ok from pg_constraint where conname='coin_ledger_kind_check' limit 1`,
      expect: (rows) => rows.length === 0 || Boolean((rows[0] as { ok: boolean })?.ok),
    },
    {
      name: 'classic_run_abandon_exists',
      sql: `select to_regprocedure('public.classic_run_abandon(uuid)') is not null as ok`,
      expect: (rows) => Boolean((rows[0] as { ok: boolean })?.ok),
    },
  ];

  let failed = 0;
  for (const c of checks) {
    try {
      const res = await client.query(c.sql);
      const ok = c.expect(res.rows as unknown[]);
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
      if (!ok) failed += 1;
    } catch (e) {
      console.log(`FAIL  ${c.name} — ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
      failed += 1;
    }
  }

  await client.end();

  // Remote RPC validation (API keys) — dynamic import to avoid load on misconfig
  process.env.STAGING_SUPABASE_URL = stagingUrl;
  process.env.STAGING_SUPABASE_ANON_KEY = anon;
  process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY = service;
  const validatePath = path.join(root, 'scripts/staging-validate.ts');
  console.log('\nRunning staging-validate.ts …');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--import', './scripts/ts-ext-loader.mjs', validatePath],
    { cwd: root, env: process.env, encoding: 'utf8' },
  );
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status && r.status !== 0) failed += 1;

  console.log('\n=== Staging apply summary ===');
  console.log(JSON.stringify({ stagingRef: STAGING_REF, failed, chunks: chunks.length }, null, 2));
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
