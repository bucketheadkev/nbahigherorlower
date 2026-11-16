export type Locale = 'en' | 'es';

export type MessageKey =
  | 'nav.myRuns'
  | 'nav.play'
  | 'nav.challenges'
  | 'nav.leaderboard'
  | 'nav.shop'
  | 'nav.rank'
  | 'nav.main'
  | 'shop.comingSoon'
  | 'shop.comingSoonCopy'
  | 'home.draftA'
  | 'home.oneBillion'
  | 'home.teamWord'
  | 'home.modesButton'
  | 'home.coinPlus'
  | 'lang.switchToEn'
  | 'lang.switchToEs'
  | 'lang.en'
  | 'lang.es'
  | 'home.heroTitle'
  | 'intro.eyebrow'
  | 'intro.title'
  | 'intro.goal'
  | 'intro.step1'
  | 'intro.step2'
  | 'intro.step3'
  | 'intro.valuesTitle'
  | 'intro.valuesCopy'
  | 'intro.cta'
  | 'intro.seePrices'
  | 'intro.tapTier'
  | 'intro.sum'
  | 'home.heroSubtitle'
  | 'home.classicTitle'
  | 'home.classicDesc'
  | 'home.h2hTitle'
  | 'home.h2hDesc'
  | 'home.modesLabel'
  | 'home.challengeLabel'
  | 'home.bestRunLabel'
  | 'home.bestRunEmpty'
  | 'home.bankLabel'
  | 'home.coinsLabel'
  | 'home.profileLabel'
  | 'home.wallOfFame'
  | 'xp.level'
  | 'xp.toNext'
  | 'xp.congrats'
  | 'xp.reachedLevel'
  | 'xp.rewardLabel'
  | 'xp.rewardTitle'
  | 'xp.claim'
  | 'xp.continue'
  | 'xp.skip'
  | 'xp.levelUpTitle'
  | 'home.nextMilestone'
  | 'home.wallReached'
  | 'home.circuit'
  | 'home.circuitDesc'
  | 'home.franchises'
  | 'home.franchisesDesc'
  | 'home.myFranchise'
  | 'home.playButton'
  | 'home.modes'
  | 'home.modesClose'
  | 'home.dynastyRoad'
  | 'home.dynastyUnsigned'
  | 'home.dynastyChestReady'
  | 'home.menuPlayer'
  | 'home.menuAccount'
  | 'home.menuGuest'
  | 'home.menuProgress'
  | 'home.menuLegends'
  | 'splash.loading'
  | 'game.home'
  | 'game.goal'
  | 'game.tagline'
  | 'game.h2hGoal'
  | 'game.team'
  | 'game.era'
  | 'game.roll'
  | 'h2h.showdownReady'
  | 'h2h.startShowdown'
  | 'h2h.waitingShowdown'
  | 'h2h.nextPosition'
  | 'h2h.seeResults'
  | 'h2h.waitingHostNext'
  | 'h2h.winsPosition'
  | 'h2h.tiePosition'
  | 'runs.eyebrow'
  | 'runs.title'
  | 'runs.emptyMeta'
  | 'runs.metaOne'
  | 'runs.metaMany'
  | 'runs.waiting'
  | 'runs.emptyCopy'
  | 'runs.bestBadge'
  | 'runs.valueLabel'
  | 'runs.statBest'
  | 'runs.statCount'
  | 'runs.aboveGoal'
  | 'runs.emptyTitle'
  | 'settings.language'
  | 'settings.languageHint'
  | 'challenges.eyebrow'
  | 'challenges.title'
  | 'challenges.completeLabel'
  | 'challenges.intro'
  | 'challenges.done'
  | 'challenges.unlocked'
  | 'challenges.progress'
  | 'challenges.filterLabel'
  | 'challenges.filterIncomplete'
  | 'challenges.filterComplete'
  | 'challenges.emptyIncomplete'
  | 'challenges.emptyComplete'
  | 'challenges.bankLabel'
  | 'challenges.earned'
  | 'leaderboard.eyebrow'
  | 'leaderboard.title'
  | 'leaderboard.world'
  | 'leaderboard.metaTop'
  | 'leaderboard.helpLabel'
  | 'leaderboard.helpCopy'
  | 'leaderboard.loading'
  | 'leaderboard.error'
  | 'leaderboard.retry'
  | 'leaderboard.emptyKicker'
  | 'leaderboard.emptyCopy'
  | 'leaderboard.emptyWeekly'
  | 'leaderboard.emptyAllTime'
  | 'leaderboard.you'
  | 'leaderboard.yourRank'
  | 'leaderboard.unranked'
  | 'leaderboard.myBank'
  | 'leaderboard.myWins'
  | 'leaderboard.winsUnit'
  | 'leaderboard.weekly'
  | 'leaderboard.allTime'
  | 'leaderboard.periods'
  | 'leaderboard.allTimeHint'
  | 'leaderboard.resetInDays'
  | 'leaderboard.resetInHours'
  | 'leaderboard.wallGoal'
  | 'leaderboard.wallReached'
  | 'leaderboard.guestHint'
  | 'leaderboard.guestCta'
  | 'leaderboard.comingKicker'
  | 'leaderboard.comingCopy'
  | 'leaderboard.rankOf'
  | 'challenge.halfway-home.blurb'
  | 'challenge.closing-in.blurb'
  | 'challenge.hit-1b.blurb'
  | 'challenge.near-miss-950m.blurb'
  | 'challenge.no-second-chances.blurb'
  | 'challenge.all-in.blurb'
  | 'challenge.two-hundred-m-club.blurb'
  | 'challenge.balanced-books.blurb'
  | 'challenge.just-enough.blurb'
  | 'challenge.hit-1-05b.blurb'
  | 'challenge.billion-and-beyond.blurb'
  | 'challenge.elite-company.blurb'
  | 'challenge.no-headliners.blurb'
  | 'challenge.five-star-portfolio.blurb'
  | 'challenge.generational-wealth.blurb'
  | 'challenge.league-tour.blurb'
  | 'challenge.double-trouble.blurb'
  | 'challenge.triple-threat.blurb'
  | 'challenge.top-of-the-market.blurb'
  | 'challenge.clutch-investment.blurb'
  | 'challenge.perfect-range.blurb'
  | 'challenge.back-to-back-billions.blurb'
  | 'challenge.three-peat.blurb'
  | 'challenge.ten-billion-runs.blurb'
  | 'challenge.h2h-first-win.blurb'
  | 'challenge.h2h-billion.blurb'
  | 'challenge.h2h-clean-sweep.blurb'
  | 'challenge.h2h-statement.blurb'
  | 'challenge.h2h-three-wins.blurb';

