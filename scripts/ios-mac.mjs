/**
 * Mac-side "iOS" workflow: safely pull the current branch, install dependencies only when they
 * changed, build + sync Capacitor, then open Xcode for physical iPhone testing.
 *
 *     npm run ios
 *
 * Safety: never stashes, resets, discards, merges another branch, force-pushes or deploys.
 * It stops and explains instead when the tree has local edits or the branch has diverged.
 * Docs: docs/WINDOWS_MAC_WORKFLOW.md
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const PROD_REF = 'rqogjyjfatnyuoorvyix';
const STAGING_REF = 'wxifsgypdyrruxybcrcw';

const say = (msg) => console.log(`\n[ios] ${msg}`);
const stop = (msg) => {
  console.error(`\n[ios] STOPPED: ${msg}`);
  process.exit(1);
};

function git(args, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0 && !allowFail) stop(`git ${args.join(' ')} failed:\n${(r.stderr || r.stdout).trim()}`);
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  return r.status ?? 1;
}

if (process.platform !== 'darwin') {
  stop('this builds the native iOS app and only runs on the Mac. On Windows: commit + push, then type "iOS" in Cursor on the MacBook.');
}

// 1. Where are we?
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out;
if (branch === 'HEAD') stop('detached HEAD. Check out the feature branch first (git switch <branch>).');
say(`branch: ${branch}`);

// 2. Local edits block the pull — never discard them.
const dirty = git(['status', '--porcelain', '--untracked-files=no']).out;
if (dirty && dirty.split('\n').every((l) => l.trim().endsWith('tsconfig.tsbuildinfo'))) {
  stop(
    'the only local change is tsconfig.tsbuildinfo (TypeScript build cache, now untracked upstream).\n' +
      'Nothing was pulled. It is safe to restore with:  git checkout -- tsconfig.tsbuildinfo\n' +
      'Confirm in Cursor (or run it yourself), then type "iOS" again.',
  );
}
if (dirty) {
  stop(
    `the Mac has uncommitted changes to tracked files:\n${dirty}\n\n` +
      'Nothing was pulled or changed. Decide what to do with them (commit, or ask Cursor to help), then type "iOS" again.',
  );
}

// 3. Fast-forward only.
say(`fetching origin/${branch} ...`);
git(['fetch', 'origin', branch]);
const oldHead = git(['rev-parse', 'HEAD']).out;
const upstream = `origin/${branch}`;
const [behind, ahead] = git(['rev-list', '--left-right', '--count', `${upstream}...HEAD`])
  .out.split(/\s+/)
  .map(Number);

if (behind > 0 && ahead > 0) {
  stop(
    `this Mac has ${ahead} local commit(s) and origin has ${behind} new commit(s) — the branch has diverged.\n` +
      'Nothing was changed. Resolve it deliberately (ask Cursor to help), then type "iOS" again.',
  );
}
if (behind > 0) {
  say(`pulling ${behind} new commit(s) (fast-forward only) ...`);
  git(['merge', '--ff-only', upstream]);
} else {
  say('already up to date with origin.');
}
if (ahead > 0) say(`note: this Mac has ${ahead} commit(s) not pushed to origin.`);
const newHead = git(['rev-parse', 'HEAD']).out;

// 4. Dependencies only when the lockfile changed (or were never installed).
const depsChanged =
  oldHead !== newHead && git(['diff', '--name-only', oldHead, newHead, '--', 'package.json', 'package-lock.json']).out !== '';
if (!existsSync(path.join(root, 'node_modules')) || depsChanged) {
  say(depsChanged ? 'package.json / package-lock.json changed — running npm ci ...' : 'node_modules missing — running npm ci ...');
  if (run('npm', ['ci', '--no-audit', '--no-fund']) !== 0) stop('npm ci failed (see output above).');
} else {
  say('dependencies unchanged — skipping install.');
}

// 5. Which backend will this build talk to? (host only, never keys)
const envFile = path.join(root, '.env.local');
let ref = '';
if (existsSync(envFile)) {
  const m = readFileSync(envFile, 'utf8').match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*https?:\/\/([a-z0-9]+)\.supabase\.co/m);
  ref = m ? m[1] : '';
}
if (!ref) {
  say('WARNING: .env.local has no NEXT_PUBLIC_SUPABASE_URL — accounts / leaderboards will not work in this build.');
} else {
  const label = ref === PROD_REF ? 'PRODUCTION' : ref === STAGING_REF ? 'staging' : 'unknown project';
  say(`backend in this build: ${label} (${ref}.supabase.co)`);
}

// 6. Build + sync, then Xcode.
say('building and syncing Capacitor (npm run build:ios) ...');
if (run('npm', ['run', 'build:ios']) !== 0) stop('npm run build:ios failed (see output above). Xcode was not opened.');

say('opening Xcode ...');
if (run('npx', ['cap', 'open', 'ios']) !== 0) stop('could not open Xcode (npx cap open ios).');

const head = git(['log', '-1', '--format=%h %s']).out;
say(`ready: ${branch} @ ${head}`);
say('In Xcode: pick your iPhone as the run destination and press Run (Cmd+R).');
