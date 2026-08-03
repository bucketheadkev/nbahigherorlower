export const TEAM_COLORS: Record<string, { primary: string; accent: string }> = {
  ATL: { primary: '#E03A3E', accent: '#C1D32F' },
  BOS: { primary: '#007A33', accent: '#BA9653' },
  BKN: { primary: '#000000', accent: '#FFFFFF' },
  CHA: { primary: '#1D1160', accent: '#00788C' },
  CHI: { primary: '#CE1141', accent: '#000000' },
  CLE: { primary: '#860038', accent: '#FDBB30' },
  DET: { primary: '#C8102E', accent: '#1D42CA' },
  IND: { primary: '#002D62', accent: '#FDBB30' },
  MIA: { primary: '#98002E', accent: '#F9A01B' },
  MIL: { primary: '#00471B', accent: '#EEE1C6' },
  NYK: { primary: '#006BB6', accent: '#F58426' },
  ORL: { primary: '#0077C0', accent: '#C4CED4' },
  PHI: { primary: '#006BB6', accent: '#ED174C' },
  TOR: { primary: '#CE1141', accent: '#000000' },
  WAS: { primary: '#002B5C', accent: '#E31837' },
  DAL: { primary: '#00538C', accent: '#002B5E' },
  DEN: { primary: '#0E2240', accent: '#FEC524' },
  GSW: { primary: '#1D428A', accent: '#FFC72C' },
  HOU: { primary: '#CE1141', accent: '#000000' },
  LAC: { primary: '#C8102E', accent: '#1D428A' },
  LAL: { primary: '#552583', accent: '#FDB927' },
  MEM: { primary: '#5D76A9', accent: '#12173F' },
  MIN: { primary: '#0C2340', accent: '#236192' },
  NOP: { primary: '#0C2340', accent: '#C8102E' },
  OKC: { primary: '#007AC1', accent: '#EF3B24' },
  PHX: { primary: '#1D1160', accent: '#E56020' },
  POR: { primary: '#E03A3E', accent: '#000000' },
  SAC: { primary: '#5A2D81', accent: '#63727A' },
  SAS: { primary: '#C4CED4', accent: '#000000' },
  UTA: { primary: '#002B5C', accent: '#F9A01B' },
};

export function getTeamColors(teamId: string) {
  if (teamId === 'USER') return { primary: '#B8860B', accent: '#F5E6A3' };
  return TEAM_COLORS[teamId] ?? { primary: '#333333', accent: '#888888' };
}

/** Readable ink on a team primary fill. */
export function contrastOnPrimary(hex: string): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return '#ffffff';
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#0c0a09' : '#ffffff';
}