const EN: Record<MessageKey, string> = {
  'nav.myRuns': 'My Runs',
  'nav.play': 'Play',
  'nav.challenges': 'Achievements',
  'nav.leaderboard': 'Leaderboard',
  'nav.shop': 'Shop',
  'shop.comingSoon': 'Coming Soon',
  'shop.comingSoonCopy': 'The Shop opens soon. Your coins stay safe.',
  'home.draftA': 'DRAFT A',
  'home.oneBillion': '$1 BILLION',
  'home.teamWord': 'TEAM',
  'home.modesButton': 'MODES',
  'home.coinPlus': 'Open Shop',
  'nav.rank': 'My Rank',
  'nav.main': 'Main',
  'lang.switchToEn': 'Switch to English',
  'lang.switchToEs': 'Cambiar a español',
  'lang.en': 'EN',
  'lang.es': 'ES',
  'home.heroTitle': 'DRAFT A TEAM WORTH $1B',
  'intro.eyebrow': 'THE GOAL',
  'intro.title': '$1,000,000,000',
  'intro.goal': 'Draft five players.',
  'intro.step1': 'Spin',
  'intro.step2': 'Pick',
  'intro.step3': 'Add them up',
  'intro.valuesTitle': 'Prices',
  'intro.valuesCopy': 'Better players cost more.',
  'intro.cta': 'Chase the billion',
  'intro.seePrices': 'See prices',
  'intro.tapTier': 'Tap a tier',
  'intro.sum': 'Your team is those five prices added up.',
  'home.heroSubtitle': 'Bank the rewards',
  'home.classicTitle': 'CLASSIC RUN',
  'home.classicDesc': 'Solo draft · Reach $1,000,000,000',
  'home.h2hTitle': '1V1',
  'home.h2hDesc': 'Challenge your friends',
  'home.modesLabel': 'Game modes',
  'home.challengeLabel': 'Challenge',
  'home.bestRunLabel': 'My Best Run',
  'home.bestRunEmpty': '—',
  'home.bankLabel': 'My Bank',
  'home.coinsLabel': 'Coins',
  'home.profileLabel': 'Profile',
  'home.wallOfFame': 'Wall of Fame',
  'xp.level': 'LVL',
  'xp.toNext': 'XP to next level',
  'xp.congrats': 'CONGRATULATIONS',
  'xp.reachedLevel': "YOU'VE REACHED A NEW LEVEL",
  'xp.rewardLabel': 'Coins earned',
  'xp.rewardTitle': 'Reward',
  'xp.claim': 'CLAIM',
  'xp.continue': 'CONTINUE',
  'xp.skip': 'Skip',
  'xp.levelUpTitle': 'Level up',
  'home.nextMilestone': 'Next milestone {amount}',
  'home.wallReached': 'Wall of Fame unlocked',
  'home.circuit': 'Cash Cups',
  'home.circuitDesc': 'Every 2 hours',
  'home.franchises': 'Franchises',
  'home.franchisesDesc': 'Own a team',
  'home.myFranchise': 'My Franchise',
  'home.playButton': 'PLAY',
  'home.modes': 'Choose Mode',
  'home.modesClose': 'Close',
  'home.dynastyRoad': 'Dynasty Road',
  'home.dynastyUnsigned': 'a $1B run is waiting to be signed',
  'home.dynastyChestReady': 'a chest is ready to open',
  'home.menuPlayer': 'Player',
  'home.menuAccount': 'Account',
  'home.menuGuest': 'Guest · Sign in',
  'home.menuProgress': 'Progress',
  'home.menuLegends': 'Legends',
  'splash.loading': 'LOADING',
  'game.home': '← Home',
  'game.goal': 'GOAL',
  'game.tagline': 'BUILD A LEGENDARY FIVE',
  'game.h2hGoal': 'Draft a better team than {name}',
  'game.team': 'TEAM',
  'game.era': 'ERA',
  'game.roll': 'SPIN',
  'h2h.showdownReady': 'Lineups Locked',
  'h2h.startShowdown': 'Start Showdown',
  'h2h.waitingShowdown': 'Waiting for host to start…',
  'h2h.nextPosition': 'Next',
  'h2h.seeResults': 'See Results',
  'h2h.waitingHostNext': 'Waiting for host…',
  'h2h.winsPosition': '{name} wins {position}',
  'h2h.tiePosition': 'Tie — {position}',
  'runs.eyebrow': 'HISTORY',
  'runs.title': 'My Runs',
  'runs.emptyMeta': 'No billion runs yet',
  'runs.metaOne': '1 billion+ squad',
  'runs.metaMany': '{count} billion+ squads',
  'runs.waiting': 'WAITING',
  'runs.emptyCopy': 'Hit $1,000,000,000 or more to bank a squad here.',
  'runs.bestBadge': 'Best',
  'runs.valueLabel': 'Team value',
  'runs.statBest': 'Best run',
  'runs.statCount': 'Billion runs',
  'runs.aboveGoal': '{amount} above goal',
  'runs.emptyTitle': 'No billion runs yet',
  'settings.language': 'Language',
  'settings.languageHint': 'Game text and guides',
  'challenges.eyebrow': 'SEASON GOALS',
  'challenges.title': 'Achievements',
  'challenges.completeLabel': 'complete',
  'challenges.intro':
    'Hit milestones as you chase $1B. Harder goals stand out more.',
  'challenges.done': 'DONE',
  'challenges.unlocked': 'Achievement completed',
  'challenges.progress': '{done}/{total} complete',
  'challenges.filterLabel': 'Challenge filter',
  'challenges.filterIncomplete': 'To earn',
  'challenges.filterComplete': 'Earned',
  'challenges.emptyIncomplete':
    'You cashed every achievement. Flip to Earned to see your haul.',
  'challenges.emptyComplete':
    'No cash earned yet. Finish an achievement to make your first deposit.',
  'challenges.bankLabel': 'My Bank',
  'challenges.earned': 'EARNED',
  'leaderboard.eyebrow': 'CLASSIC RUN',
  'leaderboard.title': 'Leaderboard',
  'leaderboard.world': 'Top winners',
  'leaderboard.metaTop': 'Every $1B Classic finish counts as a win',
  'leaderboard.helpLabel': 'How wins work',
  'leaderboard.helpCopy':
    'A win is a Classic Run that finishes at $1,000,000,000 or more. Weekly resets every Monday 00:00 UTC. All-time never resets. Sign in so verified finishes count on the board.',
  'leaderboard.loading': 'Loading the wins board…',
  'leaderboard.error': 'Could not load the wins board.',
  'leaderboard.retry': 'Try again',
  'leaderboard.emptyKicker': 'OPEN COURT',
  'leaderboard.emptyCopy': 'No wins on the board yet. Hit $1B in Classic to claim #1.',
  'leaderboard.emptyWeekly': 'No $1B wins this week yet. Be first on the board.',
  'leaderboard.emptyAllTime': 'No all-time wins yet. Hit $1B in Classic to open the board.',
  'leaderboard.you': 'You',
  'leaderboard.yourRank': 'Your rank',
  'leaderboard.unranked': 'Unranked',
  'leaderboard.myBank': 'My Bank',
  'leaderboard.myWins': 'My Wins',
  'leaderboard.winsUnit': 'Wins',
  'leaderboard.weekly': 'Weekly',
  'leaderboard.allTime': 'All-Time',
  'leaderboard.periods': 'Leaderboard period',
  'leaderboard.allTimeHint': 'Career $1B Classic finishes',
  'leaderboard.resetInDays': 'Resets in {days}d {hours}h',
  'leaderboard.resetInHours': 'Resets in {hours}h',
  'leaderboard.wallGoal': '{amount} to the Wall of Fame',
  'leaderboard.wallReached': 'On the Wall of Fame',
  'leaderboard.guestHint': 'Create an account so your $1B Classic wins hit the board.',
  'leaderboard.guestCta': 'Create account',
  'leaderboard.comingKicker': 'COMING ONLINE',
  'leaderboard.comingCopy': 'The wins board is almost ready. Keep stacking $1B Classic runs.',
  'leaderboard.rankOf': '#{rank} worldwide',
  'challenge.halfway-home.blurb':
    'Finish a Classic run worth $500,000,000 or more.',
  'challenge.closing-in.blurb':
    'Finish a Classic run worth $750,000,000 or more.',
  'challenge.hit-1b.blurb': 'Finish a Classic run worth $1,000,000,000 or more.',
  'challenge.near-miss-950m.blurb':
    'Finish a Classic run worth $950,000,000 or more — knock on the billion door.',
  'challenge.no-second-chances.blurb':
    'Build a $1 billion team without using either reroll.',
  'challenge.all-in.blurb':
    'Use both rerolls and still build a $1 billion team.',
  'challenge.two-hundred-m-club.blurb':
    'Build a $1 billion team with every player worth at least $200 million.',
  'challenge.balanced-books.blurb':
    'Keep your most and least valuable players within $15 million and cross $1 billion.',
  'challenge.just-enough.blurb': 'Finish between $1 billion and $1.015 billion.',
  'challenge.hit-1-05b.blurb': 'Build a team worth $1,050,000,000 or more.',
  'challenge.billion-and-beyond.blurb': 'Build a team worth at least $1.05 billion.',
  'challenge.elite-company.blurb': 'Build a team worth at least $1.075 billion.',
  'challenge.no-headliners.blurb':
    'Cross $1 billion without drafting anyone worth more than $210 million.',
  'challenge.five-star-portfolio.blurb':
    'Build a $1 billion team with all five players valued between $195 million and $215 million.',
  'challenge.generational-wealth.blurb':
    'Build a $1 billion team using players from at least four different eras.',
  'challenge.league-tour.blurb':
    'Build a $1 billion team using players from five different NBA teams.',
  'challenge.double-trouble.blurb':
    'Draft two players worth at least $215 million in one run.',
  'challenge.triple-threat.blurb':
    'Draft three players worth at least $210 million in one run.',
  'challenge.top-of-the-market.blurb': 'Draft a player worth $220 million.',
  'challenge.clutch-investment.blurb':
    'Enter your final selection below $800 million, then cross $1 billion.',
  'challenge.perfect-range.blurb': 'Finish between $1.025 billion and $1.035 billion.',
  'challenge.back-to-back-billions.blurb':
    'Complete two successful $1 billion runs in a row.',
  'challenge.three-peat.blurb':
    'Complete three successful $1 billion runs in a row.',
  'challenge.ten-billion-runs.blurb':
    'Save 10 separate billion-dollar squads in My Runs.',
  'challenge.h2h-first-win.blurb': 'Beat an opponent in 1v1.',
  'challenge.h2h-billion.blurb': 'Finish a 1v1 with a team worth $1 billion.',
  'challenge.h2h-clean-sweep.blurb': 'Win all five positions in one 1v1.',
  'challenge.h2h-statement.blurb': 'Win a 1v1 position by $75 million or more.',
  'challenge.h2h-three-wins.blurb': 'Beat opponents in 3 separate 1v1 matches.',
};

