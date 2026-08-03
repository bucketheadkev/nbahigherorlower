/**
 * Fetches ESPN player headshot URLs from live roster pages.
 * ESPN is the only approved source for player photos.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ROSTERS_PATH = path.join(ROOT, 'lib/tradeup/rosters.ts');
const OUTPUT_PATH = path.join(ROOT, 'lib/tradeup/playerHeadshots.ts');

const TEAMS = [
  { id: 'ATL', slug: 'atl', name: 'Atlanta Hawks' },
  { id: 'BOS', slug: 'bos', name: 'Boston Celtics' },
  { id: 'BKN', slug: 'bkn', name: 'Brooklyn Nets' },
  { id: 'CHA', slug: 'cha', name: 'Charlotte Hornets' },
  { id: 'CHI', slug: 'chi', name: 'Chicago Bulls' },
  { id: 'CLE', slug: 'cle', name: 'Cleveland Cavaliers' },
  { id: 'DET', slug: 'det', name: 'Detroit Pistons' },
  { id: 'IND', slug: 'ind', name: 'Indiana Pacers' },
  { id: 'MIA', slug: 'mia', name: 'Miami Heat' },
  { id: 'MIL', slug: 'mil', name: 'Milwaukee Bucks' },
  { id: 'NYK', slug: 'ny', name: 'New York Knicks' },
  { id: 'ORL', slug: 'orl', name: 'Orlando Magic' },
  { id: 'PHI', slug: 'phi', name: 'Philadelphia 76ers' },
  { id: 'TOR', slug: 'tor', name: 'Toronto Raptors' },
  { id: 'WAS', slug: 'wsh', name: 'Washington Wizards' },
  { id: 'DAL', slug: 'dal', name: 'Dallas Mavericks' },
  { id: 'DEN', slug: 'den', name: 'Denver Nuggets' },
  { id: 'GSW', slug: 'gs', name: 'Golden State Warriors' },
  { id: 'HOU', slug: 'hou', name: 'Houston Rockets' },
  { id: 'LAC', slug: 'lac', name: 'LA Clippers' },
  { id: 'LAL', slug: 'lal', name: 'Los Angeles Lakers' },
  { id: 'MEM', slug: 'mem', name: 'Memphis Grizzlies' },
  { id: 'MIN', slug: 'min', name: 'Minnesota Timberwolves' },
  { id: 'NOP', slug: 'no', name: 'New Orleans Pelicans' },
  { id: 'OKC', slug: 'okc', name: 'Oklahoma City Thunder' },
  { id: 'PHX', slug: 'phx', name: 'Phoenix Suns' },
  { id: 'POR', slug: 'por', name: 'Portland Trail Blazers' },
  { id: 'SAC', slug: 'sac', name: 'Sacramento Kings' },
  { id: 'SAS', slug: 'sa', name: 'San Antonio Spurs' },
  { id: 'UTA', slug: 'utah', name: 'Utah Jazz' },
];

function normalizeName(name) {
  return name
    .replace(/\s+\d+\s*$/, '')
    .trim()
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/\s+/g, ' ');
}

function decodeHtml(text) {
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

function parseHeadshotsFromHtml(html) {
  const players = [];
  const rows = [...html.matchAll(/<tr class="Table__TR[^"]*" data-idx="\d+"([\s\S]*?)<\/tr>/g)];

  for (const row of rows) {
    const chunk = row[0];
    const idMatch = chunk.match(/player\/_\/id\/(\d+)\//);
    if (!idMatch) continue;

    const espnId = idMatch[1];
    let headshotUrl =
      chunk.match(/alt="(https:\/\/a\.espncdn\.com\/i\/headshots\/nba\/players\/full\/\d+\.png)"/)?.[1] ??
      `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`;

    const nameCell = chunk.match(
      /<td class="Table__TD"><div[^>]*><a[^>]*>([^<]+)<\/a>/,
    );
    if (!nameCell) continue;

    const name = decodeHtml(nameCell[1].replace(/\s+\d+\s*$/, '').trim());
    players.push({ name, espnId, headshotUrl });
  }

  return players;
}

function parseGameRoster(source) {
  const players = [];
  const regex =
    /p\('([^']+)',\s*'((?:\\'|[^'])*)',\s*'([^']+)'/g;
  let m;
  while ((m = regex.exec(source)) !== null) {
    players.push({
      id: m[1],
      name: m[2].replace(/\\'/g, "'"),
      teamId: m[3],
    });
  }
  return players;
}

async function fetchTeamRoster(team) {
  const slug = team.name.toLowerCase().replace(/\s+/g, '-');
  const url = `https://www.espn.com/nba/team/roster/_/name/${team.slug}/${slug}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'text/html',
    },
  });
  if (!res.ok) throw new Error(`${team.id}: HTTP ${res.status}`);
  return parseHeadshotsFromHtml(await res.text());
}

async function main() {
  const gamePlayers = parseGameRoster(fs.readFileSync(ROSTERS_PATH, 'utf8'));
  const espnByName = new Map();

  for (const team of TEAMS) {
    const roster = await fetchTeamRoster(team);
    await new Promise((r) => setTimeout(r, 200));
    for (const p of roster) {
      espnByName.set(normalizeName(p.name), p);
    }
  }

  const headshots = {};
  const missing = [];

  for (const player of gamePlayers) {
    const espn = espnByName.get(normalizeName(player.name));
    if (espn?.headshotUrl) {
      headshots[player.id] = espn.headshotUrl;
    } else {
      missing.push(`${player.name} (${player.id})`);
    }
  }

  const lines = [];
  lines.push('/** ESPN player headshots — auto-generated, do not edit manually. */');
  lines.push('');
  lines.push('export const PLAYER_HEADSHOTS: Record<string, string> = {');
  for (const [id, url] of Object.entries(headshots).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  ${JSON.stringify(id)}: ${JSON.stringify(url)},`);
  }
  lines.push('};');
  lines.push('');
  lines.push('const loggedMissing = new Set<string>();');
  lines.push('');
  lines.push('export function getHeadshotUrl(playerId: string, playerName?: string): string | undefined {');
  lines.push('  return PLAYER_HEADSHOTS[playerId];');
  lines.push('}');
  lines.push('');
  lines.push('export function logMissingHeadshot(playerId: string, playerName: string): void {');
  lines.push('  if (PLAYER_HEADSHOTS[playerId] || loggedMissing.has(playerId)) return;');
  lines.push('  loggedMissing.add(playerId);');
  lines.push(
    "  console.warn(`[Trade Up] Missing ESPN headshot for ${playerName} (${playerId}) — using initials fallback.`);",
  );
  lines.push('}');
  lines.push('');

  fs.writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf8');

  console.log(`Headshots mapped: ${Object.keys(headshots).length} / ${gamePlayers.length}`);
  console.log(`Missing: ${missing.length}`);
  if (missing.length) {
    missing.slice(0, 30).forEach((m) => console.log(`  - ${m}`));
    if (missing.length > 30) console.log(`  ... and ${missing.length - 30} more`);
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
