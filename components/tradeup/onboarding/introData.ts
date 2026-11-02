import {
  BILLION_GOAL,
  getDollarValueForSlot,
  listValidSpinPairs,
  resolveAuthoritativePlayerValue,
  type DecadeEra,
  type EraOfferPlayer,
  type SpinPair,
  type ValuedPlayer,
} from '@/lib/tradeup/billionDollar';
import { getHistPlayerById } from '@/lib/tradeup/decadeRosters';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import type { Copy } from './onboardingCopy';

/**
 * Tutorial data: real database cards and the game's own pricing. Nothing here is saved,
 * credited or counted — the tutorial is a practice demo.
 */

export const GOAL = BILLION_GOAL;

export interface IntroPlayer extends TradePlayer {
  era: DecadeEra;
  /** Authoritative price at the primary position. */
  base: number;
}

function eraOf(id: string): DecadeEra {
  return (/^hist_(\d{4}s)_/.exec(id)?.[1] ?? '2000s') as DecadeEra;
}

function legend(id: string): IntroPlayer {
  const card = getHistPlayerById(id);
  if (!card) throw new Error(`[intro] missing demo card ${id}`);
  return { ...card, era: eraOf(id), base: resolveAuthoritativePlayerValue(card) };
}

/** Same player, two team/era versions — the valuation example. */
export const LEBRON = legend('hist_2000s_CLE_lebron_james');
export const LEBRON_LAL = legend('hist_2020s_LAL_lebron_james');

/** The interactive pick: primary SG, can also play SF. */
export const KOBE = legend('hist_2000s_LAL_kobe_bryant');

export const MAGIC = legend('hist_1980s_LAL_magic_johnson');
export const DIRK = legend('hist_2000s_DAL_dirk_nowitzki');
export const EWING = legend('hist_1990s_NYK_patrick_ewing');

/** The game's seated price: full at the primary position, 3% off anywhere else. */
export function seatedValue(player: TradePlayer, slot: Position): number {
  return getDollarValueForSlot(player, slot);
}

export function seat(player: IntroPlayer, slot: Position): ValuedPlayer & { era: DecadeEra } {
  return { ...player, dollarValue: seatedValue(player, slot), era: player.era };
}

export type IntroSlots = Record<Position, (ValuedPlayer & { era?: DecadeEra }) | null>;

export const EMPTY_SLOTS: IntroSlots = { PG: null, SG: null, SF: null, PF: null, C: null };

/** The practice five for the final stage — Kobe at his primary position. */
export const FINAL_FIVE: Array<[IntroPlayer, Position]> = [
  [MAGIC, 'PG'],
  [KOBE, 'SG'],
  [LEBRON, 'SF'],
  [DIRK, 'PF'],
  [EWING, 'C'],
];

export const FINAL_SLOTS: IntroSlots = Object.fromEntries(
  FINAL_FIVE.map(([player, slot]) => [slot, seat(player, slot)]),
) as IntroSlots;

export const FINAL_TOTAL = FINAL_FIVE.reduce((sum, [player, slot]) => sum + seatedValue(player, slot), 0);

/** The spin always lands on Kobe's Lakers decade. */
export function kobeSpinPair(): SpinPair {
  const pair = listValidSpinPairs().find((p) => p.team.id === 'LAL' && p.era === KOBE.era);
  if (!pair) throw new Error('[intro] missing LAL spin pair');
  return pair;
}

/** Kobe first, then a few real teammates from the same board so the list looks like Classic. */
export function kobeBoard(board: EraOfferPlayer[]): EraOfferPlayer[] {
  const kobe = board.find((p) => p.id === KOBE.id);
  if (!kobe) return board.slice(0, 5);
  return [kobe, ...board.filter((p) => p.id !== KOBE.id).slice(0, 4)];
}

/** Top of the screen: one heading and one supporting sentence per step. */
export interface Instruction {
  title: Copy;
  line: Copy;
}

