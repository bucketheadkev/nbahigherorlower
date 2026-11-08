import type { PlayerTier } from '@/lib/tradeup/tiers';
import type { Locale } from './messages';

export type GuideId = 'how-to-play' | 'how-values-work';

export type GuideIcon =
  | 'spin'
  | 'pick'
  | 'place'
  | 'move'
  | 'value'
  | 'rollover'
  | 'bonus'
  | 'achievement'
  | 'franchise'
  | 'leaderboard'
  | 'wall';

export type GuideRow = { icon: GuideIcon; title: string; line: string };

/** Worked examples drawn from real cards and the game's own pricing. */
export type GuideExample = 'versions' | 'position' | 'rollover';

export type GuideSection =
  | { kind: 'steps'; label: string; items: GuideRow[] }
  | { kind: 'list'; label: string; items: GuideRow[] }
  | { kind: 'example'; label: string; title: string; line: string; example: GuideExample }
  | { kind: 'modes'; label: string; items: { mark: string; title: string; line: string }[] }
  | { kind: 'tiers'; label: string; note: string; blurbs: Record<PlayerTier, string> };

export type GuidePageContent = {
  kicker: string;
  title: string;
  tagline: string;
  sections: GuideSection[];
};

const HOW_TO_PLAY_EN: GuidePageContent = {
  kicker: 'GUIDE',
  title: 'How to Play',
  tagline: 'Draft 5 NBA players. Reach $1,000,000,000.',
  sections: [
    {
      kind: 'steps',
      label: 'The draft',
      items: [
        { icon: 'spin', title: 'Spin', line: 'Tap SPIN. The reels land on an NBA team and an era.' },
        { icon: 'pick', title: 'Pick a player', line: 'Choose one player from that roster in the player sheet.' },
        { icon: 'place', title: 'Tap a jersey', line: 'Seat your player at an open position on the court.' },
        { icon: 'move', title: 'Move or swap', line: 'Tap a placed player, then another jersey to move or swap.' },
        { icon: 'value', title: 'See your value', line: 'Fill all five seats and your team value adds up.' },
      ],
    },
    {
      kind: 'list',
      label: 'Build your Bank',
      items: [
        { icon: 'rollover', title: 'Rollover', line: 'Every dollar above $1,000,000,000 goes into your Bank.' },
        { icon: 'bonus', title: 'Run Bonuses', line: 'Complete the bonus challenge on a run for extra cash.' },
        { icon: 'achievement', title: 'Achievements', line: 'Hit milestones to earn more.' },
        { icon: 'leaderboard', title: 'Leaderboard', line: 'Players are ranked by Bank balance.' },
        { icon: 'wall', title: 'Wall of Fame', line: 'Reach a $1,000,000,000 Bank to join it.' },
      ],
    },
    {
      kind: 'modes',
      label: 'Modes',
      items: [
        { mark: '$1B', title: 'Classic Run', line: 'Solo draft. Reach $1,000,000,000.' },
        { mark: '1V1', title: 'Head to Head', line: 'Draft against a rival. Higher total wins.' },
        { mark: '5/5', title: 'Dynasty Road', line: 'Sign one player from every $1B Classic run. Collect each title team’s starting five.' },
      ],
    },
  ],
};

const HOW_VALUES_EN: GuidePageContent = {
  kicker: 'ECONOMY',
  title: 'How Values Work',
  tagline: 'Every player is priced by who they were on that team, in that era.',
  sections: [
    {
      kind: 'example',
      label: 'Team + era',
      title: 'Same player. Different value.',
      line: 'Each team and era gives a player his own price, set by how he performed there.',
      example: 'versions',
    },
    {
      kind: 'example',
      label: 'Position',
      title: 'Every position he plays = full value.',
      line: 'Seat a player at any position he is eligible for and he keeps his full value.',
      example: 'position',
    },
    {
      kind: 'example',
      label: 'Team value',
      title: 'Five values. One total.',
      line: 'Clear $1,000,000,000 and everything above it rolls into your Bank.',
      example: 'rollover',
    },
    {
      kind: 'tiers',
      label: 'Tier ranges',
      note: 'Low to high',
      blurbs: {
        F: 'Bench',
        D: 'Rotation',
        C: 'Starter',
        B: 'Strong starter',
        A: 'Star',
        S: 'Superstar',
        GOAT: 'All-time peaks',
      },
    },
  ],
};

