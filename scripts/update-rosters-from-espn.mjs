/**
 * Fetches live ESPN NBA rosters and regenerates lib/tradeup/rosters.ts
 * ESPN is the only data source for roster membership.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ROSTERS_PATH = path.join(ROOT, 'lib/tradeup/rosters.ts');
const SEED_PATH = path.join(ROOT, 'scripts/rosters.seed.txt');
const EXTRA_SOURCES = [SEED_PATH, path.join(ROOT, 'lib/tradeup/rosters.ts.bak')];

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

const POS_MAP = {
  G: 'PG',
  PG: 'PG',
  SG: 'SG',
  GF: 'SG',
  F: 'SF',
  SF: 'SF',
  PF: 'PF',
  FC: 'PF',
  C: 'C',
};

function normalizeName(name) {
  return name
    .replace(/\s+\d+\s*$/, '')
    .trim()
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/\s+/g, ' ');
}

function parseSalary(raw) {
  if (!raw || raw === '--') return 0;
  const n = Number(String(raw).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function mapPosition(pos) {
  const key = (pos || 'F').trim().toUpperCase();
  if (key.includes('/')) {
    const first = key.split('/')[0];
    return POS_MAP[first] ?? 'SF';
  }
  return POS_MAP[key] ?? 'SF';
}

function decodeHtml(text) {
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'");
}

function parseRosterHtml(html) {
  const players = [];
  const rows = [...html.matchAll(/<tr class="Table__TR[^"]*" data-idx="\d+"([\s\S]*?)<\/tr>/g)];

  for (const row of rows) {
    const chunk = row[0];
    const idMatch = chunk.match(/player\/_\/id\/(\d+)\//);
    if (!idMatch) continue;

    const cells = [...chunk.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      decodeHtml(c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
    );
    if (cells.length < 8) continue;

    const name = cells[1].replace(/\s+\d+\s*$/, '').trim();
    const position = mapPosition(cells[2]);
    const age = Number(cells[3]);
    const salary = parseSalary(cells[7]);

    players.push({
      espnId: idMatch[1],
      name,
      position,
      age: Number.isFinite(age) ? age : 25,
      salary,
    });
  }

  return players;
}

function rankPlayers(players) {
  return [...players].sort((a, b) => {
    if (b.salary !== a.salary) return b.salary - a.salary;
    return a.age - b.age;
  });
}

function isEstimatedEntry(entry) {
  const { ppg, rpg, apg } = entry.stats;
  const expectedPpg = Math.round(entry.tradeValue * 0.28 * 10) / 10;
  return ppg === expectedPpg && rpg === Math.round(entry.tradeValue * 0.12 * 10) / 10;
}

function pickBestExisting(matches) {
  if (!matches.length) return null;
  return [...matches].sort((a, b) => {
    if (a.isFranchise !== b.isFranchise) return a.isFranchise ? -1 : 1;
    const aEst = isEstimatedEntry(a) ? 1 : 0;
    const bEst = isEstimatedEntry(b) ? 1 : 0;
    if (aEst !== bEst) return aEst - bEst;
    if (b.tradeValue !== a.tradeValue) return b.tradeValue - a.tradeValue;
    return a.id.length - b.id.length;
  })[0];
}

function baseSlug(name) {
  const suffixMatch = name.match(/\s+(Jr\.|Sr\.|II|III|IV)$/i);
  const suffix = suffixMatch ? suffixMatch[1].replace('.', '').toLowerCase() : '';
  const cleaned = name
    .replace(/['.]/g, '')
    .replace(/\s+(Jr|Sr|II|III|IV)$/i, '')
    .trim()
    .split(/\s+/);
  const last = cleaned[cleaned.length - 1]?.toLowerCase() ?? 'player';
  const first = cleaned[0]?.toLowerCase() ?? '';
  if (suffix === 'jr') return `${last}_jr`;
  if (suffix === 'iii') return `${last}_iii`;
  if (suffix === 'ii') return `${last}_ii`;
  if (suffix === 'sr') return `${last}_sr`;
  if (cleaned.length > 1 && first !== last) return `${first}_${last}`;
  return last;
}

function assignId(name, teamId, espnId, usedIds, existing) {
  if (existing?.id && !usedIds.has(existing.id)) return existing.id;

  const candidates = [
    baseSlug(name),
    `${baseSlug(name)}_${teamId.toLowerCase()}`,
    `espn_${espnId}`,
  ];

  for (const c of candidates) {
    if (!usedIds.has(c)) return c;
  }

  return `espn_${espnId}`;
}

function parseExistingRosters(source) {
  const byName = new Map();
  const byId = new Map();
  const entryRegex =
    /p\('([^']+)',\s*'((?:\\'|[^'])*)',\s*'([^']+)',\s*'([^']+)',\s*(\d+),\s*\{\s*ppg:\s*([\d.]+),\s*rpg:\s*([\d.]+),\s*apg:\s*([\d.]+),\s*spg:\s*([\d.]+),\s*bpg:\s*([\d.]+)\s*\},\s*(\d+),\s*(true|false)(?:,\s*(true|false))?\)/g;

  let m;
  while ((m = entryRegex.exec(source)) !== null) {
    const entry = {
      id: m[1],
      name: m[2].replace(/\\'/g, "'"),
      teamId: m[3],
      position: m[4],
      age: Number(m[5]),
      stats: {
        ppg: Number(m[6]),
        rpg: Number(m[7]),
        apg: Number(m[8]),
        spg: Number(m[9]),
        bpg: Number(m[10]),
      },
      tradeValue: Number(m[11]),
      isStarter: m[12] === 'true',
      isFranchise: m[13] === 'true',
    };
    byId.set(entry.id, entry);
    const key = normalizeName(entry.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(entry);
  }
  return { byName, byId };
}

function loadExistingPool() {
  const sources = [ROSTERS_PATH, ...EXTRA_SOURCES.filter((p) => fs.existsSync(p))];
  const byName = new Map();
  const byId = new Map();

  for (const sourcePath of sources) {
    const { byName: parsedName, byId: parsedId } = parseExistingRosters(
      fs.readFileSync(sourcePath, 'utf8'),
    );
    for (const [id, entry] of parsedId) {
      if (!byId.has(id)) byId.set(id, entry);
    }
    for (const [name, entries] of parsedName) {
      if (!byName.has(name)) byName.set(name, []);
      for (const entry of entries) {
        if (!byName.get(name).some((e) => e.id === entry.id)) {
          byName.get(name).push(entry);
        }
      }
    }
  }

  return { byName, byId };
}

function estimateTradeValue(rank, salary, existingValue) {
  if (existingValue != null) return existingValue;
  const salaryBoost = salary > 30_000_000 ? 15 : salary > 20_000_000 ? 10 : salary > 10_000_000 ? 6 : salary > 5_000_000 ? 3 : 0;
  const base = Math.round(70 - rank * 4.5 + salaryBoost);
  return Math.max(22, Math.min(96, base));
}

function estimateStats(tradeValue) {
  return {
    ppg: Math.round(tradeValue * 0.28 * 10) / 10,
    rpg: Math.round(tradeValue * 0.12 * 10) / 10,
    apg: Math.round(tradeValue * 0.08 * 10) / 10,
    spg: Math.round(tradeValue * 0.018 * 10) / 10,
    bpg: Math.round(tradeValue * 0.02 * 10) / 10,
  };
}

function escapeName(name) {
  return name.replace(/'/g, "\\'");
}

function formatPlayer(p) {
  const franchise = p.isFranchise ? ', true' : '';
  return `  p('${p.id}', '${escapeName(p.name)}', '${p.teamId}', '${p.position}', ${p.age}, { ppg: ${p.stats.ppg}, rpg: ${p.stats.rpg}, apg: ${p.stats.apg}, spg: ${p.stats.spg}, bpg: ${p.stats.bpg} }, ${p.tradeValue}, ${p.isStarter}${franchise}),`;
}

async function fetchRoster(team) {
  const slug = team.name.toLowerCase().replace(/\s+/g, '-');
  const url = `https://www.espn.com/nba/team/roster/_/name/${team.slug}/${slug}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'text/html',
    },
  });
  if (!res.ok) throw new Error(`ESPN ${team.id}: HTTP ${res.status}`);
  const html = await res.text();
  const players = parseRosterHtml(html);
  if (players.length < 10) throw new Error(`ESPN ${team.id}: only ${players.length} players parsed`);
  return players;
}

async function main() {
  const { byName, byId } = loadExistingPool();

  const summary = {
    teamsUpdated: 0,
    playersUpdated: 0,
    playersAdded: 0,
    playersRemoved: 0,
    duplicatesFound: [],
    missingPortraits: [],
  };

  const allNewPlayers = [];
  const usedIds = new Set();
  const playerTeamMap = new Map();

  for (const team of TEAMS) {
    const roster = await fetchRoster(team);
    await new Promise((r) => setTimeout(r, 250));

    const ranked = rankPlayers(roster).slice(0, 10);
    summary.teamsUpdated++;

    ranked.forEach((espnPlayer, index) => {
      const norm = normalizeName(espnPlayer.name);
      const matches = byName.get(norm) ?? [];
      const existing = pickBestExisting(matches);

      const id = assignId(espnPlayer.name, team.id, espnPlayer.espnId, usedIds, existing);
      if (usedIds.has(id)) {
        summary.duplicatesFound.push(`resolved via espn id: ${espnPlayer.name} -> ${id}`);
      }
      usedIds.add(id);

      if (playerTeamMap.has(norm)) {
        summary.duplicatesFound.push(`${espnPlayer.name} on multiple teams: ${playerTeamMap.get(norm)} and ${team.id}`);
      }
      playerTeamMap.set(norm, team.id);

      const isNew = !existing;
      let stats;
      let tradeValue;
      let isFranchise = false;

      if (existing) {
        if (existing.teamId !== team.id) summary.playersUpdated++;
        stats = existing.stats;
        tradeValue = existing.tradeValue;
        isFranchise = !!existing.isFranchise;
      } else {
        tradeValue = estimateTradeValue(index, espnPlayer.salary, null);
        stats = estimateStats(tradeValue);
        summary.playersAdded++;
        summary.missingPortraits.push(`${espnPlayer.name} (${id})`);
      }

      allNewPlayers.push({
        id,
        name: espnPlayer.name,
        teamId: team.id,
        position: espnPlayer.position,
        age: espnPlayer.age,
        stats,
        tradeValue,
        isStarter: index < 5,
        isFranchise,
      });
    });
  }

  const oldIds = new Set([...byId.keys()]);
  const newIds = new Set(allNewPlayers.map((p) => p.id));
  for (const id of oldIds) {
    if (!newIds.has(id)) summary.playersRemoved++;
  }

  const lines = [];
  lines.push("import type { Position, PlayerStats, TradePlayer } from './types';");
  lines.push('');
  lines.push('function p(');
  lines.push('  id: string,');
  lines.push('  name: string,');
  lines.push('  teamId: string,');
  lines.push('  position: Position,');
  lines.push('  age: number,');
  lines.push('  stats: PlayerStats,');
  lines.push('  tradeValue: number,');
  lines.push('  isStarter: boolean,');
  lines.push('  isFranchise = false,');
  lines.push('): TradePlayer {');
  lines.push('  return { id, name, teamId, position, age, stats, tradeValue, isStarter, isFranchise };');
  lines.push('}');
  lines.push('');
  lines.push('export const ROSTER: TradePlayer[] = [');

  for (const team of TEAMS) {
    lines.push(`  // ${team.name}`);
    const players = allNewPlayers.filter((p) => p.teamId === team.id);
    for (const pl of players) lines.push(formatPlayer(pl));
    lines.push('');
  }

  lines.push('];');
  lines.push('');
  lines.push('export const ALL_PLAYERS: TradePlayer[] = ROSTER;');
  lines.push('');
  lines.push('const TRADE_POOL_MIN_VALUE = 22;');
  lines.push('');
  lines.push('export function getPlayersByTeam(teamId: string): TradePlayer[] {');
  lines.push('  return ALL_PLAYERS.filter((pl) => pl.teamId === teamId);');
  lines.push('}');
  lines.push('');
  lines.push('export function getTeamTradePool(teamId: string): TradePlayer[] {');
  lines.push('  const roster = getPlayersByTeam(teamId);');
  lines.push('  const starters = roster');
  lines.push('    .filter((pl) => pl.isStarter)');
  lines.push('    .sort((a, b) => b.tradeValue - a.tradeValue)');
  lines.push('    .slice(0, 5);');
  lines.push('');
  lines.push('  const starterIds = new Set(starters.map((pl) => pl.id));');
  lines.push('  const rotation = roster');
  lines.push('    .filter((pl) => !starterIds.has(pl.id) && pl.tradeValue >= TRADE_POOL_MIN_VALUE)');
  lines.push('    .sort((a, b) => b.tradeValue - a.tradeValue);');
  lines.push('');
  lines.push('  let bench = rotation.slice(0, 5);');
  lines.push('  if (starters.length + bench.length < 10) {');
  lines.push('    const extra = roster');
  lines.push('      .filter((pl) => !starterIds.has(pl.id) && !bench.some((b) => b.id === pl.id))');
  lines.push('      .sort((a, b) => b.tradeValue - a.tradeValue);');
  lines.push('    bench = [...bench, ...extra].slice(0, 10 - starters.length);');
  lines.push('  }');
  lines.push('');
  lines.push('  return [...starters, ...bench].slice(0, 10);');
  lines.push('}');
  lines.push('');
  lines.push('export function getPlayerById(id: string): TradePlayer | undefined {');
  lines.push('  return ALL_PLAYERS.find((pl) => pl.id === id);');
  lines.push('}');
  lines.push('');
  lines.push('export function getLowValueStarters(): TradePlayer[] {');
  lines.push('  return ALL_PLAYERS.filter((pl) => pl.tradeValue >= 18 && pl.tradeValue <= 32);');
  lines.push('}');
  lines.push('');

  fs.writeFileSync(ROSTERS_PATH, lines.join('\n'), 'utf8');

  console.log('\n=== ESPN Roster Update Summary ===');
  console.log(`Teams updated: ${summary.teamsUpdated}`);
  console.log(`Players updated (team moves): ${summary.playersUpdated}`);
  console.log(`New players added: ${summary.playersAdded}`);
  console.log(`Players removed: ${summary.playersRemoved}`);
  console.log(`Duplicate issues: ${summary.duplicatesFound.length}`);
  summary.duplicatesFound.forEach((d) => console.log(`  - ${d}`));
  console.log(`Missing portrait assets (initials fallback): ${summary.missingPortraits.length}`);
  summary.missingPortraits.slice(0, 25).forEach((m) => console.log(`  - ${m}`));
  if (summary.missingPortraits.length > 25) {
    console.log(`  ... and ${summary.missingPortraits.length - 25} more`);
  }

  const teamCounts = {};
  for (const p of allNewPlayers) teamCounts[p.teamId] = (teamCounts[p.teamId] ?? 0) + 1;
  const bad = Object.entries(teamCounts).filter(([, c]) => c !== 10);
  if (bad.length) {
    console.error('VALIDATION FAILED - team counts:', bad);
    process.exit(1);
  }
  if (allNewPlayers.length !== 300) {
    console.error(`VALIDATION FAILED - total ${allNewPlayers.length}, expected 300`);
    process.exit(1);
  }
  const ids = new Set();
  for (const p of allNewPlayers) {
    if (ids.has(p.id)) {
      console.error(`VALIDATION FAILED - duplicate id ${p.id}`);
      process.exit(1);
    }
    ids.add(p.id);
  }
  console.log(`Total players: ${allNewPlayers.length} (30 teams x 10)`);
  console.log('Validation: PASSED');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
