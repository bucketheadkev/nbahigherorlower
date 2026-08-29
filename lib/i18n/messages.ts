export type Locale = 'en' | 'es';

export type MessageKey =
  | 'nav.myRuns'
  | 'nav.play'
  | 'nav.challenges'
  | 'nav.main'
  | 'lang.switchToEn'
  | 'lang.switchToEs'
  | 'lang.en'
  | 'lang.es'
  | 'home.heroTitle'
  | 'home.heroSubtitle'
  | 'home.classicTitle'
  | 'home.classicDesc'
  | 'home.h2hTitle'
  | 'home.h2hDesc'
  | 'home.modesLabel'
  | 'home.challengeLabel'
  | 'home.bestRunLabel'
  | 'home.bestRunEmpty'
  | 'home.playButton'
  | 'splash.loading'
  | 'game.home'
  | 'game.goal'
  | 'game.team'
  | 'game.era'
  | 'game.roll'
  | 'runs.eyebrow'
  | 'runs.title'
  | 'runs.emptyMeta'
  | 'runs.metaOne'
  | 'runs.metaMany'
  | 'runs.waiting'
  | 'runs.emptyCopy'
  | 'challenges.eyebrow'
  | 'challenges.title'
  | 'challenges.completeLabel'
  | 'challenges.intro'
  | 'challenges.done'
  | 'challenge.hit-1b.title'
  | 'challenge.hit-1b.blurb'
  | 'challenge.near-miss-950m.title'
  | 'challenge.near-miss-950m.blurb'
  | 'challenge.no-second-chances.title'
  | 'challenge.no-second-chances.blurb'
  | 'challenge.all-in.title'
  | 'challenge.all-in.blurb'
  | 'challenge.two-hundred-m-club.title'
  | 'challenge.two-hundred-m-club.blurb'
  | 'challenge.balanced-books.title'
  | 'challenge.balanced-books.blurb'
  | 'challenge.just-enough.title'
  | 'challenge.just-enough.blurb'
  | 'challenge.hit-1-05b.title'
  | 'challenge.hit-1-05b.blurb'
  | 'challenge.billion-and-beyond.title'
  | 'challenge.billion-and-beyond.blurb'
  | 'challenge.elite-company.title'
  | 'challenge.elite-company.blurb'
  | 'challenge.no-headliners.title'
  | 'challenge.no-headliners.blurb'
  | 'challenge.five-star-portfolio.title'
  | 'challenge.five-star-portfolio.blurb'
  | 'challenge.generational-wealth.title'
  | 'challenge.generational-wealth.blurb'
  | 'challenge.league-tour.title'
  | 'challenge.league-tour.blurb'
  | 'challenge.double-trouble.title'
  | 'challenge.double-trouble.blurb'
  | 'challenge.triple-threat.title'
  | 'challenge.triple-threat.blurb'
  | 'challenge.top-of-the-market.title'
  | 'challenge.top-of-the-market.blurb'
  | 'challenge.clutch-investment.title'
  | 'challenge.clutch-investment.blurb'
  | 'challenge.perfect-range.title'
  | 'challenge.perfect-range.blurb'
  | 'challenge.back-to-back-billions.title'
  | 'challenge.back-to-back-billions.blurb'
  | 'challenge.three-peat.title'
  | 'challenge.three-peat.blurb'
  | 'challenge.five-runs-1-1b.title'
  | 'challenge.five-runs-1-1b.blurb'
  | 'challenge.ten-billion-runs.title'
  | 'challenge.ten-billion-runs.blurb';

