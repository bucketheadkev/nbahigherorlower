import type { CSSProperties } from 'react';

/**
 * Franchise card colors: the team's official primary as the card body and its secondary as the
 * trim. Teams that share a primary hue are told apart by their trim (Bulls white, Rockets
 * silver, Raptors gold, Hawks volt, Blazers black) and the team-abbreviation watermark.
 */
export interface TeamCardColors {
  body: string;
  deep: string;
  trim: string;
  /** Text on the body. */
  ink: string;
}

const C = (body: string, deep: string, trim: string, ink = '#ffffff'): TeamCardColors => ({ body, deep, trim, ink });

export const TEAM_CARDS: Record<string, TeamCardColors> = {
  ATL: C('#E03A3E', '#7a1416', '#C1D32F'),
  BOS: C('#007A33', '#00391a', '#FFFFFF'),
  BKN: C('#2a2a2a', '#000000', '#FFFFFF'),
  CHA: C('#1D1160', '#0b0634', '#00A3B4'),
  CHI: C('#CE1141', '#2a0410', '#FFFFFF'),
  CLE: C('#860038', '#3d0019', '#FDBB30'),
  DAL: C('#00538C', '#002B5E', '#B8C4CA'),
  DEN: C('#0E2240', '#050d1c', '#FEC524'),
  DET: C('#1D42BA', '#0a1f63', '#C8102E'),
  GSW: C('#1D428A', '#0b1f4a', '#FFC72C'),
  HOU: C('#CE1141', '#4a0716', '#C4CED4'),
  IND: C('#002D62', '#00152f', '#FDBB30'),
  LAC: C('#C8102E', '#5c0714', '#1D428A'),
  LAL: C('#552583', '#26103d', '#FDB927'),
  MEM: C('#5D76A9', '#24335a', '#F5B112'),
  MIA: C('#98002E', '#120005', '#F9A01B'),
  MIL: C('#00471B', '#00210c', '#EEE1C6'),
  MIN: C('#236192', '#0C2340', '#78BE20'),
  NOP: C('#13294B', '#060f20', '#B4975A'),
  NYK: C('#006BB6', '#003b66', '#F58426'),
  OKC: C('#007AC1', '#002D62', '#EF3B24'),
  ORL: C('#0077C0', '#00243d', '#C4CED4'),
  PHI: C('#006BB6', '#00305a', '#ED174C'),
  PHX: C('#1D1160', '#0a0628', '#E56020'),
  POR: C('#E03A3E', '#5c1012', '#111111'),
  SAC: C('#5A2D81', '#2a1240', '#C4CED4'),
  SAS: C('#C4CED4', '#7d8a93', '#000000', '#0b0f14'),
  TOR: C('#CE1141', '#3a0410', '#B4975A'),
  UTA: C('#002B5C', '#00142c', '#F9A01B'),
  WAS: C('#002B5C', '#00142c', '#E31837'),
};

export function teamCard(teamId: string): TeamCardColors {
  return TEAM_CARDS[teamId] ?? C('#1d3a78', '#0a1838', '#5fb2ff');
}

/** CSS variables for any surface that wears a franchise's colors. */
export function teamCardStyle(teamId: string): CSSProperties {
  const c = teamCard(teamId);
  return { '--fc-body': c.body, '--fc-deep': c.deep, '--fc-trim': c.trim, '--fc-ink': c.ink } as CSSProperties;
}
