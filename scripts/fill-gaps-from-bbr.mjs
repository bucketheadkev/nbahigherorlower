#!/usr/bin/env node
/**
 * Fill decade-DB gaps using Basketball-Reference team season pages
 * (game-weighted PPG/RPG/APG). Does NOT use 82-0 stats.
 *
 * Usage:
 *   node scripts/fill-gaps-from-bbr.mjs [--dry-run] [--only 1980s-missing-teams|priority|1960s]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DECADES_DIR = path.join(ROOT, 'data', 'decades');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const dryRun = process.argv.includes('--dry-run');
const only = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? process.argv[i + 1] : 'all';
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function round1(n) {
  return Math.round(n * 10) / 10;
}

function primaryPos(pos) {
  const p = String(pos || 'F').split('-')[0].trim().toUpperCase();
  if (['PG', 'SG', 'SF', 'PF', 'C'].includes(p)) return p;
  if (p === 'G') return 'SG';
  if (p === 'F') return 'SF';
  return 'SF';
}

function normalizeName(name) {
  return String(name)
    .replace(/\*+$/g, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[''ʼ.]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

/** Parse BBR team per-game table rows → {name,pos,g,ppg,rpg,apg}[] */
function parsePerGame(html) {
  const start = html.indexOf('id="per_game_stats"');
  if (start < 0) return [];
  const slice = html.slice(start, start + 200000);
  const end = slice.indexOf('</table>');
  const table = end > 0 ? slice.slice(0, end) : slice;
  const rows = [];
  const re =
    /data-stat="name_display"[^>]*>\s*(?:<a[^>]*>)?([^<]+)(?:<\/a>)?[\s\S]*?data-stat="pos"[^>]*>\s*([^<]*)[\s\S]*?data-stat="games"[^>]*>\s*(?:<strong>)?(\d+)/g;
  // More reliable: walk tr blocks
  const trs = table.split(/<tr[^>]*>/i).slice(1);
  for (const tr of trs) {
    if (/Team Totals/i.test(tr)) continue;
    const nameM = tr.match(
      /data-stat="name_display"[^>]*>\s*(?:<a[^>]*>)?([^<]+)/,
    );
    if (!nameM) continue;
    const name = nameM[1].trim();
    if (!name || /Team\/G|Lg Rank|Year\/Year|Opponent/i.test(name)) continue;
    const posM = tr.match(/data-stat="pos"[^>]*>\s*([^<]*)/);
    const gM = tr.match(/data-stat="games"[^>]*>\s*(?:<strong>)?(\d+)/);
    const ptsM = tr.match(/data-stat="pts_per_g"[^>]*>\s*(?:<strong>)?([\d.]+)/);
    const trbM = tr.match(/data-stat="trb_per_g"[^>]*>\s*(?:<strong>)?([\d.]+)/);
    const astM = tr.match(/data-stat="ast_per_g"[^>]*>\s*(?:<strong>)?([\d.]+)/);
    const g = Number(gM?.[1] || 0);
    if (!g) continue;
    rows.push({
      name,
      pos: primaryPos(posM?.[1] || 'F'),
      g,
      ppg: Number(ptsM?.[1] || 0),
      rpg: Number(trbM?.[1] || 0),
      apg: Number(astM?.[1] || 0),
    });
  }
  return rows;
}

/**
 * Aggregate BBR seasons for a franchise decade.
 * @param {{code:string, years:number[]}[]} seasons - BBR team code + ending years
 */
async function decadeTeamAverages(seasons, { minGp = 20, delayMs = 1600 } = {}) {
  /** @type {Map<string, {name:string,pos:string,gp:number,pts:number,reb:number,ast:number}>} */
  const acc = new Map();
  for (const { code, years } of seasons) {
    for (const year of years) {
      const url = `https://www.basketball-reference.com/teams/${code}/${year}.html`;
      process.stderr.write(`  fetch ${code} ${year}...\n`);
      try {
        const html = await fetchText(url);
        for (const row of parsePerGame(html)) {
          const key = normalizeName(row.name);
          if (!acc.has(key)) {
            acc.set(key, {
              name: row.name,
              pos: row.pos,
              gp: 0,
              pts: 0,
              reb: 0,
              ast: 0,
            });
          }
          const a = acc.get(key);
          a.gp += row.g;
          a.pts += row.ppg * row.g;
          a.reb += row.rpg * row.g;
          a.ast += row.apg * row.g;
          a.pos = row.pos || a.pos;
        }
      } catch (e) {
        process.stderr.write(`  skip ${code} ${year}: ${e.message}\n`);
      }
      await sleep(delayMs);
    }
  }
  return [...acc.values()]
    .filter((p) => p.gp >= minGp)
    .map((p) => ({
      name: p.name,
      pos: p.pos,
      ppg: round1(p.pts / p.gp),
      rpg: round1(p.reb / p.gp),
      apg: round1(p.ast / p.gp),
      gp: p.gp,
    }))
    .sort((a, b) => b.ppg - a.ppg || b.gp - a.gp);
}

