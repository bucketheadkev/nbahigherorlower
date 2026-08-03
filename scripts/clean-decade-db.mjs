#!/usr/bin/env node
/**
 * Clean a pasted NBA decade player database text file.
 * Supports:
 *   A) Legacy: "Hawks (ATL) — N players" + numbered rows with GP + Seasons:
 *   B) Modern full: "ATLANTA HAWKS" + rows with G + season list
 *   C) Modern short: team header + "Name | POS | PPG | RPG | APG" (no games/seasons)
 * - Removes same-team duplicate names (keeps first)
 * - Validates required fields (name/pos/ppg/rpg/apg)
 * - Applies known truncated-name fixes (exact match only)
 * - Preserves source format/headers when rebuilding
 */
import fs from 'node:fs';

const [,, inputPath, outputPath, reportPath] = process.argv;
if (!inputPath || !outputPath || !reportPath) {
  console.error('Usage: clean-decade-db.mjs <input.txt> <output.txt> <report.json>');
  process.exit(1);
}

const NAME_FIXES = new Map([
  ['Hot Rod', 'Hot Rod Hundley'],
  ['Tom Van', 'Tom Van Arsdale'],
  ['Dick Van', 'Dick Van Arsdale'],
  ['George Bon', 'George Bon Salle'],
  ['Jo Jo', 'Jo Jo White'],
  ['Jan Van', 'Jan van Breda Kolff'],
  ['Norm Van', 'Norm Van Lier'],
  ['World B.', 'World B. Free'],
  ['Micheal Ray', 'Micheal Ray Richardson'],
  ['Quentin Dailey', 'Quintin Dailey'],
  ['Stuart Granger', 'Stewart Granger'],
  ['Armen Gilliam', 'Armon Gilliam'],
  ['Abdul-Rauf', 'Mahmoud Abdul-Rauf'],
  ['Wes Person', 'Wesley Person'],
  ['Hawkins', 'Hersey Hawkins'],
  ['Rip Hamilton', 'Richard Hamilton'],
  ['PJ Tucker', 'P.J. Tucker'],
]);

/** Non-NBA / non-player lines to drop when explicitly marked or clearly invalid. */
const OMIT_NAME_KEYS = new Set([
  'mike schmidt',
]);

const text = fs.readFileSync(inputPath, 'utf8');
const lines = text.split(/\r?\n/);

const report = {
  format: null,
  duplicatePlayersRemoved: [],
  formattingIssuesFixed: [],
  omittedPlayers: [],
  missingFields: [],
  potentialWrongTeam: [],
  otherInconsistencies: [],
  teamCounts: {},
};

