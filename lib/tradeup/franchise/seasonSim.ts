import { getPlayerById } from '../rosters';
import { getPlayerTier, type PlayerTier } from '../tiers';
import type { FranchiseData } from './types';
import { isRosterCompleteForSimulation } from './tier';

export type PlayoffOutcome =
  | 'Missed Playoffs'
  | 'Play-In Elimination'
  | 'First-Round Exit'
  | 'Conference Semifinals'
  | 'Conference Finals'
  | 'NBA Finals'
  | 'NBA Champions';

export interface FranchiseRatings {
  overallRating: number;
  startingRating: number;
  benchRating: number;
  teamTier: PlayerTier | null;
}

export interface SeasonSimulationResult {
  wins: number;
  losses: number;
  record: string;
  conferenceSeed: number | null;
  seedLabel: string;
  playoffResult: PlayoffOutcome;
  offensiveRating: number;
  defensiveRating: number;
  chemistryScore: number;
  chemistryGrade: string;
  seasonGrade: PlayerTier;
  teamGrade: PlayerTier;
  playoffProbability: number;
  summary: string;
  biggestStrength: string;
  biggestWeakness: string;
}

const TIER_POWER: Record<PlayerTier, number> = {
  GOAT: 1.12,
  S: 1,
  A: 0.82,
  B: 0.64,
  C: 0.46,
  D: 0.3,
  F: 0.16,
};

const SIM_MESSAGES = [
  'Analyzing starting lineup…',
  'Evaluating bench depth…',
  'Calculating offensive efficiency…',
  'Calculating defensive efficiency…',
  'Measuring roster chemistry…',
  'Simulating regular-season matchups…',
  'Finalizing season results…',
] as const;