function formatShortLine(p) {
  return `${p.name} | ${p.pos} | ${p.ppg.toFixed(1)} PPG | ${p.rpg.toFixed(1)} RPG | ${p.apg.toFixed(1)} APG`;
}

function formatLegacyLine(n, p, seasonsLabel) {
  return `${n}. ${p.name} | ${p.pos} | ${p.ppg.toFixed(1)} PPG | ${p.rpg.toFixed(1)} RPG | ${p.apg.toFixed(1)} APG | ${p.gp} GP | Seasons: ${seasonsLabel}`;
}

function readDecade(era) {
  return fs.readFileSync(path.join(DECADES_DIR, `${era}.txt`), 'utf8');
}

function writeDecade(era, text) {
  if (dryRun) {
    console.log(`[dry-run] would write ${era}.txt (${text.length} chars)`);
    return;
  }
  fs.writeFileSync(path.join(DECADES_DIR, `${era}.txt`), text);
}

/** Insert players under an existing ALL-CAPS header if missing. */
function upsertUnderHeader(text, header, players, { maxAdd = 40 } = {}) {
  const lines = text.split(/\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === header) {
      start = i;
      break;
    }
  }
  if (start < 0) return { text, added: [], missingHeader: true };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (
      t &&
      !t.includes('|') &&
      t === t.toUpperCase() &&
      /[A-Z]{3,}/.test(t) &&
      t.length < 80 &&
      !t.startsWith('=====')
    ) {
      end = i;
      break;
    }
  }

  const section = lines.slice(start, end).join('\n');
  const have = new Set();
  for (const line of lines.slice(start, end)) {
    const m = line.match(/^(.+?)\s*\|\s*[A-Z]{1,2}\s*\|/);
    if (m) have.add(normalizeName(m[1].replace(/^\d+\.\s*/, '')));
  }

  const added = [];
  const insertLines = [];
  for (const p of players) {
    if (added.length >= maxAdd) break;
    const key = normalizeName(p.name);
    if (have.has(key)) continue;
    have.add(key);
    added.push(p);
    insertLines.push(formatShortLine(p));
  }

  if (!insertLines.length) return { text, added: [] };

  // Append before next team / EOF, after last non-empty in section
  let insertAt = end;
  while (insertAt > start + 1 && !lines[insertAt - 1].trim()) insertAt--;
  const next = [
    ...lines.slice(0, insertAt),
    ...insertLines,
    ...lines.slice(insertAt),
  ];
  return { text: next.join('\n'), added, sectionPreview: section.slice(0, 80) };
}

/** Append a brand-new team block at end of file. */
function appendTeamBlock(text, header, players, { limit = 20 } = {}) {
  const haveCheck = normalizeName;
  // avoid dup header
  if (text.split(/\n/).some((l) => l.trim() === header)) {
    return upsertUnderHeader(text, header, players, { maxAdd: limit });
  }
  const body = players.slice(0, limit).map(formatShortLine).join('\n');
  const block = `\n${header}\n${body}\n`;
  return {
    text: text.replace(/\s*$/, '') + '\n' + block,
    added: players.slice(0, limit),
  };
}

/** Legacy-format insert under "Name (ABC) — N players" */
function upsertLegacyTeam(text, teamTitleRe, players, seasonsLabel) {
  const lines = text.split(/\n/);
  let start = -1;
  let headerLine = '';
  for (let i = 0; i < lines.length; i++) {
    if (teamTitleRe.test(lines[i])) {
      start = i;
      headerLine = lines[i];
      break;
    }
  }
  if (start < 0) return { text, added: [], missingHeader: true };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^.+ \([A-Z]{3}\) — \d+ players$/.test(lines[i].trim())) {
      end = i;
      // back up over ===== separators
      while (end > start && /^[=]+$/.test(lines[end - 1]?.trim() || '')) end--;
      break;
    }
  }

  const have = new Set();
  let maxN = 0;
  for (const line of lines.slice(start, end)) {
    const m = line.match(/^(\d+)\.\s+(.+?)\s*\|\s*[A-Z]/);
    if (m) {
      maxN = Math.max(maxN, Number(m[1]));
      have.add(normalizeName(m[2]));
    }
  }

  const added = [];
  const insertLines = [];
  for (const p of players) {
    const key = normalizeName(p.name);
    if (have.has(key)) continue;
    have.add(key);
    maxN += 1;
    added.push(p);
    insertLines.push(formatLegacyLine(maxN, p, seasonsLabel));
  }
  if (!added.length) return { text, added: [] };

  // Update claimed count in header if present
  const newHeader = headerLine.replace(
    /— \d+ players/,
    `— ${maxN} players`,
  );
  lines[start] = newHeader;

  let insertAt = end;
  while (insertAt > start + 1 && !lines[insertAt - 1].trim()) insertAt--;
  // if separator follows, keep it
  const next = [
    ...lines.slice(0, insertAt),
    ...insertLines,
    ...lines.slice(insertAt),
  ];
  return { text: next.join('\n'), added };
}

