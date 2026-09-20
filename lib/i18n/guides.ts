import type { Locale } from './messages';

export type GuideId = 'how-to-play' | 'how-values-work';

export type GuideStep = {
  n: string;
  title: string;
  line: string;
};

export type GuideMode = {
  mark: string;
  title: string;
  line: string;
};

export type GuideFact = {
  title: string;
  line: string;
};

export type TierRow = {
  tier: string;
  label: string;
  range: string;
  blurb: string;
};

export type GuidePageContent = {
  title: string;
  kicker: string;
  tagline: string;
  steps?: GuideStep[];
  modes?: GuideMode[];
  tips?: string[];
  /** Short pricing copy for How Values Work (replaces fact cards). */
  pricing?: string;
  facts?: GuideFact[];
  tiers?: TierRow[];
  closing?: string;
};

const HOW_TO_PLAY_EN: GuidePageContent = {
  kicker: 'GUIDE',
  title: 'How to Play',
  tagline: 'Fill five seats. Stack value. Clear $1 billion.',
  steps: [
    { n: '01', title: 'Roll', line: 'Spin a franchise and decade.' },
    { n: '02', title: 'Pick', line: 'Choose one player from that roster.' },
    { n: '03', title: 'Seat', line: 'Tap an open circle they can play.' },
    { n: '04', title: 'Hit $1B', line: 'Lock five. Values reveal and add up.' },
  ],
  modes: [
    {
      mark: '$1B',
      title: 'Classic',
      line: 'Solo run — draft five and chase the billion.',
    },
    {
      mark: '1v1',
      title: 'Head to Head',
      line: 'Draft against a rival. Higher total wins.',
    },
  ],
};

const HOW_VALUES_EN: GuidePageContent = {
  kicker: 'ECONOMY',
  title: 'How Values Work',
  tagline: 'Every player has a tier. Higher tier, higher dollars.',
  pricing:
    'In 1B Run, a player’s value is based on their peak in that decade. At their primary position they keep full value; anywhere else, they’re worth 6% less.',
  tiers: [
    { tier: 'F', label: 'F', range: '$3M – $12M', blurb: 'Bench' },
    { tier: 'D', label: 'D', range: '$13M – $28M', blurb: 'Rotation' },
    { tier: 'C', label: 'C', range: '$29M – $72M', blurb: 'Starter' },
    { tier: 'B', label: 'B', range: '$73M – $110M', blurb: 'Strong starter' },
    { tier: 'A', label: 'A', range: '$111M – $165M', blurb: 'Star' },
    { tier: 'S', label: 'S', range: '$166M – $199M', blurb: 'Superstar' },
    { tier: 'GOAT', label: 'GOAT', range: '$200M – $210M', blurb: 'All-time peaks' },
  ],
};

const HOW_TO_PLAY_ES: GuidePageContent = {
  kicker: 'GUÍA',
  title: 'Cómo jugar',
  tagline: 'Llena cinco asientos. Suma valor. Llega a mil millones.',
  steps: [
    { n: '01', title: 'Gira', line: 'Gira una franquicia y una década.' },
    { n: '02', title: 'Elige', line: 'Escoge un jugador de ese roster.' },
    { n: '03', title: 'Sienta', line: 'Toca un círculo abierto que pueda jugar.' },
    { n: '04', title: 'Llega a $1B', line: 'Cierra cinco. Los valores se revelan y suman.' },
  ],
  modes: [
    {
      mark: '$1B',
      title: 'Clásica',
      line: 'Carrera en solitario — draftea cinco y apunta al billón.',
    },
    {
      mark: '1v1',
      title: 'Cara a cara',
      line: 'Draftea contra un rival. Gana el total más alto.',
    },
  ],
};

const HOW_VALUES_ES: GuidePageContent = {
  kicker: 'ECONOMÍA',
  title: 'Cómo funcionan los valores',
  tagline: 'Cada jugador tiene un tier. Más alto = más dólares.',
  pricing:
    'En 1B Run, el valor de un jugador se basa en su pico en esa década. En su posición principal conserva el valor completo; en cualquier otra, vale un 6% menos.',
  tiers: [
    { tier: 'F', label: 'F', range: '$3M – $12M', blurb: 'Banquillo' },
    { tier: 'D', label: 'D', range: '$13M – $28M', blurb: 'Rotación' },
    { tier: 'C', label: 'C', range: '$29M – $72M', blurb: 'Titular' },
    { tier: 'B', label: 'B', range: '$73M – $110M', blurb: 'Titular fuerte' },
    { tier: 'A', label: 'A', range: '$111M – $165M', blurb: 'Estrella' },
    { tier: 'S', label: 'S', range: '$166M – $199M', blurb: 'Superestrella' },
    { tier: 'GOAT', label: 'GOAT', range: '$200M – $210M', blurb: 'Picos históricos' },
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
    back: string;
    guidesLabel: string;
    tierRanges: string;
    stepsLabel: string;
    modesLabel: string;
    tipsLabel: string;
    factsLabel: string;
  }
> = {
  en: {
    howToPlay: 'How to Play',
    howValues: 'How Values Work',
    back: 'Back',
    guidesLabel: 'Guides',
    tierRanges: 'Tier ranges',
    stepsLabel: 'The run',
    modesLabel: 'Modes',
    tipsLabel: 'Keep in mind',
    factsLabel: 'Pricing',
  },
  es: {
    howToPlay: 'Cómo jugar',
    howValues: 'Cómo funcionan los valores',
    back: 'Atrás',
    guidesLabel: 'Guías',
    tierRanges: 'Rangos por tier',
    stepsLabel: 'La carrera',
    modesLabel: 'Modos',
    tipsLabel: 'Ten en cuenta',
    factsLabel: 'Precios',
  },
};
