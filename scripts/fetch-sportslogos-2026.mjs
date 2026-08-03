/**
 * Fetches 2025-2026 NBA logo URLs from SportsLogos.net (thumb + large panel).
 * Source: https://www.sportslogos.net/teams/list_by_year/62026/2026-NBA-Logos-By-Year/
 */

import { writeFileSync } from 'fs';
import path from 'path';

const SOURCE_URL =
  'https://www.sportslogos.net/teams/list_by_year/62026/2026-NBA-Logos-By-Year/';

const TEAM_ID_BY_NAME = {
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU',
  'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS',
};

const headers = { 'User-Agent': 'TradeUpLogoFetcher/1.0' };

const listHtml = await fetch(SOURCE_URL, { headers }).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching list page`);
  return r.text();
});

const entries = [];
const cardRe =
  /<a href="(\/logos\/view\/[^"]+)"[^>]*title="2025-2026 ([^"]+) Logo"[\s\S]*?<img src="(https:\/\/content\.sportslogos\.net\/[^"]+)" alt="[^"]+ Logo"/g;

for (const match of listHtml.matchAll(cardRe)) {
  const [, viewPath, teamName, thumbUrl] = match;
  const teamId = TEAM_ID_BY_NAME[teamName.trim()];
  if (!teamId) continue;
  if (entries.some((e) => e.teamId === teamId)) continue;
  entries.push({ teamId, teamName: teamName.trim(), thumbUrl, viewPath });
}

console.log(`Found ${entries.length} team cards on list page`);

const logos = {};

for (const entry of entries) {
  const viewUrl = `https://www.sportslogos.net${entry.viewPath}`;
  let panelUrl = entry.thumbUrl;

  try {
    const viewHtml = await fetch(viewUrl, { headers }).then((r) => r.text());
    const fullMatch = viewHtml.match(
      /https:\/\/content\.sportslogos\.net\/logos\/6\/\d+\/full\/[^"\s]+/,
    );
    if (fullMatch) {
      panelUrl = fullMatch[0];
    } else {
      console.warn(`No full URL on view page for ${entry.teamId}, using thumb`);
    }
  } catch (error) {
    console.warn(`View page fetch failed for ${entry.teamId}:`, error);
  }

  logos[entry.teamId] = { thumb: entry.thumbUrl, panel: panelUrl };
}

const thumbLines = Object.entries(logos)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([id, v]) => `  ${JSON.stringify(id)}: ${JSON.stringify(v.thumb)},`)
  .join('\n');

const panelLines = Object.entries(logos)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([id, v]) => `  ${JSON.stringify(id)}: ${JSON.stringify(v.panel)},`)
  .join('\n');

const out = `/** SportsLogos.net 2025-2026 NBA primary logos — auto-generated, do not edit manually. */
/** Source: ${SOURCE_URL} */

export const TEAM_LOGO_THUMBS: Record<string, string> = {
${thumbLines}
};

export const TEAM_LOGO_PANELS: Record<string, string> = {
${panelLines}
};

/** @deprecated Use TEAM_LOGO_THUMBS */
export const TEAM_LOGO_URLS = TEAM_LOGO_THUMBS;

const loggedMissing = new Set<string>();

export function getTeamLogoUrl(
  teamId: string,
  variant: 'thumb' | 'panel' = 'thumb',
): string | undefined {
  const map = variant === 'panel' ? TEAM_LOGO_PANELS : TEAM_LOGO_THUMBS;
  return map[teamId];
}

export function logMissingTeamLogo(teamId: string, teamName?: string): void {
  if (TEAM_LOGO_THUMBS[teamId] || loggedMissing.has(teamId)) return;
  loggedMissing.add(teamId);
  console.warn(
    \`[Trade Up] Missing SportsLogos team logo for \${teamName ?? teamId} (\${teamId}) — using abbreviation fallback.\`,
  );
}
`;

const target = path.join(process.cwd(), 'lib/tradeup/teamLogos.ts');
writeFileSync(target, out, 'utf8');
console.log(`Wrote ${target} (${Object.keys(logos).length} teams)`);