const YEARS_1980s = [1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989, 1990];

const JOBS_1980_MISSING_TEAMS = [
  {
    header: 'UTAH JAZZ',
    seasons: [{ code: 'UTA', years: YEARS_1980s }],
    limit: 20,
  },
  {
    header: 'WASHINGTON BULLETS',
    seasons: [{ code: 'WSB', years: YEARS_1980s }],
    limit: 20,
  },
  {
    header: 'CHARLOTTE HORNETS',
    // franchise began 1988-89
    seasons: [{ code: 'CHH', years: [1989, 1990] }],
    limit: 15,
  },
  {
    header: 'MIAMI HEAT',
    seasons: [{ code: 'MIA', years: [1989, 1990] }],
    limit: 15,
  },
];

/** High-value multi-team / truncated-list omissions — verified NBA careers. */
const PRIORITY_TEAM_SEASONS = [
  // 1980s depth / multi-team
  {
    era: '1980s',
    header: 'HOUSTON ROCKETS',
    seasons: [{ code: 'HOU', years: [1980, 1981, 1982] }], // Moses peak years on HOU early 80s — will merge into existing
    namesOnly: ['Moses Malone'],
  },
  {
    era: '1980s',
    header: 'GOLDEN STATE WARRIORS',
    seasons: [{ code: 'GSW', years: [1981, 1982] }],
    namesOnly: ['Bernard King'],
  },
  {
    era: '1980s',
    header: 'ATLANTA HAWKS',
    seasons: [{ code: 'ATL', years: [1989, 1990] }],
    namesOnly: ['Moses Malone'],
  },
  {
    era: '1980s',
    header: 'DALLAS MAVERICKS',
    seasons: [{ code: 'DAL', years: [1989, 1990] }],
    namesOnly: ['Adrian Dantley'],
  },
  {
    era: '1980s',
    header: 'DETROIT PISTONS',
    seasons: [{ code: 'DET', years: [1980, 1981] }],
    namesOnly: ['Bob Lanier', 'Bob McAdoo'],
  },
  {
    era: '1980s',
    header: 'SEATTLE SUPERSONICS',
    seasons: [{ code: 'SEA', years: [1980, 1981, 1982, 1983, 1984] }],
    namesOnly: ['Gus Williams'],
  },
  {
    era: '1980s',
    header: 'NEW JERSEY NETS',
    seasons: [{ code: 'NJN', years: [1980, 1981] }],
    namesOnly: ['Mike Newlin'],
  },
  // 1990s
  {
    era: '1990s',
    header: 'ATLANTA HAWKS',
    seasons: [{ code: 'ATL', years: [1991, 1992, 1993, 1994] }],
    namesOnly: ['Dominique Wilkins'],
  },
  {
    era: '1990s',
    header: 'LOS ANGELES CLIPPERS',
    seasons: [{ code: 'LAC', years: [1994] }],
    namesOnly: ['Dominique Wilkins'],
  },
  {
    era: '1990s',
    header: 'BOSTON CELTICS',
    seasons: [{ code: 'BOS', years: [1991, 1992] }],
    namesOnly: ['Larry Bird'],
  },
  {
    era: '1990s',
    header: 'PHILADELPHIA 76ERS',
    seasons: [{ code: 'PHI', years: [1991, 1992] }],
    namesOnly: ['Charles Barkley'],
  },
  {
    era: '1990s',
    header: 'WASHINGTON BULLETS / WIZARDS',
    seasons: [{ code: 'WSB', years: [1991, 1992, 1993] }],
    namesOnly: ['Bernard King', 'Jeff Malone'],
  },
  {
    era: '1990s',
    header: 'DENVER NUGGETS',
    seasons: [{ code: 'DEN', years: [1991, 1992, 1993, 1994] }],
    namesOnly: ['Orlando Woolridge', 'Michael Adams'],
  },
  {
    era: '1990s',
    header: 'SEATTLE SUPERSONICS',
    seasons: [{ code: 'SEA', years: [1991, 1992] }],
    namesOnly: ['Xavier McDaniel'],
  },
  {
    era: '1990s',
    header: 'MINNESOTA TIMBERWOLVES',
    seasons: [{ code: 'MIN', years: [1990, 1991, 1992] }],
    namesOnly: ['Tony Campbell'],
  },
  // 2000s
  {
    era: '2000s',
    header: 'UTAH JAZZ',
    seasons: [{ code: 'UTA', years: [2000, 2001, 2002, 2003] }],
    namesOnly: ['Karl Malone'],
  },
  {
    era: '2000s',
    header: 'NEW JERSEY NETS',
    seasons: [{ code: 'NJN', years: [2002, 2003] }],
    namesOnly: ['Stephon Marbury'],
  },
  {
    era: '2000s',
    header: 'PHOENIX SUNS',
    seasons: [{ code: 'PHO', years: [2001, 2002] }],
    namesOnly: ['Stephon Marbury'],
  },
  {
    era: '2000s',
    header: 'SEATTLE SUPERSONICS / OKLAHOMA CITY THUNDER',
    seasons: [{ code: 'SEA', years: [2000, 2001, 2002] }],
    namesOnly: ['Gary Payton'],
  },
  {
    era: '2000s',
    header: 'GOLDEN STATE WARRIORS',
    seasons: [{ code: 'GSW', years: [2001, 2002, 2003] }],
    namesOnly: ['Antawn Jamison'],
  },
  {
    era: '2000s',
    header: 'MILWAUKEE BUCKS',
    seasons: [{ code: 'MIL', years: [2000, 2001, 2002, 2003] }],
    namesOnly: ['Ray Allen', 'Glenn Robinson'],
  },
  {
    era: '2000s',
    header: 'CHICAGO BULLS',
    seasons: [{ code: 'CHI', years: [2000, 2001, 2002] }],
    namesOnly: ['Jalen Rose'],
  },
  {
    era: '2000s',
    header: 'WASHINGTON WIZARDS',
    seasons: [{ code: 'WAS', years: [2002, 2003] }],
    namesOnly: ['Michael Jordan'],
  },
  {
    era: '2000s',
    header: 'LOS ANGELES CLIPPERS',
    seasons: [{ code: 'LAC', years: [2008, 2009] }],
    namesOnly: ['Zach Randolph'],
  },
  {
    era: '2000s',
    header: 'ATLANTA HAWKS',
    seasons: [{ code: 'ATL', years: [2003, 2004] }],
    namesOnly: ['Glenn Robinson', 'Antoine Walker'],
  },
  {
    era: '2000s',
    header: 'NEW YORK KNICKS',
    seasons: [{ code: 'NYK', years: [2009] }],
    namesOnly: ['Al Harrington'],
  },
  {
    era: '2000s',
    header: 'MEMPHIS GRIZZLIES',
    seasons: [{ code: 'MEM', years: [2002, 2003, 2004, 2005, 2006] }],
    namesOnly: ['Shareef Abdur-Rahim'],
  },
  {
    era: '2000s',
    header: 'CHARLOTTE BOBCATS',
    seasons: [{ code: 'CHA', years: [2005, 2006] }],
    namesOnly: ['Jamal Mashburn'],
  },
  // 2010s
  {
    era: '2010s',
    header: 'NEW ORLEANS PELICANS',
    seasons: [{ code: 'NOP', years: [2019] }],
    namesOnly: ['Julius Randle'],
  },
  {
    era: '2010s',
    header: 'HOUSTON ROCKETS',
    seasons: [{ code: 'HOU', years: [2010, 2011, 2012] }],
    namesOnly: ['Kevin Martin'],
  },
  {
    era: '2010s',
    header: 'WASHINGTON WIZARDS',
    seasons: [{ code: 'WAS', years: [2010, 2011, 2012, 2013, 2014] }],
    namesOnly: ['Antawn Jamison'],
  },
];

