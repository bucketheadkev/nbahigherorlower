/**
 * PostgreSQL integration tests via PGlite (real Postgres WASM).
 * Applies stubs + the SECURE REVIEW migration, then exercises spins, caps,
 * retries, refunds, insufficient balances, and legacy bypasses.
 *
 *   node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs scripts/check-secure-coin-bank-pg.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = path.join(root, 'supabase/admin/2026-11-23_SECURE_coin_bank_REVIEW.sql');

const results: { name: string; ok: boolean; detail?: string }[] = [];

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Split SQL on ';' while respecting quotes, comments, and $tag$ bodies. */
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

async function main() {
  const fullSql = fs.readFileSync(sqlPath, 'utf8');
  const migration = fullSql
    .replace(/^BEGIN;\s*/m, '')
    .replace(/\nCOMMIT;\s*$/m, '\n')
    .replace(/\n-- Verify[\s\S]*$/, '\n');
  const statements = splitSql(migration);

  const db = new PGlite();

  await db.exec(`
    DO $$ BEGIN
      CREATE ROLE authenticated NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE ROLE anon NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE ROLE service_role NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, is_anonymous boolean DEFAULT false);
    CREATE TABLE public.profiles (user_id uuid PRIMARY KEY REFERENCES auth.users(id));

    CREATE TABLE public.coin_accounts (
      user_id uuid PRIMARY KEY REFERENCES auth.users(id),
      balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.coin_ledger (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id),
      amount bigint NOT NULL CHECK (amount <> 0),
      kind text NOT NULL,
      source_ref text NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT coin_ledger_unique_source UNIQUE (user_id, kind, source_ref)
    );
    CREATE TABLE public.bank_accounts (
      user_id uuid PRIMARY KEY REFERENCES auth.users(id),
      balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.bank_ledger (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id),
      amount bigint NOT NULL CHECK (amount <> 0),
      kind text NOT NULL,
      source_ref text NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT bank_ledger_unique_source UNIQUE (user_id, kind, source_ref)
    );
    ALTER TABLE public.bank_ledger ADD CONSTRAINT bank_ledger_kind_check CHECK (kind IN (
      'achievement', 'classic_run_bonus', 'cash_table_wager', 'cash_table_payout',
      'cash_table_refund', 'league_entry', 'league_payout', 'league_refund',
      'admin_adjustment', 'franchise_purchase', 'franchise_payout', 'franchise_income',
      'franchise_sale', 'rank_reward', 'run_bonus', 'franchise_chest',
      'franchise_paycheck', 'franchise_card_sale', 'daily_wins_payout', 'trivia_bonus'
    ));

    CREATE TABLE public.classic_player_seat_values (
      player_id text PRIMARY KEY,
      primary_position text,
      value_pg bigint, value_sg bigint, value_sf bigint, value_pf bigint, value_c bigint
    );
    CREATE TABLE public.franchise_player_pool (
      player_id text PRIMARY KEY,
      team_id text NOT NULL,
      era text NOT NULL,
      eligible text[] NOT NULL
    );
    CREATE TABLE public.user_leaderboard_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      verified_value bigint NOT NULL,
      lineup jsonb NOT NULL,
      client_run_id text,
      achieved_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.user_leaderboard_pb (
      user_id uuid PRIMARY KEY,
      verified_best bigint NOT NULL,
      best_run_id uuid,
      achieved_at timestamptz,
      updated_at timestamptz
    );

    CREATE OR REPLACE FUNCTION public.classic_seat_value(p_player_id text, p_slot text)
    RETURNS bigint LANGUAGE sql STABLE AS $$
      SELECT CASE upper(p_slot)
        WHEN 'PG' THEN v.value_pg WHEN 'SG' THEN v.value_sg WHEN 'SF' THEN v.value_sf
        WHEN 'PF' THEN v.value_pf WHEN 'C' THEN v.value_c ELSE NULL END
      FROM public.classic_player_seat_values v WHERE v.player_id = p_player_id;
    $$;

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT '11111111-1111-1111-1111-111111111111'::uuid;
    $$;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT jsonb_build_object(
        'is_anonymous', false,
        'role', current_setting('request.jwt.claim.role', true)
      );
    $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT current_setting('request.jwt.claim.role', true);
    $$;

    -- Preflight stubs (replaced by migration).
    CREATE OR REPLACE FUNCTION public.coin_post(uuid, bigint, text, text, jsonb)
    RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE OR REPLACE FUNCTION public.bank_post(uuid, bigint, text, text, jsonb)
    RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;

    CREATE OR REPLACE FUNCTION public.get_my_coin_balance()
    RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT coalesce((SELECT balance FROM public.coin_accounts WHERE user_id = auth.uid()), 0);
    $$;

    INSERT INTO auth.users (id) VALUES ('11111111-1111-1111-1111-111111111111');
    INSERT INTO public.profiles (user_id) VALUES ('11111111-1111-1111-1111-111111111111');

    INSERT INTO public.franchise_player_pool (player_id, team_id, era, eligible) VALUES
      ('p_bos_pg', 'BOS', '1980s', ARRAY['PG']),
      ('p_bos_sg', 'BOS', '1980s', ARRAY['SG']),
      ('p_bos_sf', 'BOS', '1980s', ARRAY['SF']),
      ('p_bos_pf', 'BOS', '1980s', ARRAY['PF']),
      ('p_bos_c',  'BOS', '1980s', ARRAY['C']),
      ('p_lal_pg', 'LAL', '1980s', ARRAY['PG']),
      ('p_lal_sg', 'LAL', '1980s', ARRAY['SG']),
      ('p_lal_sf', 'LAL', '1980s', ARRAY['SF']),
      ('p_lal_pf', 'LAL', '1980s', ARRAY['PF']),
      ('p_lal_c',  'LAL', '1980s', ARRAY['C']),
      ('p_bos_pg2','BOS', '1990s', ARRAY['PG']),
      ('p_bos_sg2','BOS', '1990s', ARRAY['SG']),
      ('p_bos_sf2','BOS', '1990s', ARRAY['SF']),
      ('p_bos_pf2','BOS', '1990s', ARRAY['PF']),
      ('p_bos_c2', 'BOS', '1990s', ARRAY['C']),
      ('p_lal_pg2','LAL', '1990s', ARRAY['PG']),
      ('p_lal_sg2','LAL', '1990s', ARRAY['SG']),
      ('p_lal_sf2','LAL', '1990s', ARRAY['SF']),
      ('p_lal_pf2','LAL', '1990s', ARRAY['PF']),
      ('p_lal_c2', 'LAL', '1990s', ARRAY['C']);

    INSERT INTO public.classic_player_seat_values
      (player_id, primary_position, value_pg, value_sg, value_sf, value_pf, value_c)
    SELECT player_id, eligible[1], 200000000, 200000000, 200000000, 200000000, 200000000
    FROM public.franchise_player_pool;
  `);

  let applyOk = false;
  try {
    for (const stmt of statements) {
      await db.exec(stmt);
    }
    applyOk = true;
    record('migration_apply', true, `${statements.length} statements`);
  } catch (err) {
    record('migration_apply', false, err instanceof Error ? err.message.slice(0, 280) : String(err));
  }

  if (applyOk) {
    try {
      for (const stmt of statements) {
        await db.exec(stmt);
      }
      record('migration_redeploy', true);
    } catch (err) {
      record('migration_redeploy', false, err instanceof Error ? err.message.slice(0, 200) : String(err));
    }
  } else {
    record('migration_redeploy', false, 'skipped — initial apply failed');
  }

  async function asService() {
    // Session-level (is_local=false): PGlite auto-commits each statement.
    await db.exec(`SELECT set_config('request.jwt.claim.role', 'service_role', false)`);
  }
  async function asUser() {
    await db.exec(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  }

  await asUser();
  await db.query(
    `INSERT INTO public.coin_accounts (user_id, balance) VALUES ('11111111-1111-1111-1111-111111111111', 5000)
     ON CONFLICT (user_id) DO UPDATE SET balance = 5000`,
  );

  // 1) Server spin — client team/era rejected; pending spin blocks; action retry idempotent
  try {
    const begin = await db.query<{ classic_run_begin: string }>(`SELECT public.classic_run_begin() AS classic_run_begin`);
    const sid = begin.rows[0]!.classic_run_begin;
    let rejected = false;
    try {
      await db.query(`SELECT public.classic_spin_commit($1::uuid, 'BOS', '1980s')`, [sid]);
    } catch (e) {
      rejected = /use_classic_spin/i.test(e instanceof Error ? e.message : String(e));
    }
    const spin = await db.query(`SELECT public.classic_spin($1::uuid, 'spin_action_001') AS r`, [sid]);
    const row = spin.rows[0]!.r as { spin_team: string; spin_era: string };
    let repeatBlocked = false;
    try {
      await db.query(`SELECT public.classic_spin($1::uuid, 'spin_action_002')`, [sid]);
    } catch (e) {
      repeatBlocked = /spin_pending/i.test(e instanceof Error ? e.message : String(e));
    }
    const spin2 = await db.query(`SELECT public.classic_spin($1::uuid, 'spin_action_001') AS r`, [sid]);
    const row2 = spin2.rows[0]!.r as { spin_team: string };
    record(
      'server_spin_and_reject_client',
      rejected && !!row.spin_team && !!row.spin_era && repeatBlocked && row2.spin_team === row.spin_team,
      `team=${row.spin_team} era=${row.spin_era}`,
    );

    const stripped = await db.query(
      `SELECT public._classic_public_picks('[{"slot":"PG","player_id":"p","value":9,"team":"bos","era":"1980s"}]'::jsonb, false) AS p`,
    );
    const pubPicks = stripped.rows[0]!.p as Array<Record<string, unknown>>;
    const noValues = Array.isArray(pubPicks) && pubPicks.every((p) => p.value == null);
    record('values_hidden_without_xray', noValues, `keys=${Object.keys(pubPicks[0] ?? {}).join(',')}`);

    (globalThis as unknown as { __sid?: string }).__sid = sid;
    (globalThis as unknown as { __spin?: { team: string; era: string } }).__spin = {
      team: String(row.spin_team),
      era: String(row.spin_era),
    };
  } catch (err) {
    record('server_spin_and_reject_client', false, err instanceof Error ? err.message.slice(0, 200) : String(err));
  }

  // 2) Daily cap on coin_award_classic_run
  try {
    await asUser();
    const uid = '11111111-1111-1111-1111-111111111111';
    for (let i = 0; i < 40; i += 1) {
      await db.query(
        `INSERT INTO coin_ledger (user_id, amount, kind, source_ref)
         VALUES ($1::uuid, 20, 'run_award', $2)
         ON CONFLICT DO NOTHING`,
        [uid, `run:capseed_${i}`],
      );
    }
    await db.query(`UPDATE coin_accounts SET balance = 5000 WHERE user_id=$1::uuid`, [uid]);
    const sid = (globalThis as unknown as { __sid?: string }).__sid;
    let capped = false;
    if (sid) {
      await db.query(
        `UPDATE classic_run_sessions SET leaderboard_run_id=gen_random_uuid(), verified_value=500000000, status='completed' WHERE id=$1::uuid`,
        [sid],
      );
      try {
        await db.query(`SELECT public.coin_award_classic_run($1)`, [sid]);
      } catch (e) {
        capped = /run_award_daily_cap/i.test(e instanceof Error ? e.message : String(e));
      }
    }
    record('daily_cap_on_award_wrapper', capped);
  } catch (err) {
    record('daily_cap_on_award_wrapper', false, err instanceof Error ? err.message.slice(0, 200) : String(err));
  }

  // 3+4) Reroll preserves axis + action_id idempotent
  try {
    await asUser();
    await db.query(`UPDATE coin_accounts SET balance = 5000 WHERE user_id='11111111-1111-1111-1111-111111111111'`);
    const b = await db.query<{ classic_run_begin: string }>(`SELECT public.classic_run_begin() AS classic_run_begin`);
    const sid = b.rows[0]!.classic_run_begin;
    await db.query(`SELECT public.classic_spin($1::uuid, 'spin_rr_base01')`, [sid]);
    const before = await db.query(`SELECT spin_team, spin_era FROM classic_run_sessions WHERE id=$1::uuid`, [sid]);
    const era0 = String((before.rows[0] as { spin_era: string }).spin_era);
    const team0 = String((before.rows[0] as { spin_team: string }).spin_team);
    const r1 = await db.query(`SELECT public.classic_boost_reroll($1::uuid, 'reroll_team', 'act_reroll_team1') AS r`, [sid]);
    const r2 = await db.query(`SELECT public.classic_boost_reroll($1::uuid, 'reroll_team', 'act_reroll_team1') AS r`, [sid]);
    const a = r1.rows[0]!.r as { boosts_used: number; spin_team: string; spin_era: string };
    const b2 = r2.rows[0]!.r as { boosts_used: number; spin_team: string; spin_era: string };
    const eraPreserved = String(a.spin_era) === era0;
    const teamChanged = String(a.spin_team).toLowerCase() !== team0.toLowerCase();
    record(
      'reroll_retry_idempotent_preserves_axis',
      a.boosts_used === b2.boosts_used &&
        a.spin_team === b2.spin_team &&
        eraPreserved &&
        teamChanged,
      `boosts=${a.boosts_used} era=${a.spin_era} team=${a.spin_team}`,
    );

    // Era reroll preserves team
    const r3 = await db.query(`SELECT public.classic_boost_reroll($1::uuid, 'reroll_era', 'act_reroll_era1') AS r`, [sid]);
    const c = r3.rows[0]!.r as { spin_team: string; spin_era: string };
    record(
      'era_reroll_preserves_team',
      String(c.spin_team).toLowerCase() === String(a.spin_team).toLowerCase() &&
        String(c.spin_era) !== String(a.spin_era),
      `team=${c.spin_team} era=${c.spin_era}`,
    );
  } catch (err) {
    record('reroll_retry_idempotent_preserves_axis', false, err instanceof Error ? err.message.slice(0, 200) : String(err));
  }

  // 7) Submit retry after complete
  try {
    await asUser();
    // Clear seeded awards so submit can award once
    await db.query(`DELETE FROM coin_ledger WHERE user_id='11111111-1111-1111-1111-111111111111' AND kind='run_award' AND source_ref LIKE 'run:capseed_%'`);
    const b = await db.query<{ classic_run_begin: string }>(`SELECT public.classic_run_begin() AS classic_run_begin`);
    const sid = b.rows[0]!.classic_run_begin;
    await db.query(
      `UPDATE classic_run_sessions SET
         picks = $2::jsonb,
         status='open',
         spin_team=NULL, spin_era=NULL
       WHERE id=$1::uuid`,
      [
        sid,
        JSON.stringify([
          { slot: 'PG', player_id: 'p_bos_pg', value: 200000000, team: 'bos', era: '1980s', spin_seq: 1 },
          { slot: 'SG', player_id: 'p_bos_sg', value: 200000000, team: 'bos', era: '1980s', spin_seq: 2 },
          { slot: 'SF', player_id: 'p_bos_sf', value: 200000000, team: 'bos', era: '1980s', spin_seq: 3 },
          { slot: 'PF', player_id: 'p_bos_pf', value: 200000000, team: 'bos', era: '1980s', spin_seq: 4 },
          { slot: 'C', player_id: 'p_bos_c', value: 200000000, team: 'bos', era: '1980s', spin_seq: 5 },
        ]),
      ],
    );
    const s1 = await db.query(`SELECT public.classic_run_submit($1::uuid) AS r`, [sid]);
    const s2 = await db.query(`SELECT public.classic_run_submit($1::uuid) AS r`, [sid]);
    const ok1 = (s1.rows[0]!.r as { ok: boolean }).ok === true;
    const dup = (s2.rows[0]!.r as { duplicate?: boolean }).duplicate === true;
    const verified = Number((s1.rows[0]!.r as { verified_value: number }).verified_value) === 1000000000;
    record('submit_retry_after_complete', ok1 && dup && verified, `ok=${ok1} dup=${dup} v=${(s1.rows[0]!.r as { verified_value: number }).verified_value}`);
  } catch (err) {
    record('submit_retry_after_complete', false, err instanceof Error ? err.message.slice(0, 240) : String(err));
  }

  // Insufficient coins raises
  try {
    await asUser();
    await db.query(`UPDATE coin_accounts SET balance = 0 WHERE user_id='11111111-1111-1111-1111-111111111111'`);
    let raised = false;
    try {
      await db.query(
        `SELECT public.coin_post('11111111-1111-1111-1111-111111111111'::uuid, -100, 'spend', 'test_insuf_1', '{}'::jsonb)`,
      );
    } catch (e) {
      raised = /insufficient_coins/i.test(e instanceof Error ? e.message : String(e));
    }
    record('insufficient_coins_raises', raised);
  } catch (err) {
    record('insufficient_coins_raises', false, err instanceof Error ? err.message.slice(0, 200) : String(err));
  }

  // 9+10) IAP entitlements + refund debt
  try {
    await asService();
    await db.query(`UPDATE coin_accounts SET balance = 100 WHERE user_id='11111111-1111-1111-1111-111111111111'`);
    await db.query(
      `SELECT public.coin_grant_iap(
        '11111111-1111-1111-1111-111111111111'::uuid, 'tx_coins_1', 'com.1brun.coins.600',
        NULL, 'Sandbox', NULL)`,
    );
    await db.query(
      `SELECT public.coin_grant_iap(
        '11111111-1111-1111-1111-111111111111'::uuid, 'tx_remove_1', 'com.1brun.removeads',
        NULL, 'Sandbox', NULL)`,
    );
    await db.query(
      `SELECT public.coin_grant_iap(
        '11111111-1111-1111-1111-111111111111'::uuid, 'tx_pro_1', 'com.1brun.pro.monthly',
        NULL, 'Sandbox', now() + interval '10 days')`,
    );
    const ent1 = await db.query(`SELECT public._iap_recompute_entitlements('11111111-1111-1111-1111-111111111111'::uuid) AS e`);
    const e1 = ent1.rows[0]!.e as { remove_ads: boolean; pro_active: boolean };
    await db.query(`UPDATE coin_accounts SET balance = 50 WHERE user_id='11111111-1111-1111-1111-111111111111'`);
    const rev = await db.query(`SELECT public.iap_revoke_transaction('tx_coins_1') AS r`);
    const rr = rev.rows[0]!.r as { debt_remaining?: number; debited?: boolean };
    const debt = await db.query(
      `SELECT amount_remaining FROM iap_refund_debts WHERE transaction_id='tx_coins_1'`,
    );
    await db.query(`SELECT public.iap_revoke_transaction('tx_pro_1')`);
    const ent2 = await db.query(`SELECT public._iap_recompute_entitlements('11111111-1111-1111-1111-111111111111'::uuid) AS e`);
    const e2 = ent2.rows[0]!.e as { remove_ads: boolean; pro_active: boolean };

    // Expired pro alone must not keep remove_ads without permanent remove_ads tx
    await db.query(
      `UPDATE iap_transactions SET status='revoked' WHERE transaction_id='tx_remove_1'`,
    );
    await db.query(
      `INSERT INTO iap_transactions (transaction_id, user_id, product_id, status, granted_coins, expires_at)
       VALUES ('tx_pro_expired', '11111111-1111-1111-1111-111111111111', 'com.1brun.pro.monthly', 'granted', 750, now() - interval '1 day')
       ON CONFLICT DO NOTHING`,
    );
    const ent3 = await db.query(`SELECT public._iap_recompute_entitlements('11111111-1111-1111-1111-111111111111'::uuid) AS e`);
    const e3 = ent3.rows[0]!.e as { remove_ads: boolean; pro_active: boolean };

    await asUser();
    const spendable = await db.query(`SELECT public.get_my_coin_balance() AS b`);
    const bal = Number(spendable.rows[0]!.b);
    record(
      'iap_entitlements_and_refund_debt',
      e1.remove_ads === true &&
        e1.pro_active === true &&
        e2.remove_ads === true &&
        e2.pro_active === false &&
        e3.remove_ads === false &&
        e3.pro_active === false &&
        (Number(debt.rows[0]?.amount_remaining ?? 0) > 0 || rr.debited === true) &&
        bal >= 0,
      `e2.remove=${e2.remove_ads} e3.remove=${e3.remove_ads} debt=${debt.rows[0]?.amount_remaining ?? 0} bal=${bal}`,
    );
  } catch (err) {
    record('iap_entitlements_and_refund_debt', false, err instanceof Error ? err.message.slice(0, 240) : String(err));
  }

  // 12) Legacy bypass + spend_my_coins
  try {
    await asUser();
    let legacy = false;
    try {
      await db.query(`SELECT public.submit_classic_leaderboard_lineup('[]'::jsonb, 'not-a-uuid')`);
    } catch (e) {
      legacy = /use_classic_run_submit/i.test(e instanceof Error ? e.message : String(e));
    }
    let spend = false;
    try {
      await db.query(`SELECT public.spend_my_coins(100, 'reroll:x')`);
    } catch (e) {
      spend = /use_dedicated_rpc/i.test(e instanceof Error ? e.message : String(e));
    }
    const svcGrant = await db.query<{ has: boolean }>(
      `SELECT has_function_privilege('service_role', 'public.coin_grant_iap(uuid,text,text,text,text,timestamptz)', 'execute') AS has`,
    );
    const authCoinPost = await db.query<{ has: boolean }>(
      `SELECT has_function_privilege('authenticated', 'public.coin_post(uuid,bigint,text,text,jsonb)', 'execute') AS has`,
    );
    record(
      'legacy_rpc_bypasses_blocked',
      legacy && spend && svcGrant.rows[0]?.has === true && authCoinPost.rows[0]?.has === false,
      `legacy=${legacy} spend=${spend} svc=${svcGrant.rows[0]?.has} auth_coin=${authCoinPost.rows[0]?.has}`,
    );
  } catch (err) {
    record('legacy_rpc_bypasses_blocked', false, err instanceof Error ? err.message.slice(0, 200) : String(err));
  }

  // 13) shuffle is VOLATILE
  try {
    const vol = await db.query<{ volatility: string }>(
      `SELECT p.provolatile AS volatility
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='_trivia_shuffle_choices'`,
    );
    const v = vol.rows[0]?.volatility;
    record('trivia_shuffle_volatile', v === 'v', `provolatile=${v}`);
  } catch (err) {
    record('trivia_shuffle_volatile', false, err instanceof Error ? err.message.slice(0, 200) : String(err));
  }

  // 5) Player swap replaces slot; double draft / xray flags activate
  try {
    await asUser();
    await db.query(`UPDATE coin_accounts SET balance = 5000 WHERE user_id='11111111-1111-1111-1111-111111111111'`);
    await db.query(
      `INSERT INTO user_perk_inventory (user_id, double_draft, xray, player_swap)
       VALUES ('11111111-1111-1111-1111-111111111111', 2, 2, 2)
       ON CONFLICT (user_id) DO UPDATE SET double_draft=2, xray=2, player_swap=2`,
    );
    const b = await db.query<{ classic_run_begin: string }>(`SELECT public.classic_run_begin() AS classic_run_begin`);
    const sid = b.rows[0]!.classic_run_begin;
    await db.query(`SELECT public.classic_perk_activate($1::uuid, 'xray', 'act_xray_0001')`, [sid]);
    await db.query(`SELECT public.classic_perk_activate($1::uuid, 'double_draft', 'act_dd_00001')`, [sid]);
    const perks = await db.query(`SELECT perks FROM classic_run_sessions WHERE id=$1::uuid`, [sid]);
    const pk = (perks.rows[0] as { perks: Record<string, unknown> }).perks;
    const xrayOn = pk.xray === true;
    const ddLeft = Number(pk.double_draft_left) === 2;

    await db.query(
      `UPDATE classic_run_sessions SET
        picks='[{"slot":"PG","player_id":"p_bos_pg","value":1,"team":"bos","era":"1980s","spin_seq":1}]'::jsonb,
        spin_team='lal', spin_era='1980s',
        perks=perks || '{"used_player_swap":true,"player_swap":true,"player_swap_left":1}'::jsonb
       WHERE id=$1::uuid`,
      [sid],
    );
    const sw = await db.query(
      `SELECT public.classic_swap_commit($1::uuid, 'PG', 'p_lal_pg', 'swap_act_001') AS r`,
      [sid],
    );
    const picks = (sw.rows[0]!.r as { picks: Array<{ player_id: string; value?: number }> }).picks;
    // With xray still on, values may appear; without strip check player id swap.
    const swapped = picks?.[0]?.player_id === 'p_lal_pg';
    // Free/rewarded-ad reroll: free_team_left consumes without charge
    const b2 = await db.query<{ classic_run_begin: string }>(`SELECT public.classic_run_begin() AS classic_run_begin`);
    const sid2 = b2.rows[0]!.classic_run_begin;
    await db.query(`SELECT public.classic_spin($1::uuid, 'spin_free_rr01')`, [sid2]);
    await db.query(`UPDATE coin_accounts SET balance = 0 WHERE user_id='11111111-1111-1111-1111-111111111111'`);
    const free = await db.query(`SELECT public.classic_boost_reroll($1::uuid, 'reroll_team', 'act_free_team1') AS r`, [sid2]);
    const fr = free.rows[0]!.r as { free?: boolean; boosts_used: number };
    record(
      'player_swap_and_perk_effects',
      swapped && xrayOn && ddLeft && fr.free === true && fr.boosts_used === 1,
      `swap=${swapped} xray=${xrayOn} dd=${ddLeft} free=${fr.free}`,
    );
  } catch (err) {
    record('player_swap_and_perk_effects', false, err instanceof Error ? err.message.slice(0, 240) : String(err));
  }

  // Concurrent-ish: two sessions cannot double-award same source via unique ledger
  try {
    await asUser();
    await db.query(`UPDATE coin_accounts SET balance = 1000 WHERE user_id='11111111-1111-1111-1111-111111111111'`);
    const a = await db.query(
      `SELECT public.coin_post('11111111-1111-1111-1111-111111111111'::uuid, 20, 'run_award', 'run:concurrent_test', '{}'::jsonb) AS ok`,
    );
    const b = await db.query(
      `SELECT public.coin_post('11111111-1111-1111-1111-111111111111'::uuid, 20, 'run_award', 'run:concurrent_test', '{}'::jsonb) AS ok`,
    );
    record(
      'idempotent_ledger_unique_source',
      a.rows[0]!.ok === true && b.rows[0]!.ok === false,
      `first=${a.rows[0]!.ok} second=${b.rows[0]!.ok}`,
    );
  } catch (err) {
    record('idempotent_ledger_unique_source', false, err instanceof Error ? err.message.slice(0, 200) : String(err));
  }

  // Abandoned-run recovery: 3 incomplete opens must not block a 4th begin
  try {
    await asUser();
    for (let i = 0; i < 3; i += 1) {
      await db.query(`SELECT public.classic_run_begin()`);
    }
    const fourth = await db.query<{ classic_run_begin: string }>(
      `SELECT public.classic_run_begin() AS classic_run_begin`,
    );
    const open = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM classic_run_sessions
       WHERE user_id='11111111-1111-1111-1111-111111111111' AND status='open'`,
    );
    const abandoned = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM classic_run_sessions
       WHERE user_id='11111111-1111-1111-1111-111111111111' AND status='abandoned'`,
    );
    record(
      'abandoned_run_recovery',
      Boolean(fourth.rows[0]?.classic_run_begin) &&
        Number(open.rows[0]?.n) <= 3 &&
        Number(abandoned.rows[0]?.n) >= 1,
      `open=${open.rows[0]?.n} abandoned=${abandoned.rows[0]?.n}`,
    );
  } catch (err) {
    record('abandoned_run_recovery', false, err instanceof Error ? err.message.slice(0, 200) : String(err));
  }

  // Refund debt collected on credit + spend; iap_refund kind accepted
  try {
    await asService();
    const uid = '11111111-1111-1111-1111-111111111111';
    await db.query(`UPDATE coin_accounts SET balance = 0 WHERE user_id=$1::uuid`, [uid]);
    await db.query(`DELETE FROM iap_refund_debts WHERE user_id=$1::uuid`, [uid]);
    await db.query(
      `INSERT INTO iap_transactions (transaction_id, user_id, product_id, status, granted_coins)
       VALUES ('tx_debt_seed', $1::uuid, 'com.1brun.coins.600', 'revoked', 600)
       ON CONFLICT (transaction_id) DO UPDATE SET status='revoked', granted_coins=600`,
      [uid],
    );
    await db.query(
      `INSERT INTO iap_refund_debts (transaction_id, user_id, amount_remaining)
       VALUES ('tx_debt_seed', $1::uuid, 200)
       ON CONFLICT (transaction_id) DO UPDATE SET amount_remaining=200`,
      [uid],
    );
    // Credit should claw debt first
    await db.query(
      `SELECT public.coin_post($1::uuid, 150, 'run_award', 'run:debt_credit_1', '{}'::jsonb)`,
      [uid],
    );
    const afterCredit = await db.query(
      `SELECT balance FROM coin_accounts WHERE user_id=$1::uuid`,
      [uid],
    );
    const debt1 = await db.query(
      `SELECT amount_remaining FROM iap_refund_debts WHERE transaction_id='tx_debt_seed'`,
    );
    const bal1 = Number((afterCredit.rows[0] as { balance: number }).balance);
    const rem1 = debt1.rows[0] ? Number((debt1.rows[0] as { amount_remaining: number }).amount_remaining) : 0;
    // Remaining debt 50; credit 100 then spend should collect before spend
    await db.query(
      `SELECT public.coin_post($1::uuid, 100, 'run_award', 'run:debt_credit_2', '{}'::jsonb)`,
      [uid],
    );
    await asUser();
    await db.query(`UPDATE coin_accounts SET balance = 80 WHERE user_id=$1::uuid`, [uid]);
    // Force remaining debt
    await db.query(
      `INSERT INTO iap_refund_debts (transaction_id, user_id, amount_remaining)
       VALUES ('tx_debt_seed', $1::uuid, 50)
       ON CONFLICT (transaction_id) DO UPDATE SET amount_remaining=50`,
      [uid],
    );
    let spendBlockedOrCollected = false;
    try {
      await db.query(
        `SELECT public.coin_post($1::uuid, -100, 'spend', 'spend:after_refund_1', '{}'::jsonb)`,
        [uid],
      );
      const bal2 = await db.query(`SELECT balance FROM coin_accounts WHERE user_id=$1::uuid`, [uid]);
      // 80 - 50 debt = 30, then -100 should fail insufficient; if collect-only path left balance
      spendBlockedOrCollected = Number((bal2.rows[0] as { balance: number }).balance) <= 30;
    } catch (e) {
      spendBlockedOrCollected = /insufficient_coins/i.test(e instanceof Error ? e.message : String(e));
    }
    const kindOk = await db.query(
      `INSERT INTO coin_ledger (user_id, amount, kind, source_ref)
       VALUES ($1::uuid, -1, 'iap_refund', 'iap_refund:kind_probe')
       RETURNING kind`,
      [uid],
    );
    record(
      'refund_debt_on_credit_and_spend',
      bal1 === 0 && rem1 === 50 && spendBlockedOrCollected && kindOk.rows[0]?.kind === 'iap_refund',
      `bal1=${bal1} rem1=${rem1} spendOk=${spendBlockedOrCollected}`,
    );
  } catch (err) {
    record('refund_debt_on_credit_and_spend', false, err instanceof Error ? err.message.slice(0, 240) : String(err));
  }

  // Subscription grant requires expires_at; null expiry does not activate Pro
  try {
    await asService();
    let required = false;
    try {
      await db.query(
        `SELECT public.coin_grant_iap(
          '11111111-1111-1111-1111-111111111111'::uuid, 'tx_pro_no_exp', 'com.1brun.pro.monthly',
          NULL, 'Sandbox', NULL)`,
      );
    } catch (e) {
      required = /subscription_expires_required/i.test(e instanceof Error ? e.message : String(e));
    }
    await db.query(
      `INSERT INTO iap_transactions (transaction_id, user_id, product_id, status, granted_coins, expires_at)
       VALUES ('tx_pro_null_exp', '11111111-1111-1111-1111-111111111111', 'com.1brun.pro.monthly', 'granted', 750, NULL)
       ON CONFLICT DO NOTHING`,
    );
    const ent = await db.query(
      `SELECT public._iap_recompute_entitlements('11111111-1111-1111-1111-111111111111'::uuid) AS e`,
    );
    const e = ent.rows[0]!.e as { pro_active: boolean };
    // May still be active from earlier tests — revoke those first
    await db.query(
      `UPDATE iap_transactions SET status='revoked'
       WHERE user_id='11111111-1111-1111-1111-111111111111'
         AND product_id IN ('com.1brun.pro.monthly','com.1brun.pro.yearly','com.1brun.removeads','com.1brun.premium')
         AND transaction_id <> 'tx_pro_null_exp'`,
    );
    const ent2 = await db.query(
      `SELECT public._iap_recompute_entitlements('11111111-1111-1111-1111-111111111111'::uuid) AS e`,
    );
    const e2 = ent2.rows[0]!.e as { pro_active: boolean; remove_ads: boolean };
    record(
      'subscription_expires_not_fabricated',
      required && e2.pro_active === false && e2.remove_ads === false,
      `required=${required} pro=${e2.pro_active} remove=${e2.remove_ads} priorPro=${e.pro_active}`,
    );
  } catch (err) {
    record(
      'subscription_expires_not_fabricated',
      false,
      err instanceof Error ? err.message.slice(0, 200) : String(err),
    );
  }

  // Safe rollback preserves debt/history tables
  try {
    const rollback = fs.readFileSync(
      path.join(root, 'supabase/admin/2026-11-23_SECURE_coin_bank_ROLLBACK.sql'),
      'utf8',
    );
    const destructive =
      /DROP TABLE IF EXISTS public\.iap_refund_debts/i.test(rollback) ||
      /DROP TABLE IF EXISTS public\.classic_run_sessions/i.test(rollback) ||
      /DROP TABLE IF EXISTS public\.trivia_challenges/i.test(rollback);
    record('safe_rollback_preserves_tables', !destructive && /PRESERVED/i.test(rollback));
  } catch (err) {
    record('safe_rollback_preserves_tables', false, err instanceof Error ? err.message : String(err));
  }

  await db.close();

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== Integration summary ===');
  console.log(
    JSON.stringify(
      {
        total: results.length,
        passed: results.length - failed.length,
        failed: failed.map((f) => f.name),
        details: results,
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
