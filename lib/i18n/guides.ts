import type { Locale } from './messages';

export type GuideId = 'how-to-play' | 'how-values-work';

export type GuideSection = {
  heading: string;
  body: string[];
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
  intro: string;
  sections: GuideSection[];
  tiers?: TierRow[];
  closing?: string;
};

const HOW_TO_PLAY_EN: GuidePageContent = {
  kicker: 'GUIDE',
  title: 'How to Play',
  intro:
    'Draft five players (PG, SG, SF, PF, C) and stack their values to clear $1 billion.',
  sections: [
    {
      heading: 'Classic Run',
      body: [
        'Tap ROLL for a team and decade, pick from that roster, and seat each player in an open slot they can play. When all five circles are filled, values reveal and add up — hit $1B to complete the run.',
      ],
    },
    {
      heading: '1v1',
      body: [
        'Create or join a lobby, draft your five, then compare totals with your opponent. Higher lineup value wins.',
      ],
    },
    {
      heading: 'Quick tips',
      body: [
        'Stars carry the score, but one weak slot can cost you. Era and franchise matter — peak legends print bigger. You can shuffle eligible players between open slots before locking in.',
      ],
    },
  ],
  closing: 'Ready? Tap Classic or 1v1 from home.',
};

const HOW_VALUES_EN: GuidePageContent = {
  kicker: 'ECONOMY',
  title: 'How Values Work',
  intro:
    'Every player sits on a tier ladder (F → GOAT). Higher tier = higher dollar price on your run.',
  sections: [
    {
      heading: 'What sets the price',
      body: [
        'Tier reflects how valuable that player was in their era — production and star power, not random luck. The same name can price differently across decades. Primary position keeps full value; playing off-position costs about 6% less.',
      ],
    },
    {
      heading: 'Your total',
      body: [
        'When your five locks, each card’s market price is revealed and summed. Stack enough A, S, and GOAT talent to push past a billion.',
      ],
    },
  ],
  tiers: [
    { tier: 'F', label: 'F', range: '$3M – $12M', blurb: 'Deep bench' },
    { tier: 'D', label: 'D', range: '$13M – $28M', blurb: 'Rotation' },
    { tier: 'C', label: 'C', range: '$29M – $72M', blurb: 'Solid starters' },
    { tier: 'B', label: 'B', range: '$65M – $110M', blurb: 'Quality starters' },
    { tier: 'A', label: 'A', range: '$112M – $165M', blurb: 'Stars' },
    { tier: 'S', label: 'S', range: '$180M – $200M', blurb: 'Superstars' },
    { tier: 'GOAT', label: 'GOAT', range: '$200M – $225M', blurb: 'All-time peaks' },
  ],
};

const HOW_TO_PLAY_ES: GuidePageContent = {
  kicker: 'GUÍA',
  title: 'Cómo jugar',
  intro:
    'Draftea cinco jugadores (PG, SG, SF, PF, C) y suma sus valores para superar mil millones.',
  sections: [
    {
      heading: 'Partida clásica',
      body: [
        'Toca ROLL para un equipo y década, elige del roster y coloca a cada jugador en un círculo que pueda jugar. Con los cinco llenos, se revelan y suman los valores — llega a $1B para completar la carrera.',
      ],
    },
    {
      heading: '1v1',
      body: [
        'Crea o únete a una sala, arma tu cinco y compara totales con tu rival. Gana el valor más alto.',
      ],
    },
    {
      heading: 'Consejos rápidos',
      body: [
        'Las estrellas cargan el total, pero un asiento débil cuesta caro. La era y la franquicia importan. Puedes mover jugadores elegibles entre círculos abiertos antes de cerrar.',
      ],
    },
  ],
  closing: '¿Listo? Toca Classic o 1v1 en el inicio.',
};

const HOW_VALUES_ES: GuidePageContent = {
  kicker: 'ECONOMÍA',
  title: 'Cómo funcionan los valores',
  intro:
    'Cada jugador tiene un tier (F → GOAT). Tier más alto = precio en dólares más alto en tu carrera.',
  sections: [
    {
      heading: 'Qué fija el precio',
      body: [
        'El tier refleja lo valioso que era ese jugador en su era — producción y estrellato, no suerte. El mismo nombre puede valer distinto según la década. Posición primaria = valor completo; fuera de posición ≈ 6% menos.',
      ],
    },
    {
      heading: 'Tu total',
      body: [
        'Al cerrar tu cinco, se revela y suma el precio de mercado de cada carta. Apila talento A, S y GOAT para pasar mil millones.',
      ],
    },
  ],
  tiers: [
    { tier: 'F', label: 'F', range: '$3M – $12M', blurb: 'Banquillo profundo' },
    { tier: 'D', label: 'D', range: '$13M – $28M', blurb: 'Rotación' },
    { tier: 'C', label: 'C', range: '$29M – $72M', blurb: 'Titulares sólidos' },
    { tier: 'B', label: 'B', range: '$65M – $110M', blurb: 'Buenos titulares' },
    { tier: 'A', label: 'A', range: '$112M – $165M', blurb: 'Estrellas' },
    { tier: 'S', label: 'S', range: '$180M – $200M', blurb: 'Superestrellas' },
    { tier: 'GOAT', label: 'GOAT', range: '$200M – $225M', blurb: 'Picos históricos' },
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
  { howToPlay: string; howValues: string; back: string; guidesLabel: string; tierRanges: string }
> = {
  en: {
    howToPlay: 'How to Play',
    howValues: 'How Values Work',
    back: 'Back',
    guidesLabel: 'Guides',
    tierRanges: 'Tier ranges',
  },
  es: {
    howToPlay: 'Cómo jugar',
    howValues: 'Cómo funcionan los valores',
    back: 'Atrás',
    guidesLabel: 'Guías',
    tierRanges: 'Rangos por tier',
  },
};