const JOBS_1960s = [
  {
    // St. Louis Hawks early 60s → ATL franchise
    teamRe: /^Hawks \(ATL\)/,
    seasons: [
      { code: 'STL', years: [1960] }, // Chuck Share / Vern Hatton / Dave Gambee era remnants
    ],
    namesOnly: ['Chuck Share', 'Dave Gambee', 'Vern Hatton'],
    seasonsLabel: '1960',
  },
  {
    teamRe: /^Lakers \(LAL\)/,
    // Minneapolis 1959-60 + LA 1960-61
    seasons: [
      { code: 'MNL', years: [1960] },
      { code: 'LAL', years: [1961] },
    ],
    namesOnly: ['Larry Foust'],
    seasonsLabel: '1960-1961',
  },
  {
    teamRe: /^Hawks \(ATL\)/,
    seasons: [{ code: 'STL', years: [1962] }],
    namesOnly: ['Vern Hatton'],
    seasonsLabel: '1962',
  },
];

async function run1980MissingTeams() {
  console.log('\n=== 1980s missing teams (BBR) ===');
  let text = readDecade('1980s');
  const log = [];
  for (const job of JOBS_1980_MISSING_TEAMS) {
    console.log(`\nBuilding ${job.header}...`);
    const players = await decadeTeamAverages(job.seasons, { minGp: 15 });
    const { text: next, added } = appendTeamBlock(text, job.header, players, {
      limit: job.limit,
    });
    text = next;
    log.push({ header: job.header, added: added.map((p) => p.name) });
    console.log(`  added ${added.length}: ${added.map((p) => p.name).join(', ')}`);
  }
  writeDecade('1980s', text);
  return log;
}

