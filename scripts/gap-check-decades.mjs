#!/usr/bin/env node
/**
 * Gap-check our decade DBs against 82-0 team×era player *names* only.
 * Does not import their stats. Fetches players_flat.json to a temp path (or --from).
 *
 * Usage:
 *   node scripts/gap-check-decades.mjs [--from /tmp/820_players_flat.json] [--out data/decades/gap-report.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DECADES_DIR = path.join(ROOT, 'data', 'decades');
const ERAS = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
const REF_URL = 'https://www.82-0.com/players_flat.json';

const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
}
const fromPath = argVal('--from', '/tmp/820_players_flat.json');
const outPath = argVal('--out', path.join(DECADES_DIR, 'gap-report.json'));

/** Same franchise mapping as build-decade-rosters.mjs */
const HEADER_TO_TEAM = [
  [/hawks|\batl\b/i, 'ATL'],
  [/celtics|\bbos\b/i, 'BOS'],
  [/brooklyn nets|new jersey nets|\bnets\b|\bbkn\b|\bnjn\b/i, 'BKN'],
  [/charlotte|bobcats|\bcha\b/i, 'CHA'],
  [/bulls|\bchi\b/i, 'CHI'],
  [/cavaliers|\bcle\b/i, 'CLE'],
  [/pistons|\bdet\b/i, 'DET'],
  [/pacers|\bind\b/i, 'IND'],
  [/heat|\bmia\b/i, 'MIA'],
  [/bucks|\bmil\b/i, 'MIL'],
  [/knicks|\bnyk\b/i, 'NYK'],
  [/magic|\borl\b/i, 'ORL'],
  [/76ers|sixers|\bphi\b/i, 'PHI'],
  [/raptors|\btor\b/i, 'TOR'],
  [/wizards|bullets|\bwas\b/i, 'WAS'],
  [/mavericks|\bdal\b/i, 'DAL'],
  [/nuggets|\bden\b/i, 'DEN'],
  [/warriors|\bgsw\b/i, 'GSW'],
  [/rockets|\bhou\b/i, 'HOU'],
  [/clippers|braves|\blac\b/i, 'LAC'],
  [/lakers|\blal\b/i, 'LAL'],
  [/grizzlies|vancouver|\bmem\b/i, 'MEM'],
  [/timberwolves|\bmin\b/i, 'MIN'],
  [/pelicans|new orleans|\bnop\b|\bnoh\b/i, 'NOP'],
  [/thunder|supersonics|super.?sonics|\bokc\b|\bsea\b/i, 'OKC'],
  [/suns|\bphx\b|\bpho\b/i, 'PHX'],
  [/trail\s*blazers|blazers|\bpor\b/i, 'POR'],
  [/kings|royals|kansas city|\bsac\b/i, 'SAC'],
  [/spurs|\bsas\b/i, 'SAS'],
  [/jazz|\buta\b/i, 'UTA'],
];

const legacyTeamRe = /^(.+?) \(([A-Z]{3})\) — \d+ players$/;
const legacyPlayerRe =
  /^\d+\.\s+(.+?)\s*\|\s*([A-Z]{1,2})\s*\|\s*([\d.]+)\s*PPG\s*\|\s*([\d.]+)\s*RPG\s*\|\s*([\d.]+)\s*(APG|BPG)/i;
const modernPlayerRe =
  /^(.+?)\s*\|\s*([A-Z]{1,2})\s*\|\s*([\d.]+)\s*PPG\s*\|\s*([\d.]+)\s*RPG\s*\|\s*([\d.]+)\s*(APG|BPG)/i;

