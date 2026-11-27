#!/usr/bin/env node
/**
 * Read-only staging database audit.
 * Connects with STAGING_DATABASE_URL, runs SELECT / catalog queries only, refuses production.
 * Never prints credentials.
 *
 *   node scripts/staging-db-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STG = 'wxifsgypdyrruxybcrcw';
const PROD = 'rqogjyjfatnyuoorvyix';

const envFile = path.join(ROOT, '.env.staging.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(STAGING_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const url = (process.env.STAGING_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const anon = (process.env.STAGING_SUPABASE_ANON_KEY ?? '').trim();
const service = (process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const dbUrl = (process.env.STAGING_DATABASE_URL ?? '').trim();

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

if (!url || !anon || !service || !dbUrl) {
  fail('Missing STAGING_SUPABASE_URL / ANON / SERVICE_ROLE / DATABASE_URL in .env.staging.local');
}
const blob = `${url}\n${dbUrl}`;
if (blob.includes(PROD) || !blob.includes(STG)) {
  fail('Refusing: credentials do not target staging only.');
}
if (/\[YOUR-PASSWORD\]|paste_/i.test(dbUrl)) {
  fail('STAGING_DATABASE_URL still looks like a placeholder.');
}

const WRITE =
  /^\s*(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|vacuum|reindex|refresh|comment|security|set\s+role|set\s+session|begin|commit|rollback|lock|notify|listen|unlisten)\b/i;

async function main() {
  console.log(`Target: staging ${STG}`);
  console.log('Production ref refused:', PROD);

  // Auth settings (public endpoint)
  const settingsRes = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  if (!settingsRes.ok) fail(`Auth settings HTTP ${settingsRes.status}`);
  const settings = await settingsRes.json();
  console.log('\nAuth settings');
  const confirmOn = settings.mailer_autoconfirm !== true;
  const anonOn = settings.external?.anonymous_users === true;
  console.log(`  ${settings.external?.email === true ? 'OK  ' : 'FAIL'}  Email provider`);
  console.log(`  ${settings.disable_signup !== true ? 'OK  ' : 'FAIL'}  Sign-ups allowed`);
  console.log(
    `  ${confirmOn ? 'WARN' : 'OK  '}  Confirm email: ${confirmOn ? 'ON' : 'OFF'}`,
  );
  console.log(
    `  ${anonOn ? 'OK  ' : 'WARN'}  Anonymous sign-ins: ${anonOn ? 'ON' : 'OFF'}`,
  );

  // DB connection
  const require = createRequire(path.join(ROOT, 'tmp/pg-client/package.json'));
  const pg = require('pg');
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    statement_timeout: 60000,
  });
  // Force read-only transaction after connect.
  await client.connect();
  await client.query('BEGIN READ ONLY');
  try {
    const who = await client.query(
      `select current_database() as db,
              inet_server_addr()::text as server,
              current_user as role,
              (select setting from pg_settings where name = 'transaction_read_only') as ro`,
    );
    const w = who.rows[0];
    console.log('\nDatabase connection');
    console.log(`  OK    connected as ${w.role} to ${w.db} (read-only=${w.ro})`);

    // Confirm this is the staging project via the JWT subject host isn't available;
    // pooler user embeds the project ref.
    const user = decodeURIComponent(new URL(dbUrl).username || '');
    if (!user.includes(STG)) fail('Connected user does not embed staging ref.');
    console.log(`  OK    pooler user embeds ${STG}`);

    async function ro(sql) {
      if (WRITE.test(sql)) throw new Error(`Blocked non-SELECT: ${sql.slice(0, 80)}`);
      return client.query(sql);
    }

    // pg_cron
    const cron = await ro(`select exists(select 1 from pg_extension where extname='pg_cron') as on`);
    console.log('\npg_cron');
    console.log(`  ${cron.rows[0].on ? 'OK  ' : 'WARN'}  extension ${cron.rows[0].on ? 'installed' : 'NOT installed'}`);

    // Full audit SQL (generated, SELECT-only)
    const auditPath = path.join(ROOT, 'supabase/admin/STAGING_AUDIT_READONLY.sql');
    const auditSql = fs.readFileSync(auditPath, 'utf8');
    // Split into the two result sets: main audit + seed counts. Strip comments for the runner.
    const parts = auditSql
      .split(/;\s*\n(?=-- Separate result)/)
      .map((p) =>
        p
          .replace(/^--[^\n]*\n/gm, '')
          .trim()
          .replace(/;$/, ''),
      )
      .filter(Boolean);

    console.log('\nSchema audit (missing / unsafe)');
    const missing = await ro(parts[0]);
    if (missing.rows.length === 0) {
      console.log('  OK    no missing tables, functions, triggers, policies, or unsafe grants');
    } else {
      const by = {};
      for (const r of missing.rows) {
        by[r.problem] = (by[r.problem] || 0) + 1;
      }
      for (const [k, n] of Object.entries(by).sort()) {
        console.log(`  MISS  ${k}: ${n}`);
      }
      console.log('\n  Detail (first 40):');
      for (const r of missing.rows.slice(0, 40)) {
        console.log(`    ${r.problem.padEnd(28)} ${r.object}`);
      }
      if (missing.rows.length > 40) {
        console.log(`    … ${missing.rows.length - 40} more`);
      }
    }

    // Seed counts — tables may not exist yet. SAVEPOINT so one miss doesn't abort the txn.
    console.log('\nSeed / user row counts');
    for (const [label, sql] of [
      ['classic_player_seat_values', `select count(*)::int as n from public.classic_player_seat_values`],
      ['franchise_player_pool', `select count(*)::int as n from public.franchise_player_pool`],
      ['profiles', `select count(*)::int as n from public.profiles`],
      ['auth.users', `select count(*)::int as n from auth.users`],
    ]) {
      await client.query('SAVEPOINT seed_count');
      try {
        const r = await ro(sql);
        console.log(`  ${String(r.rows[0].n).padStart(6)}  ${label}`);
        await client.query('RELEASE SAVEPOINT seed_count');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT seed_count');
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  MISS  ${label}  (${/does not exist/i.test(msg) ? 'table missing' : msg.slice(0, 80)})`);
      }
    }

    // Surface summary
    const tables = await ro(
      `select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`,
    );
    const fns = await ro(
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`,
    );
    console.log('\nPublic schema surface');
    console.log(`  ${String(tables.rows[0].n).padStart(6)}  public tables (expect ~69 after apply)`);
    console.log(`  ${String(fns.rows[0].n).padStart(6)}  public functions (expect ~200 after apply)`);

    console.log('\n=== Audit summary ===');
    console.log(
      JSON.stringify(
        {
          stagingRef: STG,
          confirmEmail: confirmOn ? 'ON' : 'OFF',
          anonymousSignIns: anonOn ? 'ON' : 'OFF',
          pgCron: cron.rows[0].on,
          missingOrUnsafe: missing.rows.length,
          publicTables: tables.rows[0].n,
          publicFunctions: fns.rows[0].n,
        },
        null,
        2,
      ),
    );
    process.exitCode = missing.rows.length ? 1 : 0;
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
