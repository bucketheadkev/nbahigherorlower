/**
 * Builds a Vercel prebuilt output for the legal/invite site.
 * Remote framework builds on this project stay stuck, so publish with:
 *   node scripts/prepare-vercel-output.mjs
 *   npx vercel deploy --prebuilt --prod --yes
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.vercel', 'output');

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyTree(fromDir, toDir) {
  if (!fs.existsSync(fromDir)) return;
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else copyFile(from, to);
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const staticDir = path.join(out, 'static');
copyFile(path.join(root, 'index.html'), path.join(staticDir, 'index.html'));
copyFile(path.join(root, 'privacy', 'index.html'), path.join(staticDir, 'privacy', 'index.html'));
copyFile(path.join(root, 'support', 'index.html'), path.join(staticDir, 'support', 'index.html'));
copyFile(path.join(root, 'join', 'index.html'), path.join(staticDir, 'join', 'index.html'));
copyTree(path.join(root, 'styles'), path.join(staticDir, 'styles'));
copyTree(path.join(root, 'images'), path.join(staticDir, 'images'));
copyFile(
  path.join(root, '.well-known', 'apple-app-site-association'),
  path.join(staticDir, '.well-known', 'apple-app-site-association'),
);

const funcDir = path.join(out, 'functions', 'api', 'join.func');
fs.mkdirSync(funcDir, { recursive: true });
copyFile(path.join(root, 'server', 'join-page.js'), path.join(funcDir, 'index.js'));
fs.writeFileSync(
  path.join(funcDir, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs20.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
      shouldAddHelpers: true,
      maxDuration: 10,
    },
    null,
    2,
  ),
);

fs.writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: '^/join/([^/]+)/?$',
          dest: '/api/join?code=$1',
        },
        {
          src: '^/join/?$',
          dest: '/api/join',
        },
        {
          src: '^/\\.well-known/apple-app-site-association$',
          headers: { 'content-type': 'application/json' },
          continue: true,
        },
        { handle: 'filesystem' },
      ],
    },
    null,
    2,
  ),
);

console.log('Wrote', out);