const HOW_TO_PLAY_ES: GuidePageContent = {
  kicker: 'GUÍA',
  title: 'Cómo jugar',
  tagline: 'Draftea 5 jugadores NBA. Llega a $1,000,000,000.',
  sections: [
    {
      kind: 'steps',
      label: 'El draft',
      items: [
        { icon: 'spin', title: 'Gira', line: 'Toca GIRAR. Los rodillos marcan un equipo NBA y una era.' },
        { icon: 'pick', title: 'Elige un jugador', line: 'Escoge un jugador de ese roster en la lista.' },
        { icon: 'place', title: 'Toca una camiseta', line: 'Coloca a tu jugador en una posición libre de la cancha.' },
        { icon: 'move', title: 'Mueve o cambia', line: 'Toca un jugador colocado y luego otra camiseta para moverlo o cambiarlo.' },
        { icon: 'value', title: 'Mira tu valor', line: 'Llena los cinco puestos y se suma el valor del equipo.' },
      ],
    },
    {
      kind: 'list',
      label: 'Haz crecer tu Banco',
      items: [
        { icon: 'rollover', title: 'Excedente', line: 'Cada dólar por encima de $1,000,000,000 va a tu Banco.' },
        { icon: 'bonus', title: 'Bonos de partida', line: 'Cumple el reto de bono de una partida para ganar más.' },
        { icon: 'achievement', title: 'Logros', line: 'Alcanza hitos para ganar más.' },
        { icon: 'leaderboard', title: 'Clasificación', line: 'Los jugadores se ordenan por saldo del Banco.' },
        { icon: 'wall', title: 'Muro de la Fama', line: 'Llega a $1,000,000,000 en tu Banco para entrar.' },
      ],
    },
    {
      kind: 'modes',
      label: 'Modos',
      items: [
        { mark: '$1B', title: 'Partida clásica', line: 'Draft en solitario. Llega a $1,000,000,000.' },
        { mark: '1V1', title: 'Cara a cara', line: 'Draftea contra un rival. Gana el total más alto.' },
        { mark: '5/5', title: 'Ruta de Dinastías', line: 'Ficha a un jugador en cada partida Clásica de $1B. Colecciona el quinteto de cada campeón.' },
      ],
    },
  ],
};

const HOW_VALUES_ES: GuidePageContent = {
  kicker: 'ECONOMÍA',
  title: 'Cómo funcionan los valores',
  tagline: 'Cada jugador vale según quién fue en ese equipo y en esa era.',
  sections: [
    {
      kind: 'example',
      label: 'Equipo + era',
      title: 'Mismo jugador. Distinto valor.',
      line: 'Cada equipo y era le da a un jugador su propio precio, según cómo rindió allí.',
      example: 'versions',
    },
    {
      kind: 'example',
      label: 'Posición',
      title: 'Cada posición que juega = valor completo.',
      line: 'Colócalo en cualquier posición en la que puede jugar y conserva su valor completo.',
      example: 'position',
    },
    {
      kind: 'example',
      label: 'Valor del equipo',
      title: 'Cinco valores. Un total.',
      line: 'Supera $1,000,000,000 y todo lo que pase de ahí va a tu Banco.',
      example: 'rollover',
    },
    {
      kind: 'tiers',
      label: 'Rangos por tier',
      note: 'De menor a mayor',
      blurbs: {
        F: 'Banquillo',
        D: 'Rotación',
        C: 'Titular',
        B: 'Titular fuerte',
        A: 'Estrella',
        S: 'Superestrella',
        GOAT: 'Picos históricos',
      },
    },
  ],
};

const GUIDES: Record<Locale, Record<GuideId, GuidePageContent>> = {
  en: {
    'how-to-play': HOW_TO_PLAY_EN,
    'how-values-work': HOW_VALUES_EN,
  },
  es: {
    'how-to-play': HOW_TO_PLAY_ES,
    'how-values-work': HOW_VALUES_ES,
  },
};

export function getGuideContent(locale: Locale, id: GuideId): GuidePageContent {
  return GUIDES[locale][id] ?? GUIDES.en[id];
}

export const GUIDE_NAV: Record<
  Locale,
  {
    howToPlay: string;
    howValues: string;
    replayIntro: string;
    back: string;
    guidesLabel: string;
    teamValue: string;
    goal: string;
    toBank: string;
    fullValue: string;
  }
> = {
  en: {
    howToPlay: 'How to Play',
    howValues: 'How Values Work',
    replayIntro: 'Replay Intro',
    back: 'Back',
    guidesLabel: 'Guides',
    teamValue: 'Team value',
    goal: 'Goal',
    toBank: 'To your Bank',
    fullValue: 'Full value',
  },
  es: {
    howToPlay: 'Cómo jugar',
    howValues: 'Cómo funcionan los valores',
    replayIntro: 'Ver la intro',
    back: 'Atrás',
    guidesLabel: 'Guías',
    teamValue: 'Valor del equipo',
    goal: 'Meta',
    toBank: 'A tu Banco',
    fullValue: 'Valor completo',
  },
};
