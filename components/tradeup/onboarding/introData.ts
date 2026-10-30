import {
  OFF_PRIMARY_SLOT_VALUE_FACTOR,
  resolveAuthoritativePlayerValue,
  type DecadeEra,
} from '@/lib/tradeup/billionDollar';
import {
  DECADE_ERAS,
  decadePlayerToTradePlayer,
  getDecadeRoster,
  getHistPlayerById,
  teamsForEra,
} from '@/lib/tradeup/decadeRosters';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import type { HubCardPlayer } from '../DraftHubCards';
import type { Copy } from './onboardingCopy';

export const GOAL = 1_000_000_000;
/** Meter runs a little past the goal so the $1B tick sits inside the track. */
export const METER_SCALE = 1_100_000_000;

/** A real database card used in the guided demo. Never touches saved runs, Bank, or achievements. */
export interface IntroPlayer extends TradePlayer {
  era: DecadeEra;
  /** Authoritative price at the primary position. */
  base: number;
  statLine: string;
}

function statLineOf(stats: TradePlayer['stats']): string {
  return `${stats.ppg.toFixed(1)} PTS · ${stats.rpg.toFixed(1)} REB · ${stats.apg.toFixed(1)} AST`;
}

function eraOf(id: string): DecadeEra {
  return (/^hist_(\d{4}s)_/.exec(id)?.[1] ?? '2000s') as DecadeEra;
}

/** Real card + real price. The demo lineup is chosen so these land on exactly $1,005,000,000. */
function legend(id: string): IntroPlayer {
  const card = getHistPlayerById(id);
  if (!card) throw new Error(`[intro] missing demo card ${id}`);
  return {
    ...card,
    era: eraOf(id),
    base: resolveAuthoritativePlayerValue(card),
    statLine: statLineOf(card.stats),
  };
}

export const MAGIC = legend('hist_1980s_LAL_magic_johnson');
export const DIRK = legend('hist_2010s_DAL_dirk_nowitzki');
export const EWING = legend('hist_1990s_NYK_patrick_ewing');
/** SG primary, SF alternate — the position lesson. */
export const KOBE = legend('hist_2000s_LAL_kobe_bryant');
/** Closes the lineup at SF. */
export const LEBRON = legend('hist_2000s_CLE_lebron_james');

/** Same seated-price rule as Classic: full price at primary, 3% off at an eligible alternate. */
export function seatedValue(player: IntroPlayer, slot: Position): number {
  if (player.primaryPosition === slot) return player.base;
  return Math.round((player.base * OFF_PRIMARY_SLOT_VALUE_FACTOR) / 1_000_000) * 1_000_000;
}

export function seat(player: IntroPlayer, slot: Position): HubCardPlayer {
  return { ...player, dollarValue: seatedValue(player, slot), era: player.era };
}

export type IntroSlots = Record<Position, HubCardPlayer | null>;

export const INITIAL_SLOTS: IntroSlots = {
  PG: seat(MAGIC, 'PG'),
  SG: null,
  SF: null,
  PF: seat(DIRK, 'PF'),
  C: seat(EWING, 'C'),
};

/** Final demo team value: preset three + Kobe at SG + LeBron at SF. */
export const DEMO_TEAM_VALUE =
  MAGIC.base + DIRK.base + EWING.base + seatedValue(KOBE, 'SG') + seatedValue(LEBRON, 'SF');

export const DRAWS: Record<'kobe' | 'lebron', { teamLabel: string; teamId: string; era: string }> = {
  kobe: { teamLabel: 'LAKERS', teamId: 'LAL', era: '00s' },
  lebron: { teamLabel: 'CAVALIERS', teamId: 'CLE', era: '00s' },
};

export interface ShowcaseLegend {
  id: string;
  name: string;
  teamId: string;
  era: DecadeEra;
  position: Position;
  value: number;
}

let showcaseCache: ShowcaseLegend[] | null = null;

/** The highest-priced legends in the live database — one card per player. */
export function topLegends(count = 8): ShowcaseLegend[] {
  if (showcaseCache && showcaseCache.length >= count) return showcaseCache.slice(0, count);
  const best = new Map<string, ShowcaseLegend & { rating: number }>();
  for (const era of DECADE_ERAS) {
    for (const team of teamsForEra(era)) {
      for (const row of getDecadeRoster(team.id, era)) {
        const card = decadePlayerToTradePlayer(row, team.id, era);
        const value = resolveAuthoritativePlayerValue(card);
        const prev = best.get(card.name);
        if (prev && (prev.value > value || (prev.value === value && prev.rating >= card.tradeValue))) continue;
        best.set(card.name, {
          id: card.id,
          name: card.name,
          teamId: team.id,
          era,
          position: card.primaryPosition,
          value,
          rating: card.tradeValue,
        });
      }
    }
  }
  showcaseCache = [...best.values()]
    .sort((a, b) => b.value - a.value || b.rating - a.rating || a.name.localeCompare(b.name))
    .slice(0, Math.max(count, 8))
    .map(({ rating: _rating, ...legendRow }) => legendRow);
  return showcaseCache.slice(0, count);
}

