import type { TeamNeedId } from './strengths';
import { NEED_LABELS } from './strengths';

/** Primary front-office wants — first 1–2 are the ones shown in Trade Engine. */
export const TEAM_NEEDS: Record<string, TeamNeedId[]> = {
  ATL: ['playmaking', 'perimeter_defense', 'young_talent'],
  BOS: ['wing_depth', 'starting_center', 'floor_spacing'],
  BKN: ['two_way_wing', 'shot_creation', 'young_talent'],
  CHA: ['playmaking', 'perimeter_defense', 'young_talent'],
  CHI: ['three_point_shooting', 'playmaking', 'wing_depth'],
  CLE: ['wing_depth', 'backup_center', 'floor_spacing'],
  DET: ['three_point_shooting', 'wing_depth', 'veteran_leadership'],
  IND: ['perimeter_defense', 'starting_center', 'wing_depth'],
  MIA: ['three_point_shooting', 'backup_center', 'offensive_creation'],
  MIL: ['perimeter_defense', 'playmaking', 'wing_depth'],
  NYK: ['three_point_shooting', 'offensive_creation', 'wing_depth'],
  ORL: ['three_point_shooting', 'playmaking', 'veteran_leadership'],
  PHI: ['floor_spacing', 'perimeter_defense', 'backup_center'],
  TOR: ['three_point_shooting', 'interior_size', 'veteran_leadership'],
  WAS: ['perimeter_defense', 'playmaking', 'young_talent'],
  DAL: ['perimeter_defense', 'rim_protection', 'wing_depth'],
  DEN: ['perimeter_defense', 'wing_depth', 'three_point_shooting'],
  GSW: ['athleticism', 'starting_center', 'wing_depth'],
  HOU: ['veteran_leadership', 'three_point_shooting', 'wing_depth'],
  LAC: ['playmaking', 'floor_spacing', 'perimeter_defense'],
  LAL: ['perimeter_defense', 'floor_spacing', 'young_talent'],
  MEM: ['three_point_shooting', 'offensive_creation', 'floor_spacing'],
  MIN: ['playmaking', 'perimeter_defense', 'wing_depth'],
  NOP: ['perimeter_defense', 'three_point_shooting', 'wing_depth'],
  OKC: ['veteran_leadership', 'starting_center', 'championship_experience'],
  PHX: ['playmaking', 'perimeter_defense', 'wing_depth'],
  POR: ['veteran_leadership', 'perimeter_defense', 'young_talent'],
  SAC: ['perimeter_defense', 'rim_protection', 'wing_depth'],
  SAS: ['veteran_leadership', 'three_point_shooting', 'playmaking'],
  UTA: ['playmaking', 'perimeter_defense', 'young_talent'],
};

export function getTeamNeeds(teamId: string): TeamNeedId[] {
  return TEAM_NEEDS[teamId] ?? ['wing_depth', 'playmaking', 'floor_spacing'];
}

/** The 1–2 headline desires shown when negotiating with a team. */
export function getPrimaryTeamNeeds(teamId: string, count = 2): TeamNeedId[] {
  return getTeamNeeds(teamId).slice(0, count);
}

export function getTeamNeedLabels(teamId: string): string[] {
  return getTeamNeeds(teamId).map((id) => NEED_LABELS[id]);
}

export function getPrimaryTeamNeedLabels(teamId: string, count = 2): string[] {
  return getPrimaryTeamNeeds(teamId, count).map((id) => NEED_LABELS[id]);
}
