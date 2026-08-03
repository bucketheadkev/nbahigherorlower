import type { TradePlayer } from './types';

export const PRIMARY_STRENGTHS = [
  'Elite Rim Protection',
  'Perimeter Defense',
  'Elite Shooting',
  'Playmaking',
  'Transition Scoring',
  'Athleticism',
  'Shot Creation',
  'Interior Scoring',
  'Rebounding',
  'Versatile Defender',
  'High Basketball IQ',
  'Three-Level Scorer',
  'Pick-and-Roll Playmaker',
  'Rim Pressure',
] as const;

export type PrimaryStrength = (typeof PRIMARY_STRENGTHS)[number];

export type TeamNeedId =
  | 'perimeter_defense'
  | 'floor_spacing'
  | 'young_talent'
  | 'three_point_shooting'
  | 'backup_center'
  | 'starting_center'
  | 'offensive_creation'
  | 'veteran_leadership'
  | 'interior_size'
  | 'championship_experience'
  | 'rim_protection'
  | 'playmaking'
  | 'wing_depth'
  | 'rebounding'
  | 'two_way_wing'
  | 'athleticism'
  | 'shot_creation';

export const NEED_LABELS: Record<TeamNeedId, string> = {
  perimeter_defense: 'Perimeter Defense',
  floor_spacing: 'Floor Spacing',
  young_talent: 'Younger Rotation Players',
  three_point_shooting: 'Three-Point Shooting',
  backup_center: 'Backup Center',
  starting_center: 'Starting Center',
  offensive_creation: 'Offensive Creation',
  veteran_leadership: 'Veteran Leadership',
  interior_size: 'Interior Size',
  championship_experience: 'Championship Experience',
  rim_protection: 'Rim Protection',
  playmaking: 'Playmaking',
  wing_depth: 'Wing Depth',
  rebounding: 'Rebounding',
  two_way_wing: 'Two-Way Wing',
  athleticism: 'Athleticism',
  shot_creation: 'Shot Creation',
};

const STRENGTH_TO_NEEDS: Record<PrimaryStrength, TeamNeedId[]> = {
  'Elite Rim Protection': ['rim_protection', 'interior_size', 'backup_center', 'starting_center'],
  'Perimeter Defense': ['perimeter_defense', 'two_way_wing'],
  'Elite Shooting': ['three_point_shooting', 'floor_spacing'],
  Playmaking: ['playmaking', 'offensive_creation'],
  'Transition Scoring': ['athleticism', 'offensive_creation'],
  Athleticism: ['athleticism', 'young_talent', 'wing_depth'],
  'Shot Creation': ['shot_creation', 'offensive_creation'],
  'Interior Scoring': ['interior_size', 'rim_protection', 'starting_center'],
  Rebounding: ['rebounding', 'interior_size'],
  'Versatile Defender': ['perimeter_defense', 'two_way_wing', 'wing_depth'],
  'High Basketball IQ': ['veteran_leadership', 'championship_experience', 'playmaking'],
  'Three-Level Scorer': ['floor_spacing', 'shot_creation', 'offensive_creation'],
  'Pick-and-Roll Playmaker': ['playmaking', 'offensive_creation'],
  'Rim Pressure': ['interior_size', 'athleticism', 'starting_center'],
};

