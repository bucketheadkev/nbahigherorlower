/**
 * Team logo URLs — ESPN CDN primary, SportsLogos fallback.
 * ESPN path uses their slug (gs, ny, sa, no, utah) not always our 3-letter id.
 */

/** Our team id → ESPN logo slug */
export const ESPN_TEAM_SLUG: Record<string, string> = {
  ATL: 'atl',
  BOS: 'bos',
  BKN: 'bkn',
  CHA: 'cha',
  CHI: 'chi',
  CLE: 'cle',
  DET: 'det',
  IND: 'ind',
  MIA: 'mia',
  MIL: 'mil',
  NYK: 'ny',
  ORL: 'orl',
  PHI: 'phi',
  TOR: 'tor',
  WAS: 'wsh',
  DAL: 'dal',
  DEN: 'den',
  GSW: 'gs',
  HOU: 'hou',
  LAC: 'lac',
  LAL: 'lal',
  MEM: 'mem',
  MIN: 'min',
  NOP: 'no',
  OKC: 'okc',
  PHX: 'phx',
  POR: 'por',
  SAC: 'sac',
  SAS: 'sa',
  UTA: 'utah',
};

export function getEspnTeamLogoUrl(teamId: string, size: 500 | 100 = 500): string {
  const slug = ESPN_TEAM_SLUG[teamId] ?? teamId.toLowerCase();
  // ESPN hosts 500px PNGs reliably; 100 path is not always present
  void size;
  return `https://a.espncdn.com/i/teamlogos/nba/500/${slug}.png`;
}

/** SportsLogos.net thumbs — fallback if ESPN fails */
export const TEAM_LOGO_THUMBS: Record<string, string> = {
  ATL: 'https://content.sportslogos.net/logos/6/220/thumbs/22081902021.gif',
  BKN: 'https://content.sportslogos.net/logos/6/3786/thumbs/378615012025.gif',
  BOS: 'https://content.sportslogos.net/logos/6/213/thumbs/slhg02hbef3j1ov4lsnwyol5o.gif',
  CHA: 'https://content.sportslogos.net/logos/6/5120/thumbs/512019262015.gif',
  CHI: 'https://content.sportslogos.net/logos/6/221/thumbs/hj3gmh82w9hffmeh3fjm5h874.gif',
  CLE: 'https://content.sportslogos.net/logos/6/222/thumbs/22253692023.gif',
  DAL: 'https://content.sportslogos.net/logos/6/228/thumbs/22834632018.gif',
  DEN: 'https://content.sportslogos.net/logos/6/229/thumbs/22989262019.gif',
  DET: 'https://content.sportslogos.net/logos/6/223/thumbs/22321642018.gif',
  GSW: 'https://content.sportslogos.net/logos/6/235/thumbs/23531522020.gif',
  HOU: 'https://content.sportslogos.net/logos/6/230/thumbs/houston-rockets-logo-primary-2020-3703-thumb.png',
  IND: 'https://content.sportslogos.net/logos/6/224/thumbs/indiana-pacers-logo-primary-2026-22496872026-thumb.png',
  LAC: 'https://content.sportslogos.net/logos/6/236/thumbs/23655422025.gif',
  LAL: 'https://content.sportslogos.net/logos/6/237/thumbs/23773242024.gif',
  MEM: 'https://content.sportslogos.net/logos/6/231/thumbs/23143732019.gif',
  MIA: 'https://content.sportslogos.net/logos/6/214/thumbs/burm5gh2wvjti3xhei5h16k8e.gif',
  MIL: 'https://content.sportslogos.net/logos/6/225/thumbs/22582752016.gif',
  MIN: 'https://content.sportslogos.net/logos/6/232/thumbs/minnesota-timberwolves-logo-primary-2018-7496-thumb.png',
  NOP: 'https://content.sportslogos.net/logos/6/4962/thumbs/496292922024.gif',
  NYK: 'https://content.sportslogos.net/logos/6/216/thumbs/21671702024.gif',
  OKC: 'https://content.sportslogos.net/logos/6/2687/thumbs/oklahoma-city-thunder-logo-primary-2009-9699-thumb.png',
  ORL: 'https://content.sportslogos.net/logos/6/217/thumbs/orlando-magic-logo-primary-2026-21794952026-thumb.png',
  PHI: 'https://content.sportslogos.net/logos/6/218/thumbs/21870342016.gif',
  PHX: 'https://content.sportslogos.net/logos/6/238/thumbs/23843702014.gif',
  POR: 'https://content.sportslogos.net/logos/6/239/thumbs/23997252018.gif',
  SAC: 'https://content.sportslogos.net/logos/6/240/thumbs/24040432017.gif',
  SAS: 'https://content.sportslogos.net/logos/6/233/thumbs/23325472018.gif',
  TOR: 'https://content.sportslogos.net/logos/6/227/thumbs/22770242021.gif',
  UTA: 'https://content.sportslogos.net/logos/6/234/thumbs/utah-jazz-logo-primary-2026-1109-thumb.png',
  WAS: 'https://content.sportslogos.net/logos/6/219/thumbs/washington-wizards-logo-primary-2016-8780-thumb.png',
};

export const TEAM_LOGO_PANELS: Record<string, string> = Object.fromEntries(
  Object.keys(ESPN_TEAM_SLUG).map((id) => [id, getEspnTeamLogoUrl(id, 500)]),
);

/** @deprecated Use TEAM_LOGO_THUMBS */
export const TEAM_LOGO_URLS = TEAM_LOGO_THUMBS;

const loggedMissing = new Set<string>();

export function getTeamLogoUrl(
  teamId: string,
  variant: 'thumb' | 'panel' = 'thumb',
): string | undefined {
  // Prefer ESPN CDN for crisp PNGs (primary request)
  const espn = getEspnTeamLogoUrl(teamId, variant === 'panel' ? 500 : 100);
  if (espn) return espn;
  const map = variant === 'panel' ? TEAM_LOGO_PANELS : TEAM_LOGO_THUMBS;
  return map[teamId];
}

/** Fallback URL if ESPN image fails to load */
export function getTeamLogoFallbackUrl(teamId: string): string | undefined {
  return TEAM_LOGO_THUMBS[teamId];
}

export function logMissingTeamLogo(teamId: string, teamName?: string): void {
  if (loggedMissing.has(teamId)) return;
  loggedMissing.add(teamId);
  console.warn(
    `[Trade Up] Missing team logo for ${teamName ?? teamId} (${teamId}) — using abbreviation fallback.`,
  );
}