/** Common display variants → canonical compare key pieces */
const ALIAS_TO = new Map([
  ['pj tucker', 'p.j. tucker'],
  ['p j tucker', 'p.j. tucker'],
  ['cj mccollum', 'c.j. mccollum'],
  ['c j mccollum', 'c.j. mccollum'],
  ['aj green', 'a.j. green'],
  ['rj barrett', 'r.j. barrett'],
  ['tj mcconnell', 't.j. mcconnell'],
  ['tj warren', 't.j. warren'],
  ['og anunoby', 'o.g. anunoby'],
  ['deaaron fox', "de'aaron fox"],
  ['deandre ayton', "deandre' ayton"],
  ['deandre jordan', "deandré jordan"],
  ['dennis schroder', 'dennis schröder'],
  ['nikola jokic', 'nikola jokić'],
  ['luka doncic', 'luka dončić'],
  ['kristaps porzingis', 'kristaps porziņģis'],
  ['jonas valanciunas', 'jonas valančiūnas'],
  ['bogdan bogdanovic', 'bogdan bogdanović'],
  ['bojan bogdanovic', 'bojan bogdanović'],
  ['goran dragic', 'goran dragić'],
  ['jusuf nurkic', 'jusuf nurkić'],
  ['vlatko cancar', 'vlatko čančar'],
  ['nicolas batum', 'nicolas batum'],
  ['nene', 'nenê'],
  ['nene hilario', 'nenê'],
  ['world b free', 'world b. free'],
  ['lloyd free', 'world b. free'],
  ['metta world peace', 'ron artest'],
  ['ron artest', 'ron artest'],
  ['metta sandiford-artest', 'ron artest'],
  ['penny hardaway', "anfernee hardaway"],
  ['manu ginobili', 'manu ginóbili'],
  ['pau gasol', 'pau gasol'],
  ['marc gasol', 'marc gasol'],
  ['peja stojakovic', 'peja stojaković'],
  ['tony kukoc', 'toni kukoč'],
  ['toni kukoc', 'toni kukoč'],
  ['drazen petrovic', 'dražen petrović'],
  ['vlade divac', 'vlade divac'],
  ['arvidas sabonis', 'arvydas sabonis'],
  ['arvydas sabonis', 'arvydas sabonis'],
  ['hakeem olajuwon', 'hakeem olajuwon'],
  ['akeem olajuwon', 'hakeem olajuwon'],
  ['ron harper', 'ron harper'],
  ['michael ray richardson', 'micheal ray richardson'],
  ['micheal ray richardson', 'micheal ray richardson'],
  ['hot rod hundley', 'hot rod hundley'],
  ['kareem abdul jabbar', 'kareem abdul-jabbar'],
  ['lew alcindor', 'kareem abdul-jabbar'],
  ['mahmoud abdul rauf', 'mahmoud abdul-rauf'],
  ['chris jackson', 'mahmoud abdul-rauf'],
  ['quitin dailey', 'quintin dailey'],
  ['quentin dailey', 'quintin dailey'],
  ['richard hamilton', 'richard hamilton'],
  ['rip hamilton', 'richard hamilton'],
  ['bubbles hawkins', 'robert hawkins'],
  ['robert bubbles hawkins', 'robert hawkins'],
  ['robert "bubbles" hawkins', 'robert hawkins'],
  ['steph curry', 'stephen curry'],
  ['steve nash', 'steve nash'],
  ['shaq', "shaquille o'neal"],
  ["shaquille o'neal", "shaquille o'neal"],
  ['shaquille oneal', "shaquille o'neal"],
  ['pj brown', 'p.j. brown'],
  ['aj price', 'a.j. price'],
  ['jj redick', 'j.j. redick'],
  ['jj barea', 'j.j. barea'],
  ['dj augustin', 'd.j. augustin'],
  ['cj miles', 'c.j. miles'],
  ['tj ford', 't.j. ford'],
  ['jr smith', 'j.r. smith'],
  ['j r smith', 'j.r. smith'],
]);

function mapHeaderToTeamId(header) {
  const legacy = header.match(legacyTeamRe);
  if (legacy) {
    const abbr = legacy[2];
    if (abbr === 'PHO') return 'PHX';
    if (abbr === 'NJN') return 'BKN';
    if (abbr === 'SEA') return 'OKC';
    if (abbr === 'NOH' || abbr === 'NOK') return 'NOP';
    if (abbr === 'CHH' || abbr === 'CHO') return 'CHA';
    if (abbr === 'VAN') return 'MEM';
    return abbr;
  }
  for (const [re, id] of HEADER_TO_TEAM) {
    if (re.test(header)) return id;
  }
  return null;
}

function isTeamHeader(line) {
  const t = line.trim();
  if (!t || t.includes('|') || t.startsWith('=====')) return false;
  if (/^\d+\.\s/.test(t)) return false;
  if (/^NBA |Coverage:|Stats |Format:|Relocated|^\d{4}s/i.test(t)) return false;
  if (legacyTeamRe.test(t)) return true;
  if (t === t.toUpperCase() && /[A-Z]{3,}/.test(t) && t.length < 80) return true;
  return false;
}

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

function normalizeName(name) {
  let s = String(name || '')
    .replace(/\*+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  s = stripDiacritics(s);
  s = s
    .replace(/[''ʼ]/g, "'")
    .replace(/\./g, '')
    .replace(/,/g, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  // drop generational suffixes for matching
  s = s.replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '').trim();
  const aliased = ALIAS_TO.get(s) || ALIAS_TO.get(s.replace(/'/g, ''));
  if (aliased) {
    s = stripDiacritics(aliased)
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/[''ʼ]/g, "'")
      .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
      .trim();
  }
  // collapse "p j" style initials already handled; also "pj " → keep
  s = s.replace(/\s+/g, ' ');
  return s;
}

function parseOurDecade(era) {
  const filePath = path.join(DECADES_DIR, `${era}.txt`);
  const text = fs.readFileSync(filePath, 'utf8');
  /** @type {Record<string, Map<string, {name:string,pos:string,ppg:number,line:string}>>} */
  const byTeam = {};
  let currentTeam = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('=====')) continue;
    if (isTeamHeader(line)) {
      currentTeam = mapHeaderToTeamId(line);
      continue;
    }
    if (!currentTeam) continue;
    const m = line.match(legacyPlayerRe) || line.match(modernPlayerRe);
    if (!m) continue;
    const name = m[1].replace(/\*+$/, '').trim();
    const key = normalizeName(name);
    if (!byTeam[currentTeam]) byTeam[currentTeam] = new Map();
    if (!byTeam[currentTeam].has(key)) {
      byTeam[currentTeam].set(key, {
        name,
        pos: m[2],
        ppg: Number(m[3]),
        line,
      });
    }
  }
  return byTeam;
}