async function runPriority() {
  console.log('\n=== Priority multi-team fills (BBR) ===');
  const byEra = {};
  for (const job of PRIORITY_TEAM_SEASONS) {
    if (!byEra[job.era]) byEra[job.era] = readDecade(job.era);
    console.log(`\n${job.era} ${job.header} ← ${job.namesOnly.join(', ')}`);
    const players = await decadeTeamAverages(job.seasons, { minGp: 10 });
    const want = new Set(job.namesOnly.map(normalizeName));
    const filtered = players.filter((p) => want.has(normalizeName(p.name)));
    // If name filter empty (typo), skip
    if (!filtered.length) {
      console.log('  no BBR rows matched namesOnly');
      continue;
    }
    const { text, added, missingHeader } = upsertUnderHeader(
      byEra[job.era],
      job.header,
      filtered,
      { maxAdd: 10 },
    );
    if (missingHeader) {
      console.log(`  MISSING HEADER: ${job.header}`);
      continue;
    }
    byEra[job.era] = text;
    console.log(
      `  added ${added.length}: ${added.map((p) => `${p.name} ${p.ppg}/${p.rpg}/${p.apg}`).join('; ') || '(already present)'}`,
    );
  }
  for (const era of Object.keys(byEra)) writeDecade(era, byEra[era]);
}

async function run1960s() {
  console.log('\n=== 1960s small gaps (BBR) ===');
  let text = readDecade('1960s');
  for (const job of JOBS_1960s) {
    console.log(`\n${job.teamRe}`);
    const players = await decadeTeamAverages(job.seasons, { minGp: 1 });
    const want = new Set(job.namesOnly.map(normalizeName));
    const filtered = players.filter((p) => want.has(normalizeName(p.name)));
    const { text: next, added, missingHeader } = upsertLegacyTeam(
      text,
      job.teamRe,
      filtered,
      job.seasonsLabel,
    );
    text = next;
    console.log(
      missingHeader
        ? '  missing header'
        : `  added ${added.length}: ${added.map((p) => p.name).join(', ') || '(none)'}`,
    );
  }
  // Bubbles Hawkins alias: ensure Robert Hawkins stays; gap checker alias handles match
  writeDecade('1960s', text);
}

async function fix1970sBubblesAlias() {
  // Rename display to include Bubbles so humans see it; gap alias maps both
  let text = readDecade('1970s');
  const before = text;
  text = text.replace(
    /^(\d+\.\s+)Robert Hawkins(\s*\|\s*SG\b)/m,
    '$1Robert "Bubbles" Hawkins$2',
  );
  // Also GSW line if any
  text = text.replace(
    /^(\d+\.\s+)Robert Hawkins(\s*\|\s*)/gm,
    '$1Robert "Bubbles" Hawkins$2',
  );
  if (text !== before) {
    writeDecade('1970s', text);
    console.log('Updated Robert Hawkins → Robert "Bubbles" Hawkins in 1970s');
  }
}

async function main() {
  console.log(dryRun ? 'DRY RUN' : 'APPLYING EDITS', 'only=', only);
  if (only === 'all' || only === '1960s') {
    await run1960s();
    await fix1970sBubblesAlias();
  }
  if (only === 'all' || only === '1980s-missing-teams') {
    await run1980MissingTeams();
  }
  if (only === 'all' || only === 'priority') {
    await runPriority();
  }
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
