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
  intro: 'Every player has a tier from F to GOAT. Higher tier means a higher dollar value.',
  sections: [
    {
      heading: 'How price is set',
      body: [
        'Price follows how good that player was in their era — not luck. The same player can be worth different amounts in different decades.',
        'Full value in their main position. About 6% less if you seat them elsewhere.',
      ],
    },
    {
      heading: 'Your team total',
      body: [
        'When your five are locked, each player’s price is revealed and added up. Reach $1 billion to complete the run.',
      ],
    },
  ],
  tiers: [
    { tier: 'F', label: 'F', range: '$3M – $12M', blurb: 'Bench' },
    { tier: 'D', label: 'D', range: '$13M – $28M', blurb: 'Rotation' },
    { tier: 'C', label: 'C', range: '$29M – $72M', blurb: 'Starter' },
    { tier: 'B', label: 'B', range: '$65M – $110M', blurb: 'Strong starter' },
    { tier: 'A', label: 'A', range: '$112M – $165M', blurb: 'Star' },
    { tier: 'S', label: 'S', range: '$180M – $200M', blurb: 'Superstar' },
    { tier: 'GOAT', label: 'GOAT', range: '$201M – $220M', blurb: 'All-time peaks' },
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
  intro: 'Cada jugador tiene un tier de F a GOAT. Más alto = más valor en dólares.',
  sections: [
    {
      heading: 'Cómo se fija el precio',
      body: [
        'El precio sigue lo bueno que era el jugador en su era — no es suerte. El mismo nombre puede valer distinto en otra década.',
        'Valor completo en su posición principal. Un 6% menos fuera de posición.',
      ],
    },
    {
      heading: 'Tu total',
      body: [
        'Al cerrar tu cinco, se revela y suma el precio de cada jugador. Llega a mil millones para completar la carrera.',
      ],
    },
  ],
  tiers: [
    { tier: 'F', label: 'F', range: '$3M – $12M', blurb: 'Banquillo' },
    { tier: 'D', label: 'D', range: '$13M – $28M', blurb: 'Rotación' },
    { tier: 'C', label: 'C', range: '$29M – $72M', blurb: 'Titular' },
    { tier: 'B', label: 'B', range: '$65M – $110M', blurb: 'Titular fuerte' },
    { tier: 'A', label: 'A', range: '$112M – $165M', blurb: 'Estrella' },
    { tier: 'S', label: 'S', range: '$180M – $200M', blurb: 'Superestrella' },
    { tier: 'GOAT', label: 'GOAT', range: '$201M – $220M', blurb: 'Picos históricos' },
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