async function loadRef() {
  if (fs.existsSync(fromPath)) {
    return JSON.parse(fs.readFileSync(fromPath, 'utf8'));
  }
  const res = await fetch(REF_URL, {
    headers: { 'User-Agent': 'nba-perfect-run-gap-check/1.0' },
  });
  if (!res.ok) throw new Error(`Failed to fetch ref: ${res.status}`);
  const data = await res.json();
  fs.writeFileSync(fromPath, JSON.stringify(data));
  return data;
}

function buildRefIndex(rows) {
  /** @type {Record<string, Record<string, Map<string, object>>>} */
  const idx = {};
  for (const row of rows) {
    if (!ERAS.includes(row.era)) continue;
    const team = row.team;
    const key = normalizeName(row.player);
    if (!idx[row.era]) idx[row.era] = {};
    if (!idx[row.era][team]) idx[row.era][team] = new Map();
    if (!idx[row.era][team].has(key)) {
      idx[row.era][team].set(key, row);
    }
  }
  return idx;
}

function mainSummary(missing, extra, matched) {
  const byEra = {};
  for (const era of ERAS) {
    const m = missing.filter((x) => x.era === era);
    const e = extra.filter((x) => x.era === era);
    byEra[era] = {
      missing: m.length,
      extra: e.length,
      matched: matched[era] || 0,
      missingByTeam: {},
    };
    for (const row of m) {
      byEra[era].missingByTeam[row.team] =
        (byEra[era].missingByTeam[row.team] || 0) + 1;
    }
  }
  return byEra;
}

const our = Object.fromEntries(ERAS.map((e) => [e, parseOurDecade(e)]));
const refRows = await loadRef();
const ref = buildRefIndex(refRows);

const missing = [];
const extra = [];
const matched = Object.fromEntries(ERAS.map((e) => [e, 0]));
const nameMismatchHints = [];

for (const era of ERAS) {
  const refTeams = ref[era] || {};
  const ourTeams = our[era] || {};
  const allTeams = new Set([...Object.keys(refTeams), ...Object.keys(ourTeams)]);

  for (const team of [...allTeams].sort()) {
    const rMap = refTeams[team] || new Map();
    const oMap = ourTeams[team] || new Map();

    for (const [key, row] of rMap) {
      if (oMap.has(key)) {
        matched[era]++;
        continue;
      }
      // hint: same last name elsewhere on our roster?
      const last = key.split(' ').at(-1);
      const near = [...oMap.entries()]
        .filter(([k]) => k.split(' ').at(-1) === last)
        .map(([, p]) => p.name)
        .slice(0, 3);
      missing.push({
        era,
        team,
        name: row.player,
        pos: row.pos,
        positions: row.positions,
        // Reference averages shown for triage only — do not copy into DBs.
        refPpg: row.ppg,
        refRpg: row.rpg,
        refApg: row.apg,
        nearNamesOnOurRoster: near,
      });
      if (near.length) {
        nameMismatchHints.push({
          era,
          team,
          refName: row.player,
          ourCandidates: near,
        });
      }
    }

    for (const [key, row] of oMap) {
      if (rMap.has(key)) continue;
      extra.push({
        era,
        team,
        name: row.name,
        pos: row.pos,
        ppg: row.ppg,
      });
    }
  }
}

// Priority: missing with ref PPG >= 10 (likely notable omissions)
const priorityMissing = missing
  .filter((m) => (m.refPpg ?? 0) >= 10)
  .sort((a, b) => b.refPpg - a.refPpg);

const report = {
  generatedAt: new Date().toISOString(),
  source: '82-0 players_flat.json (names/team/era only)',
  note: 'refPpg/refRpg/refApg are for triage only — do not copy into decade DBs.',
  totals: {
    missing: missing.length,
    extra: extra.length,
    matched: Object.values(matched).reduce((a, b) => a + b, 0),
    priorityMissingPpg10Plus: priorityMissing.length,
  },
  byEra: mainSummary(missing, extra, matched),
  priorityMissing,
  nameMismatchHints: nameMismatchHints.slice(0, 200),
  missing,
  extra,
};

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.totals, null, 2));
console.log('Wrote', outPath);
console.log('\nTop priority missing (ref PPG >= 10):');
for (const row of priorityMissing.slice(0, 40)) {
  console.log(
    `  ${row.era} ${row.team}: ${row.name} (${row.pos}) ~${row.refPpg}/${row.refRpg}/${row.refApg}` +
      (row.nearNamesOnOurRoster?.length
        ? `  [? ${row.nearNamesOnOurRoster.join(', ')}]`
        : ''),
  );
}