export type IntroPhase = 'welcome' | 'build' | 'position' | 'cross' | 'victory';

/** Three moments: meet the legends → draft to $1B → bank everything over it. */
export const MOMENT: Record<IntroPhase, number> = {
  welcome: 0,
  build: 1,
  position: 1,
  cross: 1,
  victory: 2,
};

export const HEADLINES: Record<IntroPhase, Copy> = {
  welcome: { en: 'WELCOME TO 1B RUN', es: 'BIENVENIDO A 1B RUN' },
  build: { en: 'BUILD YOUR FIVE', es: 'ARMA TU QUINTETO' },
  position: { en: 'POSITION MATTERS', es: 'LA POSICIÓN IMPORTA' },
  cross: { en: 'CROSS $1 BILLION', es: 'SUPERA LOS $1,000 MILLONES' },
  victory: { en: 'YOU BUILT A $1B TEAM', es: 'ARMASTE UN EQUIPO DE $1B' },
};

export const SUBLINES: Record<IntroPhase, Copy> = {
  welcome: {
    en: 'Each player has their own unique value.',
    es: 'Cada jugador tiene su propio valor único.',
  },
  build: { en: 'Draft five legends. Cross $1,000,000,000.', es: 'Elige cinco leyendas. Supera $1,000,000,000.' },
  position: {
    en: 'Off-position players lose 3% of their value.',
    es: 'Fuera de su posición, un jugador pierde 3% de su valor.',
  },
  cross: { en: 'Five values add up. Finish the lineup.', es: 'Los cinco valores se suman. Completa el quinteto.' },
  victory: {
    en: 'Every dollar above $1 billion goes straight to your Bank.',
    es: 'Cada dólar por encima de $1,000 millones va directo a tu Banco.',
  },
};

/** Big on-court direction: lead text + highlighted destination. */
export interface Direction {
  lead: Copy;
  to: Copy;
}

export const DIRECTIONS: Record<'kobeSf' | 'kobeSg' | 'lebronSf', Direction> = {
  kobeSf: {
    lead: { en: 'Drag or tap Kobe to', es: 'Arrastra o toca a Kobe hacia' },
    to: { en: 'small forward', es: 'alero (SF)' },
  },
  kobeSg: {
    lead: { en: 'Now move Kobe to', es: 'Ahora mueve a Kobe a' },
    to: { en: 'shooting guard', es: 'escolta (SG)' },
  },
  lebronSf: {
    lead: { en: 'Drag or tap LeBron to', es: 'Arrastra o toca a LeBron hacia' },
    to: { en: 'small forward', es: 'alero (SF)' },
  },
};

export const HINTS = {
  startAtSf: { en: 'Start him at small forward', es: 'Empieza en alero (SF)' },
  notEligible: { en: 'He can’t play there', es: 'No puede jugar ahí' },
} satisfies Record<string, Copy>;

export const LABELS = {
  teamValue: { en: 'Team value', es: 'Valor del equipo' },
  billionTeam: { en: '$1B TEAM', es: 'EQUIPO $1B' },
  primary: { en: 'PRIMARY · 100%', es: 'PRINCIPAL · 100%' },
  alternate: { en: 'ALTERNATE · −3%', es: 'ALTERNA · −3%' },
  place: { en: 'Place {name} at {slot}', es: 'Colocar a {name} en {slot}' },
} satisfies Record<string, Copy>;

export const WELCOME = {
  heading: { en: 'MOST VALUABLE LEGENDS', es: 'LEYENDAS MÁS VALIOSAS' },
  line: { en: 'Draft five. Cross $1,000,000,000.', es: 'Elige cinco. Supera $1,000,000,000.' },
  cta: { en: 'DRAFT YOUR FIVE', es: 'ARMA TU QUINTETO' },
} satisfies Record<string, Copy>;

/** After the demo crosses $1B. Practice only — nothing is credited or debited. */
export const FINISH = {
  over: { en: '{amount} OVER $1B', es: '{amount} SOBRE $1B' },
  start: { en: 'GET STARTED', es: 'EMPEZAR' },
} satisfies Record<string, Copy>;