const legacyTeamRe = /^(.+?) \(([A-Z]{3})\) — (\d+) players$/;
const modernTeamRe = /^[A-Z0-9][A-Z0-9 &'./()-]+$/;

const legacyPlayerRe =
  /^(\d+)\.\s+(.+?)\s*\|\s*([A-Z]{1,2})\s*\|\s*([\d.]+)\s*PPG\s*\|\s*([\d.]+)\s*RPG\s*\|\s*([\d.]+)\s*(APG|BPG)\s*\|\s*(\d+)\s*GP\s*\|\s*Seasons:\s*(.+)\s*$/;
const modernPlayerRe =
  /^(.+?)\s*\|\s*([A-Z]{1,2})\s*\|\s*([\d.]+)\s*PPG\s*\|\s*([\d.]+)\s*RPG\s*\|\s*([\d.]+)\s*(APG|BPG)\s*\|\s*(\d+)\s*G\s*\|\s*(.+)\s*$/;
const shortPlayerRe =
  /^(.+?)\s*\|\s*([A-Z]{1,2})\s*\|\s*([\d.]+)\s*PPG\s*\|\s*([\d.]+)\s*RPG\s*\|\s*([\d.]+)\s*(APG|BPG)\.?\s*$/;
/** Scrambled third/second labels: PPG | APG | RPG */
const shortPlayerSwappedRe =
  /^(.+?)\s*\|\s*([A-Z]{1,2})\s*\|\s*([\d.]+)\s*PPG\s*\|\s*([\d.]+)\s*APG\s*\|\s*([\d.]+)\s*RPG\.?\s*$/;

function isPartMarker(line) {
  return /^\d{4}s\s*[–—-]\s*(FINAL\s+)?PART\b/i.test(line.trim());
}

function isModernTeamHeader(line) {
  const t = line.trim();
  if (!t || t.includes('|') || t.startsWith('=====')) return false;
  if (!modernTeamRe.test(t)) return false;
  // Avoid treating prose headers as teams
  if (/^(NBA |Coverage:|Stats |Format:|Relocated)/i.test(t)) return false;
  if (isPartMarker(t)) return false;
  return t === t.toUpperCase() && /[A-Z]{3,}/.test(t);
}

function applyNameFix(name, teamKey) {
  const base = name.replace(/\*+$/, '').trim();
  const star = /\*+$/.test(name) ? name.match(/\*+$/)[0] : '';
  if (NAME_FIXES.has(base)) {
    const fixed = NAME_FIXES.get(base) + star;
    report.formattingIssuesFixed.push({
      team: teamKey,
      from: name,
      to: fixed,
      reason: 'Truncated / incomplete name',
    });
    return fixed;
  }
  return name;
}

function startModernTeam(header) {
  format = format === 'legacy' ? 'mixed' : format ?? 'modern';
  flushTeam();
  current = {
    style: 'modern',
    abbr: header,
    title: header,
    claimedCount: null,
    headerLine: header,
    players: [],
  };
}

function startLegacyTeam(m, header) {
  format = format === 'modern' ? 'mixed' : format ?? 'legacy';
  flushTeam();
  current = {
    style: 'legacy',
    abbr: m[2],
    title: m[1],
    claimedCount: Number(m[3]),
    headerLine: header,
    players: [],
  };
}

const headerLines = [];
let i = 0;
while (i < lines.length) {
  const t = lines[i].trim();
  if (t.startsWith('=====')) break;
  if (isModernTeamHeader(t)) break;
  headerLines.push(lines[i]);
  i++;
}

const teamBlocks = [];
let current = null;
let format = null;

function flushTeam() {
  if (current) teamBlocks.push(current);
  current = null;
}

function skipSeparators() {
  while (
    i < lines.length &&
    (lines[i].trim() === '' || lines[i].startsWith('====='))
  ) {
    i++;
  }
}

while (i < lines.length) {
  const trimmed = lines[i].trim();

  if (trimmed === '') {
    i++;
    continue;
  }

  if (trimmed.startsWith('=====')) {
    i++;
    skipSeparators();
    if (i >= lines.length) break;
    // Skip section markers like "1990s – PART 2A"
    while (i < lines.length && isPartMarker(lines[i])) {
      i++;
      skipSeparators();
    }
    if (i >= lines.length) break;
    const header = lines[i].trim();
    if (header.startsWith('=====')) continue;
    const legacy = header.match(legacyTeamRe);
    if (legacy) {
      startLegacyTeam(legacy, header);
      i++;
      skipSeparators();
      continue;
    }
    if (isModernTeamHeader(header)) {
      startModernTeam(header);
      i++;
      skipSeparators();
      continue;
    }
    report.otherInconsistencies.push(`Unrecognized team header: ${header}`);
    i++;
    continue;
  }

  if (isPartMarker(trimmed)) {
    i++;
    continue;
  }

  if (isModernTeamHeader(trimmed)) {
    startModernTeam(trimmed);
    i++;
    skipSeparators();
    continue;
  }

  if (!current) {
    report.otherInconsistencies.push(`Orphan line (no team): ${trimmed}`);
    i++;
    continue;
  }

  // Explicit omit markers (e.g. baseball Mike Schmidt note in NBA paste)
  if (/\(omit\b/i.test(trimmed) || /omit if keeping NBA-only/i.test(trimmed)) {
    const omitName = trimmed.split('|')[0]?.replace(/\*+$/, '').trim() || trimmed;
    report.omittedPlayers.push({
      team: current.abbr,
      name: omitName,
      reason: 'Explicit omit marker in source (NBA-only)',
      line: trimmed,
    });
    i++;
    continue;
  }

  // Coaches / non-players listed with position Coach
  if (/\|\s*Coach\s*\|/i.test(trimmed)) {
    const omitName = trimmed.split('|')[0]?.replace(/\*+$/, '').trim() || trimmed;
    report.omittedPlayers.push({
      team: current.abbr,
      name: omitName,
      reason: 'Coach / non-player row',
      line: trimmed,
    });
    i++;
    continue;
  }

  // Stray fragments (e.g. "Pistons" mid-roster) — not player rows
  if (!trimmed.includes('|')) {
    report.formattingIssuesFixed.push({
      team: current.abbr,
      from: trimmed,
      to: '(dropped)',
      reason: 'Non-player fragment line under team',
    });
    i++;
    continue;
  }

  let name;
  let pos;
  let ppg;
  let rpg;
  let third;
  let thirdLabel;
  let gp = null;
  let seasons = null;
  let outputStyle;

  const legacyPm = trimmed.match(legacyPlayerRe);
  const modernPm = trimmed.match(modernPlayerRe);
  const shortPm = trimmed.match(shortPlayerRe);

  if (current.style === 'legacy' && legacyPm) {
    name = legacyPm[2].trim();
    pos = legacyPm[3];
    ppg = legacyPm[4];
    rpg = legacyPm[5];
    third = legacyPm[6];
    thirdLabel = legacyPm[7];
    gp = legacyPm[8];
    seasons = legacyPm[9].trim();
    outputStyle = 'legacy';
  } else if (modernPm && !/^\d+\.\s/.test(modernPm[1].trim())) {
    name = modernPm[1].trim();
    pos = modernPm[2];
    ppg = modernPm[3];
    rpg = modernPm[4];
    third = modernPm[5];
    thirdLabel = modernPm[6];
    gp = modernPm[7];
    seasons = modernPm[8].trim();
    outputStyle = 'modern';
  } else if (shortPm && !/^\d+\.\s/.test(shortPm[1].trim())) {
    name = shortPm[1].trim();
    pos = shortPm[2];
    ppg = shortPm[3];
    rpg = shortPm[4];
    third = shortPm[5];
    thirdLabel = shortPm[6];
    outputStyle = 'short';
    if (/\.\s*$/.test(trimmed)) {
      report.formattingIssuesFixed.push({
        team: current.abbr,
        from: trimmed,
        to: 'stripped trailing period',
        reason: 'Trailing punctuation on stats line',
      });
    }
  } else {
    const swappedPm = trimmed.match(shortPlayerSwappedRe);
    if (swappedPm && !/^\d+\.\s/.test(swappedPm[1].trim())) {
      name = swappedPm[1].trim();
      pos = swappedPm[2];
      ppg = swappedPm[3];
      // Source had PPG | APG | RPG — restore canonical order
      third = swappedPm[4];
      thirdLabel = 'APG';
      rpg = swappedPm[5];
      outputStyle = 'short';
      report.formattingIssuesFixed.push({
        team: current.abbr,
        from: trimmed,
        to: `${name} | ${pos} | ${ppg} PPG | ${rpg} RPG | ${third} APG`,
        reason: 'Swapped RPG/APG field order',
      });
    } else {
      report.otherInconsistencies.push(
        `Unparseable player line under ${current.abbr}: ${trimmed}`,
      );
      i++;
      continue;
    }
  }

  if (!name || !pos || ppg === undefined || rpg === undefined || third === undefined) {
    report.missingFields.push(`${current.abbr}: ${trimmed}`);
  }

  name = applyNameFix(name, current.abbr);
  const nameKey = name.replace(/\*+$/, '').trim().toLowerCase();
  if (OMIT_NAME_KEYS.has(nameKey)) {
    report.omittedPlayers.push({
      team: current.abbr,
      name,
      reason: 'Non-NBA omit list',
      line: trimmed,
    });
    i++;
    continue;
  }

  current.players.push({
    name,
    nameKey,
    pos,
    ppg,
    rpg,
    third,
    thirdLabel,
    gp,
    seasons,
    outputStyle,
    raw: trimmed,
  });
  i++;
}
flushTeam();

report.format = format;

for (const team of teamBlocks) {
  const seen = new Map();
  const kept = [];
  for (const p of team.players) {
    if (seen.has(p.nameKey)) {
      report.duplicatePlayersRemoved.push({
        team: team.abbr,
        teamTitle: team.title,
        name: p.name,
        keptSeasons: seen.get(p.nameKey).seasons,
        removedSeasons: p.seasons,
      });
      continue;
    }
    seen.set(p.nameKey, p);
    kept.push(p);
  }
  team.players = kept;
  const key =
    team.style === 'legacy' ? `${team.title} (${team.abbr})` : team.title;
  report.teamCounts[key] = {
    claimed: team.claimedCount ?? kept.length,
    afterClean: kept.length,
  };
}

const out = [];
out.push(
  ...headerLines.filter(
    (l, idx) => !(idx === headerLines.length - 1 && l.trim() === ''),
  ),
);
if (out.length && out[out.length - 1].trim() !== '') out.push('');

for (const team of teamBlocks) {
  out.push('========================================================================');
  if (team.style === 'legacy') {
    out.push(`${team.title} (${team.abbr}) — ${team.players.length} players`);
  } else {
    out.push(team.headerLine);
  }
  out.push('========================================================================');
  team.players.forEach((p, idx) => {
    if (p.outputStyle === 'legacy' || team.style === 'legacy') {
      out.push(
        `${idx + 1}. ${p.name} | ${p.pos} | ${p.ppg} PPG | ${p.rpg} RPG | ${p.third} ${p.thirdLabel} | ${p.gp} GP | Seasons: ${p.seasons}`,
      );
    } else if (p.outputStyle === 'modern') {
      out.push(
        `${p.name} | ${p.pos} | ${p.ppg} PPG | ${p.rpg} RPG | ${p.third} ${p.thirdLabel} | ${p.gp} G | ${p.seasons}`,
      );
    } else {
      out.push(
        `${p.name} | ${p.pos} | ${p.ppg} PPG | ${p.rpg} RPG | ${p.third} ${p.thirdLabel}`,
      );
    }
  });
  out.push('');
}

fs.writeFileSync(outputPath, out.join('\n').replace(/\n+$/, '\n'));
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(
  JSON.stringify(
    {
      format,
      teams: teamBlocks.length,
      players: teamBlocks.reduce((n, t) => n + t.players.length, 0),
      duplicatesRemoved: report.duplicatePlayersRemoved.length,
      formattingFixed: report.formattingIssuesFixed.length,
      omitted: report.omittedPlayers.length,
      unparseable: report.otherInconsistencies.length,
      outputPath,
      reportPath,
    },
    null,
    2,
  ),
);