export const STEPS = {
  goal: {
    title: { en: 'CAN YOU BUILD A $1 BILLION TEAM?', es: '¿PUEDES ARMAR UN EQUIPO DE $1,000 MILLONES?' },
    line: { en: 'Draft 5 NBA players. Reach $1 billion.', es: 'Elige 5 jugadores de la NBA. Llega a $1,000 millones.' },
  },
  values: {
    title: { en: 'SAME PLAYER. DIFFERENT VALUE.', es: 'MISMO JUGADOR. OTRO VALOR.' },
    line: {
      en: 'Every team and era gives a player his own in-game value.',
      es: 'Cada equipo y época le da a un jugador su propio valor en el juego.',
    },
  },
  spin: {
    title: { en: 'SPIN FOR YOUR PLAYERS', es: 'GIRA POR TUS JUGADORES' },
    line: {
      en: 'Spin for a team and era to discover your available players.',
      es: 'Gira por un equipo y una época para descubrir tus jugadores.',
    },
  },
  place: {
    title: { en: 'PLACE YOUR PLAYER', es: 'COLOCA A TU JUGADOR' },
    line: {
      en: 'Select Kobe Bryant and place him at small forward.',
      es: 'Elige a Kobe Bryant y colócalo de alero (SF).',
    },
  },
  penalty: {
    title: { en: 'POSITION MATTERS', es: 'LA POSICIÓN IMPORTA' },
    line: {
      en: 'Playing outside a primary position reduces a player’s value by 3%.',
      es: 'Jugar fuera de su posición principal reduce el valor de un jugador un 3%.',
    },
  },
  moveSg: {
    title: { en: 'POSITION MATTERS', es: 'LA POSICIÓN IMPORTA' },
    line: {
      en: 'Move Kobe to shooting guard to restore his full value.',
      es: 'Mueve a Kobe a escolta (SG) para recuperar su valor completo.',
    },
  },
  restored: {
    title: { en: 'FULL VALUE', es: 'VALOR COMPLETO' },
    line: { en: 'At his primary position, Kobe is worth 100%.', es: 'En su posición principal, Kobe vale el 100%.' },
  },
  fill: {
    title: { en: 'LET’S COMPLETE YOUR TEAM.', es: 'COMPLETEMOS TU EQUIPO.' },
    line: {
      en: 'We’ve filled the other four positions for this practice run.',
      es: 'Llenamos las otras cuatro posiciones para esta práctica.',
    },
  },
  result: {
    title: { en: 'BEAT $1B. BUILD YOUR BANK.', es: 'SUPERA $1B. HAZ CRECER TU BANCO.' },
    line: { en: 'Every dollar above $1B goes into your Bank.', es: 'Cada dólar por encima de $1B va a tu Banco.' },
  },
  bank: {
    title: { en: 'BEAT $1B. BUILD YOUR BANK.', es: 'SUPERA $1B. HAZ CRECER TU BANCO.' },
    line: { en: 'Earn more through Run Bonuses and achievements.', es: 'Gana más con Bonos de partida y logros.' },
  },
  done: {
    title: { en: 'PRACTICE COMPLETE!', es: '¡PRÁCTICA COMPLETA!' },
    line: {
      en: 'You’ve learned the basics. Now build your own $1 billion team.',
      es: 'Ya sabes lo básico. Ahora arma tu propio equipo de $1,000 millones.',
    },
  },
} satisfies Record<string, Instruction>;

/** Brief replacements for the supporting sentence after a wrong tap. */
export const NUDGES = {
  pickKobe: { en: 'For this practice, select Kobe Bryant.', es: 'En esta práctica, elige a Kobe Bryant.' },
  tapSf: { en: 'Tap the glowing SF jersey.', es: 'Toca la camiseta SF que brilla.' },
  tapKobe: { en: 'Tap Kobe’s jersey to pick him up.', es: 'Toca la camiseta de Kobe para moverlo.' },
  tapSg: { en: 'Now tap the glowing SG jersey.', es: 'Ahora toca la camiseta SG que brilla.' },
} satisfies Record<string, Copy>;

export const BUTTONS = {
  showMe: { en: 'SHOW ME HOW', es: 'MUÉSTRAME' },
  continue: { en: 'CONTINUE', es: 'CONTINUAR' },
  spin: { en: 'SPIN', es: 'GIRAR' },
  evaluate: { en: 'SEE TEAM VALUE', es: 'VER VALOR DEL EQUIPO' },
  start: { en: 'START MY FIRST RUN', es: 'EMPEZAR MI PRIMERA PARTIDA' },
} satisfies Record<string, Copy>;

export const LABELS = {
  goal: { en: 'GOAL', es: 'META' },
  fullValue: { en: 'FULL VALUE', es: 'VALOR COMPLETO' },
  valueNote: {
    en: 'Set by how he performed for that team in that era — not his real salary.',
    es: 'Según cómo rindió con ese equipo en esa época — no es su salario real.',
  },
  teamValue: { en: 'TEAM VALUE', es: 'VALOR DEL EQUIPO' },
  bankEarned: { en: 'BANK EARNED', es: 'GANADO PARA EL BANCO' },
  yourBank: { en: 'WHAT YOUR BANK DOES', es: 'PARA QUÉ SIRVE TU BANCO' },
  franchises: { en: 'Own Franchises', es: 'Compra Franquicias' },
  leaderboard: { en: 'Climb the leaderboard', es: 'Sube en la clasificación' },
  wall: {
    en: 'Reach $1,000,000,000 in Bank to join the Wall of Fame',
    es: 'Llega a $1,000,000,000 en tu Banco para entrar al Muro de la Fama',
  },
} satisfies Record<string, Copy>;
