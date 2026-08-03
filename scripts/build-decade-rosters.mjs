#!/usr/bin/env node
/**
 * Parse data/decades/*.txt → lib/tradeup/data/decadeRosters.json
 * Run after importing/cleaning decade DBs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DECADES_DIR = path.join(ROOT, 'data', 'decades');
const OUT_DIR = path.join(ROOT, 'lib', 'tradeup', 'data');
const OUT_FILE = path.join(OUT_DIR, 'decadeRosters.json');

const ERAS = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

/** Map source team headers → modern franchise ids used by TEAMS. */
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

const POSITIONS = new Set(['PG', 'SG', 'SF', 'PF', 'C']);

const legacyTeamRe = /^(.+?) \(([A-Z]{3})\) — \d+ players$/;
const legacyPlayerRe =
  /^\d+\.\s+(.+?)\s*\|\s*([A-Z]{1,2})\s*\|\s*([\d.]+)\s*PPG\s*\|\s*([\d.]+)\s*RPG\s*\|\s*([\d.]+)\s*(APG|BPG)/i;
const modernPlayerRe =
  /^(.+?)\s*\|\s*([A-Z]{1,2})\s*\|\s*([\d.]+)\s*PPG\s*\|\s*([\d.]+)\s*RPG\s*\|\s*([\d.]+)\s*(APG|BPG)/i;

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
  // Modern ALL-CAPS team titles
  if (t === t.toUpperCase() && /[A-Z]{3,}/.test(t) && t.length < 80) return true;
  return false;
}

function parseDecade(era) {
  const filePath = path.join(DECADES_DIR, `${era}.txt`);
  if (!fs.existsSync(filePath)) {
    console.warn(`Missing ${filePath}`);
    return {};
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  /** @type {Record<string, Array<{name:string,pos:string,ppg:number,rpg:number,apg:number,bpg:number}>>} */
  const byTeam = {};
  let currentTeam = null;
  const seenInTeam = new Map();

  const pushPlayer = (teamId, player) => {
    if (!POSITIONS.has(player.pos)) return;
    const key = player.name.replace(/\*+$/, '').trim().toLowerCase();
    if (!seenInTeam.has(teamId)) seenInTeam.set(teamId, new Set());
    const set = seenInTeam.get(teamId);
    if (set.has(key)) return;
    set.add(key);
    if (!byTeam[teamId]) byTeam[teamId] = [];
    byTeam[teamId].push(player);
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('=====')) continue;

    if (isTeamHeader(line)) {
      currentTeam = mapHeaderToTeamId(line);
      if (!currentTeam) {
        console.warn(`[${era}] Unmapped team header: ${line}`);
      }
      continue;
    }

    if (!currentTeam) continue;

    const m = line.match(legacyPlayerRe) || line.match(modernPlayerRe);
    if (!m) continue;

    const name = m[1].replace(/\*+$/, '').trim();
    const pos = m[2];
    const ppg = Number(m[3]);
    const rpg = Number(m[4]);
    const third = Number(m[5]);
    const thirdLabel = m[6].toUpperCase();
    const apg = thirdLabel === 'APG' ? third : 0;
    const bpg = thirdLabel === 'BPG' ? third : 0;
    if (!name || !Number.isFinite(ppg)) continue;

    pushPlayer(currentTeam, { name, pos, ppg, rpg, apg, bpg });
  }

  return byTeam;
}

const db = {};
let totalPlayers = 0;
for (const era of ERAS) {
  const teams = parseDecade(era);
  db[era] = teams;
  const n = Object.values(teams).reduce((a, p) => a + p.length, 0);
  totalPlayers += n;
  console.log(
    `${era}: ${Object.keys(teams).length} teams, ${n} players — ${Object.keys(teams).sort().join(',')}`,
  );
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(db));
console.log(`Wrote ${OUT_FILE} (${totalPlayers} player rows)`);
