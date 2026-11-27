#!/usr/bin/env node
/**
 * Local-only Stitch auth check. Reads API key from ~/.cursor/mcp.json.
 * Never prints the key. Exit 0 = list_projects succeeded.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const mcpPath = join(homedir(), '.cursor', 'mcp.json');

function getKey() {
  const raw = readFileSync(mcpPath, 'utf8');
  const cfg = JSON.parse(raw);
  const key = cfg?.mcpServers?.stitch?.headers?.['X-Goog-Api-Key'];
  if (!key || key.includes('PASTE_') || key.includes('USE_USER_LEVEL')) {
    throw new Error(`No real Stitch API key in ${mcpPath}. Replace PASTE_STITCH_API_KEY_HERE.`);
  }
  return key;
}

async function mcp(method, params, key) {
  const res = await fetch('https://stitch.googleapis.com/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-Goog-Api-Key': key,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: true, status: res.status, text: text.slice(0, 400) };
  }
}

const key = getKey();
console.log('Key source: ~/.cursor/mcp.json (value hidden)');
console.log('Key length:', key.length);

const listed = await mcp('tools/call', { name: 'list_projects', arguments: {} }, key);
if (listed?.result?.isError) {
  console.error('AUTH FAIL:', listed.result.content?.[0]?.text || JSON.stringify(listed.result));
  process.exit(1);
}
if (listed?.error) {
  console.error('AUTH FAIL:', listed.error.message || JSON.stringify(listed.error));
  process.exit(1);
}
if (listed?.parseError) {
  console.error('AUTH FAIL: unexpected response', listed.text);
  process.exit(1);
}

console.log('AUTH OK: list_projects succeeded');
const payload = listed?.result?.content?.[0]?.text || JSON.stringify(listed?.result || listed);
console.log(String(payload).slice(0, 1200));
process.exit(0);
