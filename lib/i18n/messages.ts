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
  | 'challenge.hit-1-05b.title'
  | 'challenge.hit-1-05b.blurb'
  | 'challenge.three-billion-runs.title'
  | 'challenge.three-billion-runs.blurb'
  | 'challenge.five-billion-runs.title'
  | 'challenge.five-billion-runs.blurb'
  | 'challenge.near-miss-950m.title'
  | 'challenge.near-miss-950m.blurb'
  | 'challenge.four-man-1-1b.title'
  | 'challenge.four-man-1-1b.blurb'
  | 'challenge.max-player-350m.title'
  | 'challenge.max-player-350m.blurb'
  | 'challenge.ten-billion-runs.title'
  | 'challenge.ten-billion-runs.blurb'
  | 'challenge.five-runs-1-1b.title'
  | 'challenge.five-runs-1-1b.blurb';

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
  'challenge.hit-1-05b.title': 'Over the Top',
  'challenge.hit-1-05b.blurb': 'Build a five worth $1,050,000,000 or more.',
  'challenge.three-billion-runs.title': 'Repeat Billionaire',
  'challenge.three-billion-runs.blurb':
    'Complete 3 separate Classic runs at $1,000,000,000 or more.',
  'challenge.five-billion-runs.title': 'Board Room Regular',
  'challenge.five-billion-runs.blurb': 'Bank 5 billion-dollar squads in My Runs.',
  'challenge.near-miss-950m.title': 'Nine-Figure Push',
  'challenge.near-miss-950m.blurb':
    'Finish a Classic run worth $950,000,000 or more — knock on the billion door.',
  'challenge.four-man-1-1b.title': 'Core Four Surge',
  'challenge.four-man-1-1b.blurb':
    'Your top four players alone must combine for $1,100,000,000+.',
  'challenge.max-player-350m.title': 'Franchise Cornerstone',
  'challenge.max-player-350m.blurb':
    'Land a single player worth $350,000,000+ in a saved billion run.',
  'challenge.ten-billion-runs.title': 'Dynasty Vault',
  'challenge.ten-billion-runs.blurb':
    'Save 10 separate billion-dollar squads in My Runs.',
  'challenge.five-runs-1-1b.title': 'Consistent Elite',
  'challenge.five-runs-1-1b.blurb':
    'Bank 5 separate Classic runs at $1,100,000,000 or higher.',
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
  'challenge.hit-1-05b.title': 'Por Encima',
  'challenge.hit-1-05b.blurb': 'Arma un quinteto de $1,050,000,000 o más.',
  'challenge.three-billion-runs.title': 'Billonario Repetido',
  'challenge.three-billion-runs.blurb':
    'Completa 3 partidas Clásicas distintas de $1,000,000,000 o más.',
  'challenge.five-billion-runs.title': 'Regular de la Sala',
  'challenge.five-billion-runs.blurb':
    'Guarda 5 quintetos de mil millones en Mis Partidas.',
  'challenge.near-miss-950m.title': 'Empujón de Nueve Cifras',
  'challenge.near-miss-950m.blurb':
    'Termina una partida Clásica de $950,000,000 o más — toca la puerta del billón.',
  'challenge.four-man-1-1b.title': 'Núcleo de Cuatro',
  'challenge.four-man-1-1b.blurb':
    'Tus cuatro mejores jugadores deben sumar $1,100,000,000+ solos.',
  'challenge.max-player-350m.title': 'Pilar de Franquicia',
  'challenge.max-player-350m.blurb':
    'Consigue un jugador de $350,000,000+ en una partida guardada de mil millones.',
  'challenge.ten-billion-runs.title': 'Bóveda Dinástica',
  'challenge.ten-billion-runs.blurb':
    'Guarda 10 quintetos distintos de mil millones en Mis Partidas.',
  'challenge.five-runs-1-1b.title': 'Elite Constante',
  'challenge.five-runs-1-1b.blurb':
    'Guarda 5 partidas Clásicas distintas de $1,100,000,000 o más.',
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