export const SEASON_SIM_MESSAGES = SIM_MESSAGES;
export const SEASON_GAME_MILESTONES = [1, 20, 41, 60, 82] as const;
export const SEASON_SIM_DURATION_MS = 5200;

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashIds(ids: string[]): number {
  let h = 0;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

export interface RosterAnalysis {
  starterPower: number;
  benchPower: number;
  overallPower: number;
  offensive: number;
  defensive: number;
  balance: number;
  chemistry: number;
  tierCounts: Record<PlayerTier, number>;
  filledStarters: number;
  filledBench: number;
}

function analyzeRoster(data: FranchiseData): RosterAnalysis | null {
  const starterIds = data.startingFive.filter((id): id is string => id !== null);
  const benchIds = data.bench.filter((id): id is string => id !== null);

  if (starterIds.length === 0 && benchIds.length === 0) return null;

  const tierCounts: Record<PlayerTier, number> = {
    GOAT: 0,
    S: 0,
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    F: 0,
  };

  let starterPower = 0;
  let benchPower = 0;
  let offensive = 0;
  let defensive = 0;
  let totalWeight = 0;

  let sSum = 0;
  let sW = 0;
  for (const id of starterIds) {
    const player = getPlayerById(id);
    if (!player) continue;
    const tier = getPlayerTier(player);
    tierCounts[tier] += 1;
    const p = TIER_POWER[tier] * 0.55 + (player.tradeValue / 100) * 0.45;
    sSum += p;
    sW += 1;
    offensive += (player.stats.ppg + player.stats.apg * 0.8) * 0.14;
    defensive += (player.stats.rpg * 0.35 + player.stats.bpg * 2 + player.stats.spg) * 0.14;
    totalWeight += 0.14;
  }
  starterPower = sW > 0 ? sSum / sW : 0;

  let bSum = 0;
  let bW = 0;
  for (const id of benchIds) {
    const player = getPlayerById(id);
    if (!player) continue;
    const tier = getPlayerTier(player);
    tierCounts[tier] += 1;
    const p = TIER_POWER[tier] * 0.55 + (player.tradeValue / 100) * 0.45;
    bSum += p;
    bW += 1;
    offensive += (player.stats.ppg + player.stats.apg * 0.8) * 0.06;
    defensive += (player.stats.rpg * 0.35 + player.stats.bpg * 2 + player.stats.spg) * 0.06;
    totalWeight += 0.06;
  }
  benchPower = bW > 0 ? bSum / bW : 0;

  const overallPower = starterPower * 0.72 + benchPower * 0.28;
  const balance =
    starterIds.length >= 5 && benchIds.length >= 3
      ? 0.12
      : starterIds.length >= 3 && benchIds.length >= 2
        ? 0.08
        : -0.06;

  const fillScore =
    (starterIds.length / 5) * 0.45 + (benchIds.length / 3) * 0.25 + Math.min(1, benchPower / 0.65) * 0.3;
  const starScore = Math.min(
    1,
    (tierCounts.GOAT * 0.45 + tierCounts.S * 0.35 + tierCounts.A * 0.2) / 1.2,
  );
  const depthGap = Math.max(0, starterPower - benchPower - 0.2);
  const chemistry = Math.max(
    0.28,
    Math.min(0.98, fillScore * 0.42 + starScore * 0.28 + (1 - depthGap) * 0.3 + (balance > 0 ? 0.08 : 0)),
  );

  return {
    starterPower,
    benchPower,
    overallPower: overallPower + balance,
    offensive: totalWeight > 0 ? offensive / totalWeight : 0,
    defensive: totalWeight > 0 ? defensive / totalWeight : 0,
    balance,
    chemistry,
    tierCounts,
    filledStarters: starterIds.length,
    filledBench: benchIds.length,
  };
}

export function getFranchiseRatings(
  data: FranchiseData,
  teamTier: PlayerTier | null,
): FranchiseRatings | null {
  const analysis = analyzeRoster(data);
  if (!analysis) return null;

  return {
    overallRating: powerToRating(analysis.overallPower),
    startingRating: powerToRating(analysis.starterPower),
    benchRating: powerToRating(analysis.benchPower),
    teamTier,
  };
}

function powerToRating(power: number): number {
  return Math.round(52 + Math.max(0, Math.min(1, power)) * 46);
}

function powerToGrade(power: number): PlayerTier {
  if (power >= 0.98) return 'GOAT';
  if (power >= 0.88) return 'S';
  if (power >= 0.72) return 'A';
  if (power >= 0.56) return 'B';
  if (power >= 0.4) return 'C';
  if (power >= 0.26) return 'D';
  return 'F';
}

function chemistryToGrade(score: number): string {
  if (score >= 0.92) return 'A+';
  if (score >= 0.85) return 'A';
  if (score >= 0.78) return 'B+';
  if (score >= 0.68) return 'B';
  if (score >= 0.58) return 'C+';
  if (score >= 0.48) return 'C';
  if (score >= 0.38) return 'D';
  return 'F';
}

function winsToSeasonGrade(wins: number, power: number): PlayerTier {
  const blended = (wins / 82) * 0.65 + power * 0.35;
  if (blended >= 0.82) return 'GOAT';
  if (blended >= 0.72) return 'S';
  if (blended >= 0.6) return 'A';
  if (blended >= 0.48) return 'B';
  if (blended >= 0.36) return 'C';
  if (blended >= 0.24) return 'D';
  return 'F';
}

function deriveStrengthWeakness(analysis: RosterAnalysis): {
  strength: string;
  weakness: string;
} {
  const { tierCounts, starterPower, benchPower, offensive, defensive, filledStarters, filledBench } =
    analysis;

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (tierCounts.S >= 2) strengths.push('Superstar duo');
  else if (tierCounts.S >= 1) strengths.push('Franchise cornerstone');
  if (tierCounts.A + tierCounts.S >= 4) strengths.push('Elite depth');
  if (starterPower >= 0.75) strengths.push('Loaded starting five');
  if (benchPower >= 0.6) strengths.push('Quality bench unit');
  if (offensive >= 22) strengths.push('High-powered offense');
  if (defensive >= 8) strengths.push('Lockdown defense');

  if (filledStarters < 5) weaknesses.push('Incomplete starting lineup');
  if (filledBench < 3) weaknesses.push('Thin bench');
  if (tierCounts.F + tierCounts.D >= 3) weaknesses.push('Low-tier rotation');
  if (starterPower - benchPower > 0.35) weaknesses.push('Drop-off after starters');
  if (offensive < 14) weaknesses.push('Limited scoring');
  if (defensive < 5) weaknesses.push('Defensive vulnerabilities');
  if (tierCounts.S === 0 && tierCounts.A <= 1) weaknesses.push('Lack of star power');

  return {
    strength: strengths[0] ?? 'Balanced roster construction',
    weakness: weaknesses[0] ?? 'Room to upgrade talent',
  };
}

function derivePlayoffOutcome(wins: number, power: number, rand: () => number): PlayoffOutcome {
  if (wins < 28) return 'Missed Playoffs';
  if (wins < 34) return rand() < 0.55 ? 'Missed Playoffs' : 'Play-In Elimination';
  if (wins < 40) return rand() < 0.45 ? 'Play-In Elimination' : 'First-Round Exit';
  if (wins < 46) return 'First-Round Exit';
  if (wins < 50) return rand() < 0.5 ? 'First-Round Exit' : 'Conference Semifinals';
  if (wins < 53) return 'Conference Semifinals';
  if (wins < 56) {
    return rand() < 0.35 + power * 0.25 ? 'Conference Finals' : 'Conference Semifinals';
  }
  if (wins < 60) {
    return rand() < 0.25 + power * 0.3 ? 'NBA Finals' : 'Conference Finals';
  }
  if (wins < 64) {
    return rand() < 0.12 + power * 0.28 ? 'NBA Champions' : 'NBA Finals';
  }
  return rand() < 0.22 + power * 0.35 ? 'NBA Champions' : 'NBA Finals';
}

function deriveSeed(wins: number, rand: () => number): number | null {
  if (wins < 28) return null;
  const winPct = wins / 82;
  const seed = Math.round(15 - winPct * 13 + (rand() - 0.5) * 2.5);
  return Math.max(1, Math.min(8, seed));
}

function formatSeedLabel(seed: number | null): string {
  if (seed === null) return 'Missed Playoffs';
  const suffix =
    seed === 1 ? 'st' : seed === 2 ? 'nd' : seed === 3 ? 'rd' : 'th';
  return `${seed}${suffix} Seed`;
}

function buildSummary(
  outcome: PlayoffOutcome,
  analysis: RosterAnalysis,
  wins: number,
  seed: number | null,
): string {
  const eliteStarters = analysis.starterPower >= 0.72;
  const weakBench = analysis.benchPower < 0.48;
  const deepBench = analysis.benchPower >= 0.58;
  const balanced = analysis.balance > 0 && analysis.starterPower - analysis.benchPower < 0.25;

  if (outcome === 'NBA Champions') {
    return 'A complete roster with star power and depth sustained elite performance through the playoffs and delivered a championship run.';
  }

  if (outcome === 'NBA Finals') {
    return 'The franchise reached the Finals on the strength of its core, but fell just short against the conference\'s best.';
  }

  if (outcome === 'Conference Finals') {
    if (eliteStarters && weakBench) {
      return 'A star-driven starting unit powered a deep playoff push, though the bench was exposed against top-tier competition.';
    }
    return 'Strong regular-season form translated into a conference finals appearance, establishing this roster as a legitimate contender.';
  }

  if (outcome === 'Conference Semifinals') {
    if (balanced) {
      return 'Balanced roster construction produced a solid season and a competitive second-round showing in the postseason.';
    }
    return 'The team exceeded expectations in the playoffs before running into a more complete opponent in the second round.';
  }

  if (outcome === 'First-Round Exit') {
    if (eliteStarters && weakBench) {
      return 'An elite starting lineup carried the franchise to a strong regular season, although limited bench depth prevented the team from becoming the conference\'s top seed.';
    }
    return 'A respectable regular season earned a playoff berth, but the roster lacked the firepower to advance beyond the opening round.';
  }

  if (outcome === 'Play-In Elimination') {
    return 'The roster hovered around the play-in threshold all season and came up short in a win-or-go-home scenario.';
  }

  if (wins >= 24 && eliteStarters) {
    return 'Star talent kept the team competitive, but roster holes and inconsistent depth kept the franchise out of the postseason picture.';
  }

  return 'Limited talent and roster imbalance led to a difficult regular season, leaving the franchise with significant work to do in the offseason.';
}

function tierCountsBonus(analysis: RosterAnalysis): number {
  return analysis.tierCounts.S * 0.35 + analysis.tierCounts.A * 0.2;
}

export function simulateSeason(data: FranchiseData): SeasonSimulationResult | null {
  if (!isRosterCompleteForSimulation(data)) return null;

  const analysis = analyzeRoster(data);
  if (!analysis) return null;

  const lineupIds = [
    ...data.startingFive.filter((id): id is string => id !== null),
    ...data.bench.filter((id): id is string => id !== null),
  ];
  const rand = mulberry32(hashIds(lineupIds) + Date.now());

  const power = Math.max(0.08, Math.min(0.98, analysis.overallPower));
  const expectedWins = 15 + power * 53;
  const baseWinRate = expectedWins / 82;

  let wins = 0;
  for (let g = 0; g < 82; g++) {
    const gameVariance = (rand() - 0.5) * 0.18;
    const gameWinProb = Math.max(0.06, Math.min(0.94, baseWinRate + gameVariance));
    if (rand() < gameWinProb) wins += 1;
  }

  const minWins = Math.round(15 + power * 8);
  const maxWins = Math.round(30 + power * 38);
  wins = Math.max(minWins, Math.min(maxWins, wins));
  wins = Math.max(15, Math.min(68, wins));
  const losses = 82 - wins;

  const netRating = 95 + power * 28 + (rand() - 0.5) * 4;
  const offensiveRating = Math.round(netRating + analysis.offensive * 0.35 + (rand() - 0.5) * 3);
  const defensiveRating = Math.round(118 - power * 18 + analysis.defensive * 0.2 + (rand() - 0.5) * 3);

  const conferenceSeed = deriveSeed(wins, rand);
  const seedLabel = formatSeedLabel(conferenceSeed);
  const playoffResult = derivePlayoffOutcome(wins, power, rand);

  const playoffProbability = Math.round(
    Math.max(1, Math.min(97, Math.pow(wins / 82, 1.4) * 88 + tierCountsBonus(analysis) * 6 + analysis.chemistry * 8)),
  );

  const { strength, weakness } = deriveStrengthWeakness(analysis);
  const chemistryGrade = chemistryToGrade(analysis.chemistry);

  return {
    wins,
    losses,
    record: `${wins}–${losses}`,
    conferenceSeed,
    seedLabel,
    playoffResult,
    offensiveRating,
    defensiveRating,
    chemistryScore: analysis.chemistry,
    chemistryGrade,
    seasonGrade: winsToSeasonGrade(wins, power),
    teamGrade: powerToGrade(power),
    playoffProbability,
    summary: buildSummary(playoffResult, analysis, wins, conferenceSeed),
    biggestStrength: strength,
    biggestWeakness: weakness,
  };
}

/** Interpolate live preview stats during the simulation animation. */
export function interpolateSimStats(
  result: SeasonSimulationResult,
  progress: number,
  noiseSeed: number,
): {
  projectedWins: number;
  projectedLosses: number;
  offensiveRating: number;
  defensiveRating: number;
  chemistry: number;
  playoffProbability: number;
} {
  const t = Math.max(0, Math.min(1, progress));
  const ease = 1 - Math.pow(1 - t, 2.2);
  const rand = mulberry32(noiseSeed + Math.floor(t * 40));
  const wobble = (1 - ease) * (rand() - 0.5);

  const baseWins = 41 + (result.wins - 41) * 0.15;
  const wins = Math.round(baseWins + (result.wins - baseWins) * ease + wobble * 6);
  const clampedWins = Math.max(0, Math.min(82, wins));

  const baseOff = result.offensiveRating - 6;
  const baseDef = result.defensiveRating + 5;
  const baseChem = result.chemistryScore * 0.85;
  const baseProb = result.playoffProbability * 0.6;

  return {
    projectedWins: clampedWins,
    projectedLosses: 82 - clampedWins,
    offensiveRating: Math.round(baseOff + (result.offensiveRating - baseOff) * ease + wobble * 4),
    defensiveRating: Math.round(baseDef + (result.defensiveRating - baseDef) * ease + wobble * 4),
    chemistry: Math.round((baseChem + (result.chemistryScore - baseChem) * ease + wobble * 0.06) * 100),
    playoffProbability: Math.round(baseProb + (result.playoffProbability - baseProb) * ease + wobble * 8),
  };
}

export function messageIndexForProgress(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return Math.min(SIM_MESSAGES.length - 1, Math.floor(t * SIM_MESSAGES.length));
}

export function gameMilestoneForProgress(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  if (t < 0.2) return 1;
  if (t < 0.4) return 20;
  if (t < 0.6) return 41;
  if (t < 0.85) return 60;
  return 82;
}