const EN: Record<MessageKey, string> = {
  'nav.myRuns': 'My Runs',
  'nav.play': 'Play',
  'nav.challenges': 'Challenges',
  'nav.main': 'Main',
  'lang.switchToEn': 'Switch to English',
  'lang.switchToEs': 'Cambiar a español',
  'lang.en': 'EN',
  'lang.es': 'ES',
  'home.heroTitle': 'BUILD YOUR FIVE',
  'home.heroSubtitle': 'Draft five legends. Cross one billion dollars.',
  'home.classicTitle': 'CLASSIC RUN',
  'home.classicDesc': 'Solo draft · Reach $1,000,000,000',
  'home.h2hTitle': '1V1',
  'home.h2hDesc': "Private lobby · Beat your opponent's five",
  'home.modesLabel': 'Game modes',
  'home.challengeLabel': 'Challenge',
  'home.bestRunLabel': 'My Best Run',
  'home.bestRunEmpty': '—',
  'home.playButton': 'PLAY',
  'splash.loading': 'LOADING',
  'game.home': '← Home',
  'game.goal': 'GOAL:',
  'game.team': 'TEAM',
  'game.era': 'ERA',
  'game.roll': 'ROLL',
  'runs.eyebrow': 'HISTORY',
  'runs.title': 'My Runs',
  'runs.emptyMeta': 'No billion runs yet',
  'runs.metaOne': '1 billion+ squad',
  'runs.metaMany': '{count} billion+ squads',
  'runs.waiting': 'WAITING',
  'runs.emptyCopy': 'Hit $1,000,000,000 or more to bank a squad here.',
  'challenges.eyebrow': 'SEASON GOALS',
  'challenges.title': 'Challenges',
  'challenges.completeLabel': 'complete',
  'challenges.intro':
    'Hit billion-dollar milestones. Progress tracks your best Classic roster.',
  'challenges.done': 'DONE',
  'challenge.hit-1b.title': 'Billion Club',
  'challenge.hit-1b.blurb': 'Finish a Classic run worth $1,000,000,000 or more.',
  'challenge.near-miss-950m.title': 'Nine-Figure Push',
  'challenge.near-miss-950m.blurb':
    'Finish a Classic run worth $950,000,000 or more — knock on the billion door.',
  'challenge.no-second-chances.title': 'No Second Chances',
  'challenge.no-second-chances.blurb':
    'Build a $1 billion team without using either reroll.',
  'challenge.all-in.title': 'All-In',
  'challenge.all-in.blurb':
    'Use both rerolls and still build a $1 billion team.',
  'challenge.two-hundred-m-club.title': 'The $200M Club',
  'challenge.two-hundred-m-club.blurb':
    'Build a $1 billion team with every player worth at least $200 million.',
  'challenge.balanced-books.title': 'Balanced Books',
  'challenge.balanced-books.blurb':
    'Keep your most and least valuable players within $15 million and cross $1 billion.',
  'challenge.just-enough.title': 'Just Enough',
  'challenge.just-enough.blurb': 'Finish between $1 billion and $1.015 billion.',
  'challenge.hit-1-05b.title': 'Over the Top',
  'challenge.hit-1-05b.blurb': 'Build a team worth $1,050,000,000 or more.',
  'challenge.billion-and-beyond.title': 'Billion and Beyond',
  'challenge.billion-and-beyond.blurb': 'Build a team worth at least $1.05 billion.',
  'challenge.elite-company.title': 'Elite Company',
  'challenge.elite-company.blurb': 'Build a team worth at least $1.075 billion.',
  'challenge.no-headliners.title': 'No Headliners',
  'challenge.no-headliners.blurb':
    'Cross $1 billion without drafting anyone worth more than $210 million.',
  'challenge.five-star-portfolio.title': 'Five-Star Portfolio',
  'challenge.five-star-portfolio.blurb':
    'Build a $1 billion team with all five players valued between $195 million and $215 million.',
  'challenge.generational-wealth.title': 'Generational Wealth',
  'challenge.generational-wealth.blurb':
    'Build a $1 billion team using players from at least four different eras.',
  'challenge.league-tour.title': 'League Tour',
  'challenge.league-tour.blurb':
    'Build a $1 billion team using players from five different NBA teams.',
  'challenge.double-trouble.title': 'Double Trouble',
  'challenge.double-trouble.blurb':
    'Draft two players worth at least $215 million in one run.',
  'challenge.triple-threat.title': 'Triple Threat',
  'challenge.triple-threat.blurb':
    'Draft three players worth at least $210 million in one run.',
  'challenge.top-of-the-market.title': 'Top of the Market',
  'challenge.top-of-the-market.blurb': 'Draft a player worth $225 million.',
  'challenge.clutch-investment.title': 'Clutch Investment',
  'challenge.clutch-investment.blurb':
    'Enter your final selection below $800 million, then cross $1 billion.',
  'challenge.perfect-range.title': 'Perfect Range',
  'challenge.perfect-range.blurb': 'Finish between $1.025 billion and $1.035 billion.',
  'challenge.back-to-back-billions.title': 'Back-to-Back Billions',
  'challenge.back-to-back-billions.blurb':
    'Complete two successful $1 billion runs in a row.',
  'challenge.three-peat.title': 'Three-Peat',
  'challenge.three-peat.blurb':
    'Complete three successful $1 billion runs in a row.',
  'challenge.five-runs-1-1b.title': 'Consistent Elite',
  'challenge.five-runs-1-1b.blurb':
    'Bank 5 separate Classic runs at $1,100,000,000 or higher.',
  'challenge.ten-billion-runs.title': 'Dynasty Vault',
  'challenge.ten-billion-runs.blurb':
    'Save 10 separate billion-dollar squads in My Runs.',
};

