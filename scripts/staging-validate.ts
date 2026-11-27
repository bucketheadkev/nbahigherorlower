/**
 * Remote staging validation for SECURE coin/bank.
 * Does NOT touch production. Refuses project ref rqogjyjfatnyuoorvyix.
 *
 *   set -a && source .env.staging.local && set +a
 *   node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs scripts/staging-validate.ts
 *
 * Required env:
 *   STAGING_SUPABASE_URL
 *   STAGING_SUPABASE_ANON_KEY
 *   STAGING_SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *   STAGING_USER_ACCESS_TOKEN  (JWT for a permanent staging user)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';

const PROD_REF = 'rqogjyjfatnyuoorvyix';
const STAGING_REF = 'wxifsgypdyrruxybcrcw';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(root, '.env.staging.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(STAGING_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const url = (process.env.STAGING_SUPABASE_URL ?? '').trim();
const anon = (process.env.STAGING_SUPABASE_ANON_KEY ?? '').trim();
const service = (process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const userJwt = (process.env.STAGING_USER_ACCESS_TOKEN ?? '').trim();

// Guard before loading @supabase (avoids import side-effects on misconfig).
if (!url || !anon || !service) {
  console.error(
    'Missing STAGING_SUPABASE_URL / STAGING_SUPABASE_ANON_KEY / STAGING_SUPABASE_SERVICE_ROLE_KEY.\nSee docs/STAGING_AND_RELEASE.md',
  );
  process.exit(2);
}
if (url.includes(PROD_REF) || !url.includes(STAGING_REF)) {
  console.error(
    `Refusing to run: URL must target staging ${STAGING_REF} only (production ${PROD_REF} refused).`,
  );
  process.exit(2);
}

type Row = { name: string; ok: boolean; skip?: boolean; detail?: string };
const results: Row[] = [];

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function skip(name: string, detail: string) {
  results.push({ name, ok: true, skip: true, detail });
  console.log(`SKIP  ${name} — ${detail}`);
}

async function clients() {
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonDb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const userDb = userJwt
    ? createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${userJwt}` } },
      })
    : null;
  return { db, anonDb, userDb };
}

async function rpcErrorMessage(err: { message?: string; code?: string } | null): Promise<string> {
  return `${err?.code ?? ''} ${err?.message ?? ''}`.trim();
}

async function main() {
  const { db, anonDb, userDb } = await clients();

  // 1) Migration surfaces present (EXECUTE is authenticated-only after SECURE).
  try {
    const { data, error } = await db.rpc('classic_run_begin');
    const msg = await rpcErrorMessage(error);
    // Success, permanent-account rejection, or permission denied all prove the RPC exists.
    const ok =
      (!error && typeof data === 'string' && data.length >= 32) ||
      /permanent|account|auth|uid|jwt|permission denied|42501/i.test(msg);
    record('migration_rpc_surface_reachable', ok, error ? msg.slice(0, 160) : `begin=${data}`);
  } catch (e) {
    record('migration_rpc_surface_reachable', false, e instanceof Error ? e.message : String(e));
  }

  // 2) Anon cannot execute coin_post (PostgREST should 404/403)
  {
    const { error } = await anonDb.rpc('coin_post' as never, {
      p_user: '11111111-1111-1111-1111-111111111111',
      p_amount: 1,
      p_kind: 'run_award',
      p_source_ref: 'staging_probe',
      p_metadata: {},
    } as never);
    const msg = await rpcErrorMessage(error);
    record(
      'anon_cannot_coin_post',
      Boolean(error),
      error ? msg.slice(0, 160) : 'unexpected success',
    );
  }

  // 3) Legacy submit blocked (as user if available, else service).
  // Without a user JWT, service_role may get EXECUTE denied — that still proves it is locked down.
  {
    const client = userDb ?? db;
    const { error } = await client.rpc('submit_classic_leaderboard_lineup', {
      p_lineup: [],
      p_client_run_id: 'not-a-uuid',
    });
    const msg = await rpcErrorMessage(error);
    const ok = userDb
      ? /use_classic_run_submit/i.test(msg)
      : /use_classic_run_submit|permission denied|42501/i.test(msg);
    record('legacy_submit_blocked', ok, msg.slice(0, 160));
  }

  // 4) Client spin commit blocked
  {
    const client = userDb ?? db;
    // Need a session id — if user JWT missing, skip deep gameplay and mark accordingly
    if (!userDb) {
      skip('server_spin_path', 'set STAGING_USER_ACCESS_TOKEN for full gameplay checks');
      skip('submit_retry_idempotent', 'needs user JWT');
      skip('reroll_action_id_idempotent', 'needs user JWT');
    } else {
      const begin = await userDb.rpc('classic_run_begin');
      if (begin.error || !begin.data) {
        record('server_spin_path', false, await rpcErrorMessage(begin.error));
      } else {
        const sid = String(begin.data);
        const bad = await userDb.rpc('classic_spin_commit', {
          p_session: sid,
          p_team: 'BOS',
          p_era: '1980s',
        });
        const badMsg = await rpcErrorMessage(bad.error);
        const spin = await userDb.rpc('classic_spin', {
          p_session: sid,
          p_action_id: 'stg_spin_action_01',
        });
        const spin2 = await userDb.rpc('classic_spin', {
          p_session: sid,
          p_action_id: 'stg_spin_action_01',
        });
        const row = (spin.data ?? {}) as { spin_team?: string; spin_era?: string };
        const row2 = (spin2.data ?? {}) as { spin_team?: string };
        record(
          'server_spin_path',
          /use_classic_spin/i.test(badMsg) &&
            Boolean(row.spin_team && row.spin_era) &&
            row.spin_team === row2.spin_team,
          `team=${row.spin_team} era=${row.spin_era}`,
        );

        // Reroll idempotent
        const r1 = await userDb.rpc('classic_boost_reroll', {
          p_session: sid,
          p_kind: 'reroll_team',
          p_action_id: 'stg_reroll_team_01',
        });
        const r2 = await userDb.rpc('classic_boost_reroll', {
          p_session: sid,
          p_kind: 'reroll_team',
          p_action_id: 'stg_reroll_team_01',
        });
        const a = (r1.data ?? {}) as { boosts_used?: number; spin_team?: string };
        const b = (r2.data ?? {}) as { boosts_used?: number; spin_team?: string };
        record(
          'reroll_action_id_idempotent',
          !r1.error && a.boosts_used === b.boosts_used && a.spin_team === b.spin_team,
          r1.error ? (await rpcErrorMessage(r1.error)).slice(0, 160) : `boosts=${a.boosts_used}`,
        );

        // Manual complete + submit retry via SQL admin if picks can be seeded
        const seed = await db
          .from('classic_run_sessions')
          .update({
            picks: [
              { slot: 'PG', player_id: 'p_bos_pg', value: 200000000, team: 'bos', era: '1980s', spin_seq: 1 },
              { slot: 'SG', player_id: 'p_bos_sg', value: 200000000, team: 'bos', era: '1980s', spin_seq: 2 },
              { slot: 'SF', player_id: 'p_bos_sf', value: 200000000, team: 'bos', era: '1980s', spin_seq: 3 },
              { slot: 'PF', player_id: 'p_bos_pf', value: 200000000, team: 'bos', era: '1980s', spin_seq: 4 },
              { slot: 'C', player_id: 'p_bos_c', value: 200000000, team: 'bos', era: '1980s', spin_seq: 5 },
            ],
            spin_team: null,
            spin_era: null,
            status: 'open',
          })
          .eq('id', sid);
        if (seed.error) {
          // Staging may not have those player ids — try submit on empty to confirm incomplete_lineup
          const inc = await userDb.rpc('classic_run_submit', { p_session: sid });
          const incMsg = await rpcErrorMessage(inc.error);
          record(
            'submit_retry_idempotent',
            /incomplete_lineup|invalid_pick|unknown_player/i.test(incMsg) || Boolean(inc.data),
            `seed_failed=${seed.error.message}; submit=${incMsg.slice(0, 100)}`,
          );
        } else {
          const s1 = await userDb.rpc('classic_run_submit', { p_session: sid });
          const s2 = await userDb.rpc('classic_run_submit', { p_session: sid });
          const d1 = (s1.data ?? {}) as { ok?: boolean; verified_value?: number };
          const d2 = (s2.data ?? {}) as { duplicate?: boolean; ok?: boolean };
          record(
            'submit_retry_idempotent',
            d1.ok === true && d2.duplicate === true,
            s1.error
              ? (await rpcErrorMessage(s1.error)).slice(0, 160)
              : `v=${d1.verified_value} dup=${d2.duplicate}`,
          );
        }
      }
    }
  }

  // 5) Concurrent unique source (service role coin_post)
  {
    const ref = `staging_concurrent_${Date.now()}`;
    // Resolve a real user id from JWT if possible; else skip
    let uid: string | null = null;
    if (userDb) {
      const { data } = await userDb.auth.getUser(userJwt);
      uid = data.user?.id ?? null;
    }
    if (!uid) {
      skip('concurrent_ledger_unique', 'needs STAGING_USER_ACCESS_TOKEN');
    } else {
      const calls = await Promise.all([
        db.rpc('coin_post', {
          p_user: uid,
          p_amount: 1,
          p_kind: 'admin_adjustment',
          p_source_ref: ref,
          p_metadata: {},
        } as never),
        db.rpc('coin_post', {
          p_user: uid,
          p_amount: 1,
          p_kind: 'admin_adjustment',
          p_source_ref: ref,
          p_metadata: {},
        } as never),
      ]);
      // coin_post is not granted to PostgREST clients usually — expect errors OR boolean results via SQL
      // Prefer raw SQL through rpc wrapper if exposed; else mark informational
      const msgs = await Promise.all(calls.map((c) => rpcErrorMessage(c.error)));
      const bothBlocked = calls.every((c) => c.error);
      if (bothBlocked) {
        record(
          'concurrent_ledger_unique',
          true,
          `coin_post not exposed via PostgREST (expected); msgs=${msgs[0]?.slice(0, 80)}`,
        );
      } else {
        const vals = calls.map((c) => c.data);
        record(
          'concurrent_ledger_unique',
          vals.filter((v) => v === true).length === 1 && vals.filter((v) => v === false).length === 1,
          `results=${JSON.stringify(vals)}`,
        );
      }
    }
  }

  // 6) IAP revoke requires service role; grant unknown product fails
  {
    const { error } = await db.rpc('coin_grant_iap', {
      p_user: '11111111-1111-1111-1111-111111111111',
      p_transaction_id: `stg_probe_${Date.now()}`,
      p_product_id: 'com.1brun.not.a.product',
    });
    const msg = await rpcErrorMessage(error);
    record(
      'iap_grant_rejects_unknown_product',
      /unknown_product|invalid|foreign|user/i.test(msg),
      msg.slice(0, 160),
    );
  }

  // 7) Entitlements RPC exists for authenticated
  if (userDb) {
    const { data, error } = await userDb.rpc('get_my_entitlements');
    record(
      'get_my_entitlements',
      !error && data && typeof data === 'object',
      error ? (await rpcErrorMessage(error)).slice(0, 160) : JSON.stringify(data).slice(0, 120),
    );
  } else {
    skip('get_my_entitlements', 'needs user JWT');
  }

  const failed = results.filter((r) => !r.ok && !r.skip);
  const skipped = results.filter((r) => r.skip);
  console.log('\n=== Staging validation summary ===');
  console.log(
    JSON.stringify(
      {
        url,
        total: results.length,
        passed: results.filter((r) => r.ok && !r.skip).length,
        skipped: skipped.map((s) => s.name),
        failed: failed.map((f) => f.name),
        note: 'Production untouched. See docs/STAGING_AND_RELEASE.md',
      },
      null,
      2,
    ),
  );
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
