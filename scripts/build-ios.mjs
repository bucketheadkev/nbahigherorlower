import { spawnSync } from 'child_process';
import { existsSync, renameSync, rmSync } from 'fs';
import path from 'path';

/**
 * Capacitor export must not clobber the running `next dev` `.next` cache.
 * That mix 404s `/_next/static/chunks/main-app.js` and leaves the LAN homepage
 * stuck on the splash (HTML without hydration).
 */
const root = process.cwd();
const nextDir = path.join(root, '.next');
const stashDir = path.join(root, '.next-dev-stash');

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, ...extraEnv },
    shell: false,
  });
  return result.status ?? 1;
}

if (existsSync(stashDir)) {
  rmSync(stashDir, { recursive: true, force: true });
}
if (existsSync(nextDir)) {
  renameSync(nextDir, stashDir);
}

let status = 0;
try {
  status = run('npx', ['next', 'build'], { CAPACITOR_BUILD: '1' });
  if (status === 0) {
    status = run('npx', ['cap', 'sync', 'ios']);
  }
} finally {
  if (existsSync(nextDir) && existsSync(stashDir)) {
    rmSync(nextDir, { recursive: true, force: true });
  }
  if (existsSync(stashDir)) {
    renameSync(stashDir, nextDir);
  }
}

process.exit(status);