export function getPrimaryStrength(player: TradePlayer): PrimaryStrength {
  const { stats, position, age } = player;
  const scores: Record<PrimaryStrength, number> = {
    'Elite Rim Protection': stats.bpg * 14 + (position === 'C' ? 8 : 0),
    'Perimeter Defense': stats.spg * 10 + (position === 'SG' || position === 'SF' ? 4 : 0),
    'Elite Shooting': stats.ppg * 0.55 + (stats.apg < 4 ? 6 : 0),
    Playmaking: stats.apg * 3.2,
    'Transition Scoring': stats.ppg * 0.35 + (age <= 26 ? 5 : 0),
    Athleticism: (26 - Math.min(age, 26)) * 0.8 + stats.spg * 3 + stats.bpg * 2,
    'Shot Creation': stats.ppg * 0.45 + stats.apg * 0.6,
    'Interior Scoring': stats.ppg * 0.4 + (position === 'C' || position === 'PF' ? 8 : 0),
    Rebounding: stats.rpg * 2.2,
    'Versatile Defender': stats.spg * 5 + stats.bpg * 4,
    'High Basketball IQ': stats.apg * 1.2 + (age >= 30 ? 8 : age >= 27 ? 4 : 0),
    'Three-Level Scorer': stats.ppg * 0.5 + stats.rpg * 0.3 + stats.apg * 0.25,
    'Pick-and-Roll Playmaker': stats.apg * 2.5 + stats.ppg * 0.2,
    'Rim Pressure': stats.ppg * 0.35 + stats.bpg * 6 + (position === 'C' ? 4 : 0),
  };

  let best: PrimaryStrength = 'Versatile Defender';
  let bestScore = -1;
  for (const strength of PRIMARY_STRENGTHS) {
    if (scores[strength] > bestScore) {
      bestScore = scores[strength];
      best = strength;
    }
  }
  return best;
}

export function getMatchedNeeds(player: TradePlayer, teamNeeds: TeamNeedId[]): TeamNeedId[] {
  const strength = getPrimaryStrength(player);
  const strengthNeeds = STRENGTH_TO_NEEDS[strength] ?? [];
  const matched = new Set<TeamNeedId>();
  const pos = player.primaryPosition;
  const { stats } = player;

  for (const need of teamNeeds) {
    if (strengthNeeds.includes(need)) matched.add(need);
    if (need === 'young_talent' && player.age <= 23) matched.add(need);
    if (need === 'veteran_leadership' && player.age >= 30) matched.add(need);
    if (need === 'championship_experience' && player.age >= 31 && player.tradeValue >= 50) {
      matched.add(need);
    }
    if (need === 'backup_center' && pos === 'C') matched.add(need);
    if (need === 'starting_center' && pos === 'C' && (player.isStarter || player.tradeValue >= 55)) {
      matched.add(need);
    }
    if (need === 'interior_size' && (pos === 'C' || pos === 'PF')) matched.add(need);
    if (need === 'wing_depth' && (pos === 'SF' || pos === 'SG')) matched.add(need);
    if (need === 'two_way_wing' && (pos === 'SF' || pos === 'SG') && stats.spg >= 1.0) {
      matched.add(need);
    }
    if (need === 'playmaking' && (pos === 'PG' || stats.apg >= 5.5)) matched.add(need);
    if (need === 'rim_protection' && stats.bpg >= 1.2) matched.add(need);
    if (need === 'rebounding' && stats.rpg >= 8) matched.add(need);
    if (need === 'perimeter_defense' && stats.spg >= 1.2) matched.add(need);
    if (need === 'three_point_shooting' && stats.ppg >= 14 && stats.apg < 5.5) matched.add(need);
    if (need === 'floor_spacing' && stats.ppg >= 12 && (pos === 'SG' || pos === 'SF' || pos === 'PF')) {
      matched.add(need);
    }
    if (need === 'shot_creation' && stats.ppg >= 18) matched.add(need);
    if (need === 'offensive_creation' && stats.ppg + stats.apg >= 22) matched.add(need);
    if (need === 'athleticism' && player.age <= 25) matched.add(need);
  }

  return [...matched];
}

export function needFitBonus(player: TradePlayer, teamNeeds: TeamNeedId[]): number {
  const matched = getMatchedNeeds(player, teamNeeds);
  if (matched.length === 0) return 0;
  if (matched.length >= 2) return 14;
  return 9;
}

export function getUnmetNeed(teamNeeds: TeamNeedId[], matched: TeamNeedId[]): TeamNeedId | undefined {
  return teamNeeds.find((need) => !matched.includes(need));
}
