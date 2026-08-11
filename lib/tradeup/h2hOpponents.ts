/**
 * Head-to-Head fictional opponent profiles + independent roster generation.
 * Opponent value is locked at matchmaking — never adjusted after the player finishes.
 */

import {
  buildEraRoster,
  getDollarValue,
  listValidSpinPairs,
  type DecadeEra,
  type SpinPair,
} from './billionDollar';
import { playerFitsSlot } from './alternatePositions';
import { LINEUP_POSITIONS } from './startingLineup';
import type { Position, TeamInfo } from './types';

export interface H2HOpponentPlayer {
  name: string;
  position: Position;
  dollarValue: number;
  teamId: string;
}

export interface H2HOpponent {
  id: string;
  displayName: string;
  initials: string;
  accent: string;
  roster: H2HOpponentPlayer[];
  teamValue: number;
}

/** Large pool of fictional in-game display names — not real users. */
export const H2H_DISPLAY_NAMES: readonly string[] = [
  'HoopKing',
  'ClutchTime',
  'Buckets',
  'SixthMan',
  'Fadeaway',
  'BoardMan',
  'FastBreak',
  'IsoJoe',
  'TheGM',
  'DeepThree',
  'RimRunner',
  'CashMoney',
  'LobCity',
  'NoFoul',
  'PostMove',
  'CatchShoot',
  'Dimer',
  'GlassClean',
  'AndOne',
  'CourtVision',
  'MileHigh',
  'SkyHook',
  'EuroStep',
  'PickPop',
  'DnDSpecial',
  'CornerKiller',
  'PaintBeast',
  'Lockdown',
  'HotHand',
  'ColdBlood',
  'Overtime',
  'BuzzerBeater',
  'FloorGeneral',
  'SplashZone',
  'MidRange',
  'Transition',
  'BoxOut',
  'ScreenAssist',
  'ChaseDown',
  'WeakSide',
  'HighPost',
  'LowBlock',
  'OutletPass',
  'Trailer3',
  'Mismatch',
  'SwitchAll',
  'DropCoverage',
  'HedgeHelp',
  'NailHelp',
  'CloseOut',
  'PumpFake',
  'StepBack',
  'Hesitation',
  'Crossover',
  'BehindBack',
  'SpinMove',
  'UpAndUnder',
  'FingerRoll',
  'BankShot',
  'AlleyOop',
  'TipIn',
  'PutBack',
  'OffensiveGlass',
  'DefensiveAce',
  'ChargeTaker',
  'StealArtist',
  'BlockParty',
  'Contest3',
  'PacePush',
  'HalfCourt',
  'TwoForOne',
  'HackA',
  'IceThePnr',
  'BlitzPick',
  'ZoneBuster',
  'TriangleO',
  'MotionMan',
  'IsoKiller',
  'SpacingGod',
  'GravityPull',
  'OffBallCut',
  'Backdoor',
  'FlareScreen',
  'PinDown',
  'SpainPnR',
  'HornsSet',
  'ElbowTouch',
  'DribbleHand',
  'SkipPass',
  'KickOut',
  'DumpDown',
  'SealLow',
  'DuckIn',
  'FaceUp',
  'Turnaround',
  'HookShot',
  'Floater',
  'Runner',
  'PullUp',
  'CatchGo',
  'Relocation',
  'DriftCorner',
  'TrailSpot',
  'GhostCut',
  'SlipScreen',
  'Rescreen',
  'ShortRoll',
  'PopThree',
  'RollDunk',
  'TagTheRoller',
  'StuntRecover',
  'HelpRotate',
  'XOut',
  'SinkIn',
  'ShowAndRecover',
  'SoftHedge',
  'HardHedge',
  'PeakPeak',
  'GreenLight',
  'HeatCheck',
  'IceWater',
  'Microwave',
  'GlueGuy',
  'BenchMob',
  'StarterPack',
  'AllStarGM',
  'CapSpace',
  'TradeMachine',
  'DraftNight',
  'LotteryPick',
  'TwoWayWing',
  'PointForward',
  'StretchFive',
  'SmallBall',
  'TwinTowers',
  'DeathLineup',
  'DynastyRun',
  'TitleTown',
  'ChipChaser',
  'RingCulture',
  'BannerYear',
  'FinalsMVP',
  'DPOY',
  'SixthManAward',
  'MostImproved',
  'ClutchGene',
  'KillerInstinct',
  'SilentAssassin',
  'LoudMoney',
  'SoftMoney',
  'HardFoul',
  'CleanBlock',
  'Posterized',
  'AnkleBreaker',
  'HandleGod',
  'BoardGod',
  'AssistGod',
  'ThreeGod',
  'PaintGod',
  'DefenseFirst',
  'OffenseFirst',
  'TwoWayKing',
  'RolePlayerX',
  'StarMaker',
  'CoachKill',
  'SidelineIQ',
  'TimeoutTactician',
  'InboundMagic',
  'FreeThrowIce',
  'HackAStrategy',
  'FoulTrouble',
  'EarlyFoul',
  'LateGame',
  'FourthQuarter',
  'CrunchTime',
  'MustWin',
  'GameSeven',
  'RoadWarrior',
  'HomeCourt',
  'CrowdNoise',
  'SilentArena',
  'PrimeTime',
  'NationalTV',
  'UnderRadar',
  'SleeperPick',
  'BreakoutStar',
  'VeteranPresence',
  'RookieHeat',
  'SophomoreJump',
  'ContractYear',
  'MaxDeal',
  'BirdRights',
  'SignAndTrade',
  'BuyoutMarket',
  'WaiverWire',
  'GLeagueCall',
  'TwoWayDeal',
  'ExhibitTen',
  'SummerLeague',
  'TrainingCamp',
  'PreseasonDog',
  'RegularSeason',
  'PlayInHero',
  'FirstRound',
  'ConfFinals',
  'BannerChase',
  'LegacyRun',
  'HallFame',
  'BucketGetter',
  'Stopper',
  'Connector',
  'Spacer',
  'Anchor',
  'Engine',
  'SparkPlug',
  'Closer',
  'Opener',
  'Finisher',
];