const ES: Record<MessageKey, string> = {
  'nav.myRuns': 'Mis Partidas',
  'nav.play': 'Jugar',
  'nav.challenges': 'Logros',
  'nav.leaderboard': 'Clasificación',
  'nav.shop': 'Tienda',
  'shop.comingSoon': 'Próximamente',
  'shop.comingSoonCopy': 'La tienda abre pronto. Tus monedas están seguras.',
  'home.draftA': 'ARMA UN',
  'home.oneBillion': '$1 BILLÓN',
  'home.teamWord': 'EQUIPO',
  'home.modesButton': 'MODOS',
  'home.coinPlus': 'Abrir tienda',
  'nav.rank': 'Mi Rango',
  'nav.main': 'Principal',
  'lang.switchToEn': 'Switch to English',
  'lang.switchToEs': 'Cambiar a español',
  'lang.en': 'EN',
  'lang.es': 'ES',
  'home.heroTitle': 'ARMA UN EQUIPO DE $1B',
  'intro.eyebrow': 'LA META',
  'intro.title': '$1,000,000,000',
  'intro.goal': 'Elige cinco jugadores.',
  'intro.step1': 'Gira',
  'intro.step2': 'Elige',
  'intro.step3': 'Súmalos',
  'intro.valuesTitle': 'Precios',
  'intro.valuesCopy': 'Los mejores cuestan más.',
  'intro.cta': 'Por el billón',
  'intro.seePrices': 'Ver precios',
  'intro.tapTier': 'Toca un nivel',
  'intro.sum': 'Tu equipo es la suma de esos cinco precios.',
  'home.heroSubtitle': 'Cobra las recompensas',
  'home.classicTitle': 'PARTIDA CLÁSICA',
  'home.classicDesc': 'Draft en solitario · Alcanza $1,000,000,000',
  'home.h2hTitle': '1V1',
  'home.h2hDesc': 'Reta a tus amigos',
  'home.modesLabel': 'Modos de juego',
  'home.challengeLabel': 'Desafío',
  'home.bestRunLabel': 'Mi mejor partida',
  'home.bestRunEmpty': '—',
  'home.bankLabel': 'Mi Banco',
  'home.coinsLabel': 'Monedas',
  'home.profileLabel': 'Perfil',
  'home.wallOfFame': 'Muro de la Fama',
  'xp.level': 'NVL',
  'xp.toNext': 'XP al siguiente nivel',
  'xp.congrats': 'FELICIDADES',
  'xp.reachedLevel': 'ALCANZASTE UN NUEVO NIVEL',
  'xp.rewardLabel': 'Monedas ganadas',
  'xp.rewardTitle': 'Recompensa',
  'xp.claim': 'COBRAR',
  'xp.continue': 'CONTINUAR',
  'xp.skip': 'Saltar',
  'xp.levelUpTitle': 'Subida de nivel',
  'home.nextMilestone': 'Próxima meta {amount}',
  'home.wallReached': 'Muro de la Fama desbloqueado',
  'home.circuit': 'Copas de efectivo',
  'home.circuitDesc': 'Cada 2 horas',
  'home.franchises': 'Franquicias',
  'home.franchisesDesc': 'Ten tu equipo',
  'home.myFranchise': 'Mi franquicia',
  'home.playButton': 'JUGAR',
  'home.modes': 'Elegir modo',
  'home.modesClose': 'Cerrar',
  'home.dynastyRoad': 'Ruta de Dinastías',
  'home.dynastyUnsigned': 'una partida de $1B espera su fichaje',
  'home.dynastyChestReady': 'un cofre está listo para abrir',
  'home.menuPlayer': 'Jugador',
  'home.menuAccount': 'Cuenta',
  'home.menuGuest': 'Invitado · Inicia sesión',
  'home.menuProgress': 'Progreso',
  'home.menuLegends': 'Leyendas',
  'splash.loading': 'CARGANDO',
  'game.home': '← Inicio',
  'game.goal': 'META',
  'game.tagline': 'ARMA UN CINCO LEGENDARIO',
  'game.h2hGoal': 'Arma un mejor equipo que {name}',
  'game.team': 'EQUIPO',
  'game.era': 'ÉPOCA',
  'game.roll': 'GIRAR',
  'h2h.showdownReady': 'Quintetos listos',
  'h2h.startShowdown': 'Empezar el showdown',
  'h2h.waitingShowdown': 'Esperando a que el anfitrión empiece…',
  'h2h.nextPosition': 'Siguiente',
  'h2h.seeResults': 'Ver resultados',
  'h2h.waitingHostNext': 'Esperando al anfitrión…',
  'h2h.winsPosition': '{name} gana {position}',
  'h2h.tiePosition': 'Empate — {position}',
  'runs.eyebrow': 'HISTORIAL',
  'runs.title': 'Mis Partidas',
  'runs.emptyMeta': 'Aún no hay partidas de mil millones',
  'runs.metaOne': '1 quinteto de mil millones+',
  'runs.metaMany': '{count} quintetos de mil millones+',
  'runs.waiting': 'ESPERANDO',
  'runs.emptyCopy':
    'Alcanza $1,000,000,000 o más para guardar un quinteto aquí.',
  'runs.bestBadge': 'Mejor',
  'runs.valueLabel': 'Valor del equipo',
  'runs.statBest': 'Mejor partida',
  'runs.statCount': 'Partidas de mil millones',
  'runs.aboveGoal': '{amount} sobre la meta',
  'runs.emptyTitle': 'Aún no hay partidas de mil millones',
  'settings.language': 'Idioma',
  'settings.languageHint': 'Textos del juego y guías',
  'challenges.eyebrow': 'METAS DE TEMPORADA',
  'challenges.title': 'Logros',
  'challenges.completeLabel': 'completados',
  'challenges.intro':
    'Cumple hitos mientras buscas $1B. Las metas más difíciles destacan más.',
  'challenges.done': 'LISTO',
  'challenges.unlocked': 'Logro completado',
  'challenges.progress': '{done}/{total} completados',
  'challenges.filterLabel': 'Filtro de logros',
  'challenges.filterIncomplete': 'Por ganar',
  'challenges.filterComplete': 'Ganados',
  'challenges.emptyIncomplete':
    'Cobraste todos los logros. Cambia a Ganados para ver tu botín.',
  'challenges.emptyComplete':
    'Aún no has ganado efectivo. Completa un logro para tu primer depósito.',
  'challenges.bankLabel': 'Mi Banco',
  'challenges.earned': 'GANADO',
  'leaderboard.eyebrow': 'CLASSIC RUN',
  'leaderboard.title': 'Clasificación',
  'leaderboard.world': 'Mejores',
  'leaderboard.metaTop': 'Cada Classic de $1B o más cuenta como victoria',
  'leaderboard.helpLabel': 'Cómo cuentan las victorias',
  'leaderboard.helpCopy':
    'Una victoria es un Classic Run de $1,000,000,000 o más. Lo semanal se reinicia cada lunes a las 00:00 UTC. Lo histórico no se reinicia. Inicia sesión para que las partidas verificadas cuenten.',
  'leaderboard.loading': 'Cargando el tablero de victorias…',
  'leaderboard.error': 'No se pudo cargar el tablero de victorias.',
  'leaderboard.retry': 'Reintentar',
  'leaderboard.emptyKicker': 'CANCHA ABIERTA',
  'leaderboard.emptyCopy': 'Aún no hay victorias. Llega a $1B en Classic para ser el #1.',
  'leaderboard.emptyWeekly': 'Aún no hay victorias de $1B esta semana. Sé el primero.',
  'leaderboard.emptyAllTime': 'Aún no hay victorias históricas. Llega a $1B en Classic.',
  'leaderboard.you': 'Tú',
  'leaderboard.yourRank': 'Tu puesto',
  'leaderboard.unranked': 'Sin puesto',
  'leaderboard.myBank': 'Mi Banco',
  'leaderboard.myWins': 'Mis victorias',
  'leaderboard.winsUnit': 'Victorias',
  'leaderboard.weekly': 'Semanal',
  'leaderboard.allTime': 'Histórico',
  'leaderboard.periods': 'Periodo de clasificación',
  'leaderboard.allTimeHint': 'Victorias Classic de $1B en tu carrera',
  'leaderboard.resetInDays': 'Reinicia en {days}d {hours}h',
  'leaderboard.resetInHours': 'Reinicia en {hours}h',
  'leaderboard.wallGoal': 'Faltan {amount} para el Muro de la Fama',
  'leaderboard.wallReached': 'En el Muro de la Fama',
  'leaderboard.guestHint': 'Crea una cuenta para que tus victorias Classic de $1B entren al tablero.',
  'leaderboard.guestCta': 'Crear cuenta',
  'leaderboard.comingKicker': 'EN CAMINO',
  'leaderboard.comingCopy': 'El tablero de victorias está casi listo. Sigue sumando Classic de $1B.',
  'leaderboard.rankOf': '#{rank} en el mundo',
  'challenge.halfway-home.blurb':
    'Termina una partida Clásica de $500,000,000 o más.',
  'challenge.closing-in.blurb':
    'Termina una partida Clásica de $750,000,000 o más.',
  'challenge.hit-1b.blurb':
    'Termina una partida Clásica de $1,000,000,000 o más.',
  'challenge.near-miss-950m.blurb':
    'Termina una partida Clásica de $950,000,000 o más — toca la puerta del billón.',
  'challenge.no-second-chances.blurb':
    'Arma un equipo de $1 mil millones sin usar ningún reroll.',
  'challenge.all-in.blurb':
    'Usa ambos rerolls y aún así arma un equipo de $1 mil millones.',
  'challenge.two-hundred-m-club.blurb':
    'Arma un equipo de $1 mil millones con cada jugador de al menos $200 millones.',
  'challenge.balanced-books.blurb':
    'Mantén a tus jugadores más y menos valiosos dentro de $15 millones y supera $1 mil millones.',
  'challenge.just-enough.blurb':
    'Termina entre $1 mil millones y $1.015 mil millones.',
  'challenge.hit-1-05b.blurb': 'Arma un quinteto de $1,050,000,000 o más.',
  'challenge.billion-and-beyond.blurb':
    'Arma un equipo de al menos $1.05 mil millones.',
  'challenge.elite-company.blurb':
    'Arma un equipo de al menos $1.075 mil millones.',
  'challenge.no-headliners.blurb':
    'Supera $1 mil millones sin draftear a nadie de más de $210 millones.',
  'challenge.five-star-portfolio.blurb':
    'Arma un equipo de $1 mil millones con los cinco jugadores entre $195 y $215 millones.',
  'challenge.generational-wealth.blurb':
    'Arma un equipo de $1 mil millones con jugadores de al menos cuatro eras distintas.',
  'challenge.league-tour.blurb':
    'Arma un equipo de $1 mil millones con jugadores de cinco equipos NBA distintos.',
  'challenge.double-trouble.blurb':
    'Draftea dos jugadores de al menos $215 millones en una partida.',
  'challenge.triple-threat.blurb':
    'Draftea tres jugadores de al menos $210 millones en una partida.',
  'challenge.top-of-the-market.blurb': 'Draftea un jugador de $220 millones.',
  'challenge.clutch-investment.blurb':
    'Entra a tu última selección por debajo de $800 millones y luego supera $1 mil millones.',
  'challenge.perfect-range.blurb':
    'Termina entre $1.025 mil millones y $1.035 mil millones.',
  'challenge.back-to-back-billions.blurb':
    'Completa dos partidas Clásicas exitosas de $1 mil millones seguidas.',
  'challenge.three-peat.blurb':
    'Completa tres partidas Clásicas exitosas de $1 mil millones seguidas.',
  'challenge.ten-billion-runs.blurb':
    'Guarda 10 quintetos distintos de mil millones en Mis Partidas.',
  'challenge.h2h-first-win.blurb': 'Vence a un rival en 1v1.',
  'challenge.h2h-billion.blurb': 'Termina un 1v1 con un equipo de $1 mil millones.',
  'challenge.h2h-clean-sweep.blurb': 'Gana las cinco posiciones en un 1v1.',
  'challenge.h2h-statement.blurb': 'Gana una posición de 1v1 por $75 millones o más.',
  'challenge.h2h-three-wins.blurb': 'Vence a rivales en 3 partidos 1v1 distintos.',
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