const ES: Record<MessageKey, string> = {
  'nav.myRuns': 'Mis Partidas',
  'nav.play': 'Jugar',
  'nav.challenges': 'Retos',
  'nav.main': 'Principal',
  'lang.switchToEn': 'Switch to English',
  'lang.switchToEs': 'Cambiar a español',
  'lang.en': 'EN',
  'lang.es': 'ES',
  'home.heroTitle': 'ARMA TU CINCO',
  'home.heroSubtitle':
    'Elige cinco leyendas. Supera mil millones de dólares.',
  'home.classicTitle': 'PARTIDA CLÁSICA',
  'home.classicDesc': 'Draft en solitario · Alcanza $1,000,000,000',
  'home.h2hTitle': '1V1',
  'home.h2hDesc': 'Sala privada · Vence el quinteto de tu rival',
  'home.modesLabel': 'Modos de juego',
  'home.challengeLabel': 'Desafío',
  'home.bestRunLabel': 'Mi mejor partida',
  'home.bestRunEmpty': '—',
  'home.playButton': 'JUGAR',
  'splash.loading': 'CARGANDO',
  'game.home': '← Inicio',
  'game.goal': 'META:',
  'game.team': 'EQUIPO',
  'game.era': 'ÉPOCA',
  'game.roll': 'TIRAR',
  'runs.eyebrow': 'HISTORIAL',
  'runs.title': 'Mis Partidas',
  'runs.emptyMeta': 'Aún no hay partidas de mil millones',
  'runs.metaOne': '1 quinteto de mil millones+',
  'runs.metaMany': '{count} quintetos de mil millones+',
  'runs.waiting': 'ESPERANDO',
  'runs.emptyCopy':
    'Alcanza $1,000,000,000 o más para guardar un quinteto aquí.',
  'challenges.eyebrow': 'METAS DE TEMPORADA',
  'challenges.title': 'Retos',
  'challenges.completeLabel': 'completados',
  'challenges.intro':
    'Alcanza hitos de mil millones. El progreso sigue tu mejor quinteto Clásico.',
  'challenges.done': 'LISTO',
  'challenge.hit-1b.title': 'Club del Billón',
  'challenge.hit-1b.blurb':
    'Termina una partida Clásica de $1,000,000,000 o más.',
  'challenge.near-miss-950m.title': 'Empujón de Nueve Cifras',
  'challenge.near-miss-950m.blurb':
    'Termina una partida Clásica de $950,000,000 o más — toca la puerta del billón.',
  'challenge.no-second-chances.title': 'Sin Segundas Oportunidades',
  'challenge.no-second-chances.blurb':
    'Arma un equipo de $1 mil millones sin usar ningún reroll.',
  'challenge.all-in.title': 'All-In',
  'challenge.all-in.blurb':
    'Usa ambos rerolls y aún así arma un equipo de $1 mil millones.',
  'challenge.two-hundred-m-club.title': 'Club de $200M',
  'challenge.two-hundred-m-club.blurb':
    'Arma un equipo de $1 mil millones con cada jugador de al menos $200 millones.',
  'challenge.balanced-books.title': 'Libros Balanceados',
  'challenge.balanced-books.blurb':
    'Mantén a tus jugadores más y menos valiosos dentro de $15 millones y supera $1 mil millones.',
  'challenge.just-enough.title': 'Justo Lo Necesario',
  'challenge.just-enough.blurb':
    'Termina entre $1 mil millones y $1.015 mil millones.',
  'challenge.hit-1-05b.title': 'Por Encima',
  'challenge.hit-1-05b.blurb': 'Arma un quinteto de $1,050,000,000 o más.',
  'challenge.billion-and-beyond.title': 'Billón y Más',
  'challenge.billion-and-beyond.blurb':
    'Arma un equipo de al menos $1.05 mil millones.',
  'challenge.elite-company.title': 'Compañía Elite',
  'challenge.elite-company.blurb':
    'Arma un equipo de al menos $1.075 mil millones.',
  'challenge.no-headliners.title': 'Sin Estrellas',
  'challenge.no-headliners.blurb':
    'Supera $1 mil millones sin draftear a nadie de más de $210 millones.',
  'challenge.five-star-portfolio.title': 'Portafolio Cinco Estrellas',
  'challenge.five-star-portfolio.blurb':
    'Arma un equipo de $1 mil millones con los cinco jugadores entre $195 y $215 millones.',
  'challenge.generational-wealth.title': 'Riqueza Generacional',
  'challenge.generational-wealth.blurb':
    'Arma un equipo de $1 mil millones con jugadores de al menos cuatro eras distintas.',
  'challenge.league-tour.title': 'Gira de la Liga',
  'challenge.league-tour.blurb':
    'Arma un equipo de $1 mil millones con jugadores de cinco equipos NBA distintos.',
  'challenge.double-trouble.title': 'Doble Problema',
  'challenge.double-trouble.blurb':
    'Draftea dos jugadores de al menos $215 millones en una partida.',
  'challenge.triple-threat.title': 'Triple Amenaza',
  'challenge.triple-threat.blurb':
    'Draftea tres jugadores de al menos $210 millones en una partida.',
  'challenge.top-of-the-market.title': 'Cima del Mercado',
  'challenge.top-of-the-market.blurb': 'Draftea un jugador de $225 millones.',
  'challenge.clutch-investment.title': 'Inversión Clutch',
  'challenge.clutch-investment.blurb':
    'Entra a tu última selección por debajo de $800 millones y luego supera $1 mil millones.',
  'challenge.perfect-range.title': 'Rango Perfecto',
  'challenge.perfect-range.blurb':
    'Termina entre $1.025 mil millones y $1.035 mil millones.',
  'challenge.back-to-back-billions.title': 'Billones Seguidos',
  'challenge.back-to-back-billions.blurb':
    'Completa dos partidas Clásicas exitosas de $1 mil millones seguidas.',
  'challenge.three-peat.title': 'Tricampeonato',
  'challenge.three-peat.blurb':
    'Completa tres partidas Clásicas exitosas de $1 mil millones seguidas.',
  'challenge.five-runs-1-1b.title': 'Elite Constante',
  'challenge.five-runs-1-1b.blurb':
    'Guarda 5 partidas Clásicas distintas de $1,100,000,000 o más.',
  'challenge.ten-billion-runs.title': 'Bóveda Dinástica',
  'challenge.ten-billion-runs.blurb':
    'Guarda 10 quintetos distintos de mil millones en Mis Partidas.',
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  en: EN,
  es: ES,
};

export const LOCALE_STORAGE_KEY = 'oneb-run-locale';

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'en' || value === 'es';
}

export function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : 'en';
  } catch {
    return 'en';
  }
}

export function formatMessage(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`,
  );
}