const ACCENTS = [
  '#1EC9A0',
  '#3D8BFF',
  '#F5A623',
  '#E85D75',
  '#9B7EDE',
  '#4ECDC4',
  '#FF6B6B',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
] as const;

function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function initialsFromName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '');
  if (cleaned.length >= 2) return cleaned.slice(0, 2).toUpperCase();
  return (name.slice(0, 2) || 'HX').toUpperCase();
}

function uniqueTeams(pairs: SpinPair[]): TeamInfo[] {
  const seen = new Set<string>();
  const out: TeamInfo[] = [];
  for (const p of pairs) {
    if (seen.has(p.team.id)) continue;
    seen.add(p.team.id);
    out.push(p.team);
  }
  return out;
}

function erasForTeam(pairs: SpinPair[], teamId: string): DecadeEra[] {
  const seen = new Set<string>();
  const out: DecadeEra[] = [];
  for (const p of pairs) {
    if (p.team.id !== teamId || seen.has(p.era)) continue;
    seen.add(p.era);
    out.push(p.era);
  }
  return out;
}

function pickFairPair(pairs: SpinPair[]): SpinPair {
  const teams = uniqueTeams(pairs);
  const team = teams[Math.floor(Math.random() * teams.length)] ?? pairs[0]!.team;
  const eras = erasForTeam(pairs, team.id);
  const era =
    eras.length > 0
      ? eras[Math.floor(Math.random() * eras.length)]!
      : pairs.find((p) => p.team.id === team.id)?.era ?? '2020s';
  return { team, era };
}

function pickDisplayName(exclude?: string | null): string {
  const pool =
    exclude && H2H_DISPLAY_NAMES.length > 1
      ? H2H_DISPLAY_NAMES.filter((n) => n !== exclude)
      : H2H_DISPLAY_NAMES;
  return pool[Math.floor(Math.random() * pool.length)] ?? 'HoopKing';
}

/**
 * Build a full five independently of the player's run.
 * Uses the same era-roster + dollar-value economy — never peeks at the player total.
 */
export function generateIndependentH2HOpponent(
  excludeName?: string | null,
): H2HOpponent {
  const pairs = listValidSpinPairs();
  const used = new Set<string>();
  const roster: H2HOpponentPlayer[] = [];

  for (const position of LINEUP_POSITIONS) {
    let placed: H2HOpponentPlayer | null = null;
    for (let attempt = 0; attempt < 28 && !placed; attempt += 1) {
      const pair = pickFairPair(pairs);
      let offers: ReturnType<typeof buildEraRoster> = [];
      try {
        offers = buildEraRoster(pair.team, pair.era).filter(
          (p) =>
            playerFitsSlot(p, position) && !used.has(normalizeName(p.name)),
        );
      } catch {
        continue;
      }
      if (offers.length === 0) continue;
      offers.sort((a, b) => getDollarValue(b) - getDollarValue(a));
      // Prefer competitive mid/upper band without always taking the absolute top.
      const band = offers.slice(0, Math.max(2, Math.ceil(offers.length * 0.6)));
      const pick = band[Math.floor(Math.random() * band.length)]!;
      used.add(normalizeName(pick.name));
      placed = {
        name: pick.name,
        position,
        dollarValue: getDollarValue(pick),
        teamId: pick.teamId,
      };
    }
    if (!placed) {
      // Extremely rare fallback — keep slot filled with a minimal stub value.
      placed = {
        name: `Reserve ${position}`,
        position,
        dollarValue: 25_000_000,
        teamId: 'NBA',
      };
    }
    roster.push(placed);
  }

  const displayName = pickDisplayName(excludeName);
  const teamValue = roster.reduce((sum, p) => sum + p.dollarValue, 0);
  const accent = ACCENTS[Math.floor(Math.random() * ACCENTS.length)]!;

  return {
    id: `h2h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    displayName,
    initials: initialsFromName(displayName),
    accent,
    roster,
    teamValue,
  };
}
