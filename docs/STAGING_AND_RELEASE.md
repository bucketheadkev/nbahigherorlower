# Staging setup + production release checklist

**Status:** Security REVIEW SQL is local-only. PGlite integration = **14/14 PASS**.  
**Rule:** Do **not** paste the SECURE migration into production until you explicitly approve it.

This guide is for a **separate staging Supabase project**. Production (`rqogjyjfatnyuoorvyix` / live 1brun) stays untouched until the final checklist is signed off.

---

## 0) What you need before starting

| Item | Why |
|------|-----|
| Supabase account login | Create a second project |
| Access to production SQL Editor (read-only is enough) | Copy schema / sample data shape |
| This repo on your Mac | Files under `supabase/admin/` and `scripts/` |
| Apple Developer account (StoreKit sandbox) | Test IAP Edge Function |
| Optional: [Supabase CLI](https://supabase.com/docs/guides/cli) | Easier function deploy |

You will create a **new** project. You will **not** rename or wipe production.

---

## 1) Create a separate staging project (beginner steps)

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Click **New project**.
3. Name it something obvious, e.g. `1brun-staging`.
4. Choose a strong database password and **save it in a password manager**.
5. Pick a region close to production (same region is fine).
6. Wait until the project shows **Healthy**.
7. Open **Project Settings → API** and copy:
   - **Project URL** → you will use as `STAGING_SUPABASE_URL`
   - **anon / publishable** key → `STAGING_SUPABASE_ANON_KEY`
   - **service_role** key → `STAGING_SUPABASE_SERVICE_ROLE_KEY` (secret; never put in the iOS/web client)

Create a local env file (do not commit):

```bash
# from repo root
cp .env.local .env.staging.local   # optional starting point
```

Put only staging values in `.env.staging.local`:

```bash
STAGING_SUPABASE_URL=https://YOUR_STAGING_REF.supabase.co
STAGING_SUPABASE_ANON_KEY=eyJ...anon...
STAGING_SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
# Optional: permanent test user JWT after you sign in once (see §4)
# STAGING_USER_ACCESS_TOKEN=eyJ...
```

Point the **game** at staging only when you intend to:

```bash
# temporary local override — never commit
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_STAGING_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...anon...
```

Restart `npm run dev` after changing these.

---

## 2) Build a representative staging schema (without touching production)

Staging should look like production’s **tables / RPCs / pools**, not a blank database.

### 2a) Preferred: schema dump from production (Dashboard)

1. In **production** Supabase → **SQL Editor**.
2. Run only **read** checks first, e.g.:

```sql
select to_regprocedure('public.coin_post(uuid,bigint,text,text,jsonb)');
select to_regclass('public.franchise_player_pool');
select to_regclass('public.classic_player_seat_values');
select to_regclass('public.bank_ledger');
select to_regclass('public.user_leaderboard_runs');
```

3. Use **Database → Backups** or the Supabase CLI (on a machine that is logged into the **production** project) to export **schema**:

```bash
# Install CLI once: https://supabase.com/docs/guides/cli
npx supabase login
npx supabase link --project-ref rqogjyjfatnyuoorvyix   # production ref — link only for dump
npx supabase db dump --schema public -f /tmp/1brun_prod_schema.sql
```

4. **Unlink / switch** before touching staging. Create a **new** link to the staging project ref, then:

```bash
npx supabase link --project-ref YOUR_STAGING_REF
# Review /tmp/1brun_prod_schema.sql — do not apply blindly if it contains DATA you must not copy.
```

5. Apply the schema dump into **staging** SQL Editor in chunks if needed (large files), **or**:

```bash
psql "$STAGING_DB_URL" -f /tmp/1brun_prod_schema.sql
```

(`STAGING_DB_URL` = Project Settings → Database → URI.)

### 2b) Acceptable alternative: migrations folder + known seeds

If a full dump is hard, on **staging only**:

1. Apply `supabase/migrations/*.sql` in filename order (SQL Editor or `psql`).
2. Ensure these exist (required by SECURE REVIEW preflight):
   - `public.coin_post` / `public.bank_post`
   - `public.franchise_player_pool` (with real team/era/eligible rows)
   - `public.classic_player_seat_values` + `classic_seat_value`
   - `public.user_leaderboard_runs` / `public.user_leaderboard_pb`
   - bank/coin ledgers with current kind CHECKs

3. Copy **anonymized** sample rows for pool + seat values if the dump skipped data (production player IDs are fine; omit personal profiles if you prefer).

### 2c) Do **not** copy production user passwords / live IAP history into staging unless scrubbed

For staging tests, create **new** auth users (see §4). Prefer empty or fake balances.

---

## 3) Apply the SECURE migration on staging only

1. Open the **staging** project → **SQL Editor**.
2. Open local file:

   `supabase/admin/2026-11-23_SECURE_coin_bank_REVIEW.sql`

3. Paste the **entire** file and **Run**.
4. If it errors, fix the staging schema (preflight messages tell you what is missing). Do **not** “fix” by editing production.
5. Re-run the same paste once (idempotent redeploy check).
6. Verify:

```sql
select to_regprocedure('public.classic_spin(uuid,text)');           -- non-null
select to_regprocedure('public.classic_run_submit(uuid)');          -- non-null
select to_regprocedure('public.credit_my_coins(bigint,text,text)'); -- NULL
select provolatile from pg_proc where proname = '_trivia_shuffle_choices'; -- 'v'
select has_function_privilege('authenticated', 'public.coin_post(uuid,bigint,text,text,jsonb)', 'execute'); -- false
select has_function_privilege('service_role', 'public.coin_grant_iap(uuid,text,text,text,text,timestamptz)', 'execute'); -- true
```

Rollback on staging only (if needed):

`supabase/admin/2026-11-23_SECURE_coin_bank_ROLLBACK.sql`  
(then re-apply prior schema pieces as needed)

---

## 4) Auth + permission tests (authenticated vs anonymous)

### Create users in staging Auth

1. Staging → **Authentication → Users → Add user**.
2. Create a **permanent** email user (not anonymous), e.g. `staging-tester@example.com`.
3. In the game pointed at staging, sign in as that user.

### Automated remote checks

From repo root (with `.env.staging.local` loaded):

```bash
set -a && source .env.staging.local && set +a
node --experimental-strip-types --import ./scripts/ts-ext-loader.mjs scripts/staging-validate.ts
```

The script will:

- Refuse to run if URL looks like production ref `rqogjyjfatnyuoorvyix`
- Exercise anon vs authenticated EXECUTE expectations
- Run spin / retry / submit / daily-cap / legacy-reject paths via service role + user JWT when provided
- Print a PASS/FAIL summary (same spirit as PGlite 14/14)

### Manual permission spot-checks (SQL as roles)

In staging SQL Editor (service role context is default there):

```sql
-- Should exist and be callable by service role only from Edge/admin:
select public._require_service_role(); -- fails unless role is service_role in JWT
```

From the **app** as anonymous (if you allow anon play): permanent-only RPCs (`classic_run_begin`, IAP, trivia bank bonus) must refuse.  
From a **signed-in permanent** account: Classic session begin → server spin → pick → submit must succeed.

---

## 5) Concurrent requests, rewards, retries

Covered by `scripts/staging-validate.ts` when env is set:

| Case | Expect |
|------|--------|
| Same `action_id` spin/reroll twice | Same result; one charge |
| Two parallel `coin_post` same source_ref | One credit/debit only |
| `classic_run_submit` twice | Second returns `duplicate: true` |
| 40 `run_award` rows then `coin_award_classic_run` | `run_award_daily_cap` |
| Insufficient coins spend | `insufficient_coins` (no silent success) |

Also manually: complete one **$1B** Classic run on staging with the **new** client build and confirm:

- Coins award (≤40/day)
- Leaderboard row appears (`user_leaderboard_runs`)
- Daily wins / settle RPCs still read that table
- Bank surplus / rollover still posts `classic_run_bonus` under the daily guard
- XP / achievements client paths still fire after verified submit (no amount changes)

---

## 6) Apple IAP Edge Function (StoreKit sandbox) — staging

### Secrets (staging project only)

```bash
npx supabase link --project-ref YOUR_STAGING_REF
npx supabase secrets set \
  IAP_APPLE_ENVIRONMENT=Sandbox \
  APPLE_ISSUER_ID=... \
  APPLE_KEY_ID=... \
  APPLE_BUNDLE_ID=com.your.1brun.bundle \
  APPLE_PRIVATE_KEY="$(cat /path/to/AuthKey_XXXXX.p8)"
```

`IAP_APPLE_ENVIRONMENT` must be exactly `Sandbox` or `Production`. Staging must use **Sandbox**. Production deploy (later, only with approval) must use **Production**. Mismatched Apple payloads are rejected (`environment_mismatch`).

Use the **same** App Store Connect API key you trust for sandbox, or a dedicated key.

### Deploy function to staging only

```bash
npx supabase functions deploy iap-purchase --project-ref YOUR_STAGING_REF
```

Do **not** deploy to production until approved.

### Sandbox test plan

1. Sandbox Apple ID on a device / Simulator StoreKit config.
2. App / TestFlight build pointed at **staging** Supabase URL + anon key.
3. Buy `com.1brun.coins.600` → Edge verifies Apple → `coin_grant_iap` → balance increases once; retry same tx → `duplicate: true`.
4. Buy `com.1brun.removeads` → `get_my_entitlements()` → `remove_ads: true`.
5. Buy Pro monthly with expiry → `pro_active: true`, `remove_ads: true` while active.
6. Simulate REFUND notification (or call `iap_revoke_transaction` as service role) → coins clawed back or `iap_refund_debts` row; **other** entitlements recompute from remaining granted txs (Pro expiry must **not** leave permanent ads-off without a remove-ads purchase).

---

## 7) Compatibility with the **currently published** App Store version

### Hard gate (read carefully)

The SECURE migration **rejects** legacy client surfaces used by older builds, including:

- `classic_spin_commit(team, era)` → `use_classic_spin`
- `submit_classic_leaderboard_lineup` → `use_classic_run_submit`
- Direct `spend_my_coins` / `post_my_trivia_bonus` mint paths

**Deploying this SQL to production while the live App Store binary still depends on those RPCs will break Classic for those users.**

Safe release order:

1. Finish staging validation with the **new** client (this repo).
2. Ship a **TestFlight / App Store** build that uses `classic_spin` / `classic_run_submit` / action ids (already wired in `lib/tradeup/classicRunSession.ts`).
3. Confirm that build against **staging**.
4. Only then apply SECURE SQL to **production**, ideally the same day the new binary goes live (or after a forced-update policy you already use).
5. Website deploy that includes the same client changes, same day as SQL.

Do **not** apply production SQL “early” to “get ahead” of the store review.

### What the published app can keep doing until cutover

- Talk to the **current** production backend (unchanged).
- Staging is where the new backend + new client meet.

---

## 8) Production deployment checklist (approval required)

Print / copy this when you are ready. **Nothing below runs without your OK.**

### A. Backup (production)

- [ ] Supabase Dashboard → **Database → Backups**: note latest automatic backup time; trigger a manual backup if the plan allows.
- [ ] Optional logical dump (schema + critical tables) to encrypted storage:

```bash
npx supabase link --project-ref rqogjyjfatnyuoorvyix
npx supabase db dump -f /secure/path/1brun_prod_presecure_$(date +%Y%m%d).sql
```

- [ ] Save a copy of current Edge Function code + secrets inventory (names only).
- [ ] Confirm ROLLBACK file is at hand: `supabase/admin/2026-11-23_SECURE_coin_bank_ROLLBACK.sql`

### B. Pre-flight

- [ ] Staging 14/14 remote validation green (`scripts/staging-validate.ts`)
- [ ] Staging StoreKit sandbox purchase + refund debt verified
- [ ] App Store / TestFlight binary with new Classic session client **ready to release**
- [ ] Website build with same client ready
- [ ] Explicit written approval to touch production

### C. Production apply (only after approval)

1. [ ] Maintenance window communicated if you use one  
2. [ ] SQL Editor (production) → paste `2026-11-23_SECURE_coin_bank_REVIEW.sql` → Run  
3. [ ] Re-run verify SELECTs from §3  
4. [ ] Deploy Edge Function `iap-purchase` to **production** + confirm Apple secrets  
5. [ ] Release App Store binary / website that matches the new RPCs  
6. [ ] Smoke: sign-in → Classic run → submit → coins → leaderboard → one sandbox/prod IAP  

### D. Safe rollback / forward-recovery strategy

If Classic or IAP is broken in production:

1. [ ] **Stop** further deploys  
2. [ ] Prefer **forward fix** (re-paste a corrected REVIEW section) if balances/ledgers are intact  
3. [ ] Safe companion: `2026-11-23_SECURE_coin_bank_ROLLBACK.sql` — **keeps** sessions, trivia attempts, perk consumptions, IAP txs, refund debts; does **not** re-enable `credit_my_coins` / client spins / fabricated leaderboard submits  
4. [ ] If `coin_post`/`bank_post` bodies were damaged: re-apply `2026-11-23_coin_post_bank_post_REFERENCE.sql`, then re-apply the V4 debt-aware `coin_post` from REVIEW  
5. [ ] Restore prior Edge Function revision if IAP verify is the failure; keep `IAP_APPLE_ENVIRONMENT` correct  
6. [ ] If data corruption is suspected: restore from the **backup taken in A** via Supabase support / PITR — do not DELETE ledger rows  

### E. App Store cutover (existing users)

1. [ ] Staging green with new client + Sandbox IAP  
2. [ ] Ship TestFlight / App Store build that uses `classic_spin` / `classic_run_submit` / action ids  
3. [ ] Do **not** apply production SQL until that binary is ready to go live the same day (legacy RPCs stay rejected)  
4. [ ] Website deploy same day as SQL + binary  
5. [ ] Smoke published path: sign-in → Classic → submit → coins → one Production IAP after `IAP_APPLE_ENVIRONMENT=Production`  

### F. Post-release watch (24–48h)

- [ ] Error rate on `classic_run_submit` / `classic_spin` / `iap-purchase`  
- [ ] Coin ledger duplicates near zero  
- [ ] Refund debt rows investigated, not ignored  
- [ ] Daily wins / WoF / bank surplus reports look normal  

---

## 9) Files reference

| File | Purpose |
|------|---------|
| `supabase/admin/2026-11-23_SECURE_coin_bank_REVIEW.sql` | Staging/prod migration (manual paste) |
| `supabase/admin/2026-11-23_SECURE_coin_bank_ROLLBACK.sql` | Safe forward-recovery companion |
| `supabase/functions/iap-purchase/index.ts` | Apple verify + grant/revoke |
| `scripts/check-secure-coin-bank-pg.ts` | Local PGlite integration (18/18) |
| `scripts/staging-validate.ts` | Remote staging RPC validation |
| `scripts/staging-apply-and-validate.ts` | Auto-apply migration chunks + SECURE SQL + checks |
| `tmp/staging-migration-chunks/` | Schema-only chunks from repo migrations |
| `docs/STAGING_AND_RELEASE.md` | This guide |

Automated staging apply (after `STAGING_DATABASE_URL` is set):

```bash
set -a && source .env.staging.local && set +a
npm run staging:apply
```

---

## 10) Current release blockers (updated)

**Status (2026-11-23):** Staging apply paused until closer to Apple launch. UI/gameplay work is unblocked; resume backend from this section.

### Read-only checks (run before and after any apply)

- `npm run staging:probe` — Auth settings + whether every table/RPC the client calls exists (public key only, refuses production).
- `npm run staging:audit` — Postgres catalog audit via `STAGING_DATABASE_URL` (SELECT / read-only txn only).
- `npm run staging:smoke` — temporary staging user: profile, welcome coins, classic begin, create_room; user deleted after.
- `npm run staging:validate` — remote RPC/permission checks (loads `.env.staging.local` on Windows).
- `supabase/admin/STAGING_AUDIT_READONLY.sql` — paste into the staging SQL Editor; lists missing tables, functions, triggers, policies, RLS-disabled tables and unsafe grants. SELECT only.

### Migration order (staging apply)

`tmp/staging-migration-chunks/` holds byte-identical copies of `supabase/migrations/*.sql`, renumbered `001_…061_`. Filename order is correct except one file: `20260810_fix_room_players_rls_recursion.sql` must run **right after** `20260810_phase1_private_1v1_rooms.sql` (it patches the recursive room policies phase1 creates). SECURE REVIEW runs last.

### Auth email links (never hit production from staging)

`lib/account/accountAuth.ts` builds confirmation / reset links. When `NEXT_PUBLIC_SUPABASE_URL` is not the production project, links never point at `1brun.com`: they use `NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN` if set, else `http://localhost:3000` (dev server on staging). Staging Auth → URL Configuration must allow those URLs.

### Resume checklist (when restarting staging)

1. Paste **one clean** staging Database URI into `.env.staging.local` → `STAGING_DATABASE_URL=`  
   (Supabase → 1brun-staging `wxifsgypdyrruxybcrcw` → Project Settings → Database → Connect → URI / Session pooler. No placeholders, no double-paste.)  
2. Run: `set -a && source .env.staging.local && set +a && npm run staging:apply`  
3. Confirm SQL surface checks + `staging-validate.ts` green.  
4. Deploy Edge `iap-purchase` to staging with `IAP_APPLE_ENVIRONMENT=Sandbox` + Apple secrets; StoreKit sandbox proof.  
5. Only then: production cutover per §7–§8 (never apply SECURE SQL to prod while old binary is live).

### Staging / backend (blocks hosted validation)

1. **`STAGING_DATABASE_URL` required** — staging API keys are set; prior URI paste was malformed (placeholder + two hosts). Cleared pending a clean paste. Must target `wxifsgypdyrruxybcrcw` only.  
2. **Staging schema not applied yet** — nine migration chunks + SECURE REVIEW are prepared; `npm run staging:apply` ready once (1) is done.  
3. **StoreKit sandbox Edge not deployed** — needs `IAP_APPLE_ENVIRONMENT=Sandbox` + Apple secrets on staging only; then sandbox purchase/refund proof.  
4. **Permanent staging user JWT optional but useful** — set `STAGING_USER_ACCESS_TOKEN` for full gameplay RPC checks in `staging-validate.ts`.

### Production / App Store (do not skip before Apple submit)

5. **Production must stay unmodified** until explicit approval + checklist §8.  
6. **App Store cutover** — deploying SECURE SQL while the live binary still uses legacy RPCs will break Classic; ship new client same day as SQL.  
7. **Production DB dump path blocked earlier** — wrong/placeholder DB passwords; staging uses **migrations** baseline instead (no private user data). Revisit only if a prod schema diff is required.  
8. **Local PGlite = 18/18 PASS** — does not replace hosted RLS/JWT/StoreKit proof on staging.
