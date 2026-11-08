type Copy = { en: string; es: string };

export const DC = {
  title: { en: 'DYNASTY ROAD', es: 'RUTA DE DINASTÍAS' },
  kicker: { en: 'CHAMPIONSHIP COLLECTION', es: 'COLECCIÓN DE CAMPEONES' },
  intro: {
    en: 'Every $1B Classic run lets you sign one player from your lineup. Collect each title team’s starting five.',
    es: 'Cada partida Clásica de $1B te deja fichar a un jugador de tu quinteto. Colecciona el quinteto titular de cada campeón.',
  },
  signed: { en: '{n} of {total} signed', es: '{n} de {total} fichados' },
  dynasties: { en: '{n} of {total} dynasties', es: '{n} de {total} dinastías' },
  complete: { en: 'DYNASTY COMPLETE', es: 'DINASTÍA COMPLETA' },
  completedOn: { en: 'Completed {date}', es: 'Completada el {date}' },
  missing: { en: 'Missing', es: 'Falta' },
  notInClassic: { en: 'Chests only', es: 'Solo en cofres' },
  finalKicker: { en: 'FINAL COLLECTION', es: 'COLECCIÓN FINAL' },
  finalLine: { en: 'The last stop on the road. Lineup revealed in a future update.', es: 'La última parada. El quinteto se revelará en una actualización.' },
  sealed: { en: 'SEALED', es: 'SELLADA' },
  back: { en: 'Back', es: 'Atrás' },
  loading: { en: 'Loading your collection…', es: 'Cargando tu colección…' },
  loadFailed: { en: 'Couldn’t load your collection.', es: 'No se pudo cargar tu colección.' },
  retry: { en: 'Try again', es: 'Reintentar' },
  guestTitle: { en: 'Sign in to start collecting', es: 'Inicia sesión para coleccionar' },
  guestLine: {
    en: 'Your Dynasty Road is saved to your account, so it follows you to every device.',
    es: 'Tu Ruta de Dinastías se guarda en tu cuenta y te acompaña en cada dispositivo.',
  },
  guestCta: { en: 'Create account', es: 'Crear cuenta' },
  pendingTitle: { en: 'UNSIGNED $1B RUN', es: 'PARTIDA DE $1B SIN FICHAR' },
  pendingLine: { en: '{value} · pick one player to sign', es: '{value} · elige un jugador para fichar' },

  // Classic results
  offerKicker: { en: 'DYNASTY ROAD', es: 'RUTA DE DINASTÍAS' },
  offerTitle: { en: 'Sign one player', es: 'Ficha a un jugador' },
  offerLine: {
    en: 'Your $1B run earned a signing. Pick one player from this lineup for your collection.',
    es: 'Tu partida de $1B ganó un fichaje. Elige un jugador de este quinteto para tu colección.',
  },
  offerGuest: {
    en: 'Sign in to add players from $1B runs to Dynasty Road.',
    es: 'Inicia sesión para añadir jugadores de partidas de $1B a la Ruta de Dinastías.',
  },
  owned: { en: 'OWNED', es: 'YA LO TIENES' },
  allOwned: {
    en: 'You already own every Dynasty player in this lineup.',
    es: 'Ya tienes a todos los jugadores de dinastía de este quinteto.',
  },
  verifying: { en: 'Verifying your run…', es: 'Verificando tu partida…' },
  notVerified: {
    en: 'This run couldn’t be verified, so no player can be signed from it.',
    es: 'No se pudo verificar esta partida, así que no se puede fichar a nadie.',
  },
  pickPrompt: { en: 'Tap a player to choose', es: 'Toca un jugador para elegir' },
  signCta: { en: 'SIGN {name}', es: 'FICHAR A {name}' },
  signing: { en: 'Signing…', es: 'Fichando…' },
  signedDone: { en: 'SIGNED', es: 'FICHADO' },
  signedLine: { en: '{name} joined your {team}', es: '{name} se unió a tus {team}' },
  progress: { en: '{n}/5', es: '{n}/5' },
  completeLine: { en: 'Dynasty complete: {team}', es: 'Dinastía completa: {team}' },
  saveFailed: { en: 'Couldn’t save the signing. Try again.', es: 'No se pudo guardar el fichaje. Intenta de nuevo.' },
  stillVerifying: {
    en: 'Still verifying this run. Try again in a moment. It also waits for you in Dynasty Road.',
    es: 'Aún verificando la partida. Intenta en un momento. También te espera en la Ruta de Dinastías.',
  },
  alreadyClaimed: { en: 'A player was already signed from this run.', es: 'Ya se fichó a un jugador de esta partida.' },
  unavailable: {
    en: 'Dynasty Road isn’t available right now.',
    es: 'La Ruta de Dinastías no está disponible ahora.',
  },
  openRoad: { en: 'View Dynasty Road', es: 'Ver Ruta de Dinastías' },
  close: { en: 'Close', es: 'Cerrar' },

  // Tabs
  tabChests: { en: 'My Chests', es: 'Mis cofres' },
  tabRoad: { en: 'Dynasty Road', es: 'Dinastías' },
  tabCollection: { en: 'My Collection', es: 'Mi colección' },

  // Chests
  chestName: { en: '{tier} Chest', es: 'Cofre {tier}' },
  nextChest: { en: 'NEXT CHEST', es: 'PRÓXIMO COFRE' },
  nextChestOne: { en: '1 more point to your next chest', es: '1 punto más para tu próximo cofre' },
  nextChestMany: { en: '{n} more points to your next chest', es: '{n} puntos más para tu próximo cofre' },
  pointsRule: { en: 'Run +{run} · $1B run +{billion}', es: 'Partida +{run} · Partida de $1B +{billion}' },
  noChests: { en: 'No chests yet', es: 'Aún no tienes cofres' },
  noChestsLine: {
    en: 'Every Classic run earns chest progress. {n} points earns a chest.',
    es: 'Cada partida Clásica suma progreso. {n} puntos ganan un cofre.',
  },
  status_waiting: { en: 'Waiting', es: 'En espera' },
  status_unlocking: { en: 'Unlocking', es: 'Abriéndose' },
  status_ready: { en: 'Ready', es: 'Listo' },
  status_opened: { en: 'Opened', es: 'Abierto' },
  unlockFree: { en: 'Unlock Free — {time}', es: 'Abrir gratis — {time}' },
  useKey: { en: 'Use 1 Key — Instant', es: 'Usar 1 llave — Al instante' },
  confirmKey: { en: 'Use 1 of {n} keys', es: 'Usar 1 de {n} llaves' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  unlocking: { en: 'Unlocking…', es: 'Abriendo…' },
  open: { en: 'Open', es: 'Abrir' },
  slotBusy: { en: 'Another chest is already unlocking.', es: 'Otro cofre ya se está abriendo.' },
  slotBusyShort: { en: 'Another chest is unlocking', es: 'Otro cofre se está abriendo' },
  noKeys: { en: 'You’re out of keys.', es: 'No te quedan llaves.' },
  alreadyReady: { en: 'This chest is already ready to open.', es: 'Este cofre ya está listo.' },
  actionFailed: { en: 'Couldn’t reach the server. Try again.', es: 'No se pudo conectar. Intenta de nuevo.' },
  keysBalance: { en: '{n} keys', es: '{n} llaves' },
  getKeys: { en: 'Get keys', es: 'Llaves' },
  keysFine: {
    en: 'Chests come only from playing Classic. Every chest opens free after {time}; a key just opens one sooner and never changes what’s inside.',
    es: 'Los cofres solo se ganan jugando Clásico. Todos se abren gratis tras {time}; una llave solo abre uno antes y nunca cambia su contenido.',
  },
  recentlyOpened: { en: 'RECENTLY OPENED', es: 'ABIERTOS RECIENTEMENTE' },
  newShort: { en: 'NEW', es: 'NUEVO' },
  dupShort: { en: 'DUPLICATE', es: 'REPETIDO' },
  protectionLine: {
    en: 'Duplicate protection: after {n} duplicates in a row, your next player is guaranteed new.',
    es: 'Protección: tras {n} repetidos seguidos, tu próximo jugador será nuevo.',
  },
  protectionProgress: { en: 'Duplicate protection {n}/{total}', es: 'Protección contra repetidos {n}/{total}' },
  protectionReady: { en: 'Your next chest is guaranteed to bring a new player.', es: 'Tu próximo cofre traerá un jugador nuevo.' },
  protectionUsed: { en: 'Duplicate protection delivered a new player.', es: 'La protección te dio un jugador nuevo.' },
  allCollected: {
    en: 'You already own every Dynasty player, so a duplicate couldn’t be avoided.',
    es: 'Ya tienes a todos los jugadores de dinastía, así que el repetido era inevitable.',
  },
  chestsUnavailable: { en: 'Chests aren’t available yet.', es: 'Los cofres aún no están disponibles.' },
  chestsGuest: { en: 'Create an account to earn chests from every Classic run.', es: 'Crea una cuenta para ganar cofres en cada partida Clásica.' },

  // Opening
  tapToOpen: { en: 'Tap to open', es: 'Toca para abrir' },
  newPlayer: { en: 'NEW PLAYER', es: 'JUGADOR NUEVO' },
  alreadyCollected: { en: 'ALREADY COLLECTED', es: 'YA LO TIENES' },
  focusTag: { en: 'FOCUS', es: 'FOCO' },
  chestStillLocked: { en: 'This chest isn’t unlocked yet.', es: 'Este cofre aún no está desbloqueado.' },
  openFailed: {
    en: 'Couldn’t open the chest. It’s still safe in My Chests.',
    es: 'No se pudo abrir el cofre. Sigue a salvo en Mis cofres.',
  },
  continue: { en: 'Continue', es: 'Continuar' },
  seeDynasty: { en: 'Dynasty complete', es: 'Dinastía completa' },
  completeForever: {
    en: 'Every starter signed. This dynasty stays complete on your Road for good.',
    es: 'Todos los titulares fichados. Esta dinastía queda completa para siempre.',
  },

  // Focus
  focusKicker: { en: 'FOCUS DYNASTY', es: 'DINASTÍA FOCO' },
  focusChoose: { en: 'Choose a Focus Dynasty', es: 'Elige una dinastía foco' },
  focusLine: { en: 'Better chances for missing players from this dynasty.', es: 'Más opciones de los jugadores que te faltan de esta dinastía.' },
  focusExplain: {
    en: 'Chests favor the players you’re missing from your focus. Nothing is guaranteed, other dynasties stay possible, and changing it is free.',
    es: 'Los cofres favorecen a los jugadores que te faltan de tu foco. No es garantía, las demás siguen posibles y cambiarlo es gratis.',
  },
  focusPick: { en: 'Choose', es: 'Elegir' },
  focusChange: { en: 'Change', es: 'Cambiar' },
  focusSet: { en: 'Focus', es: 'Enfocar' },
  focusClear: { en: 'Remove focus', es: 'Quitar foco' },
  completeShort: { en: 'Complete', es: 'Completa' },
  saving: { en: 'Saving…', es: 'Guardando…' },

  // Collection
  collectionEmpty: { en: 'No players collected yet', es: 'Aún no tienes jugadores' },
  collectionEmptyLine: {
    en: 'Sign players from $1B Classic runs and open chests to fill your collection.',
    es: 'Ficha jugadores en partidas de $1B y abre cofres para llenar tu colección.',
  },
  viaRun: { en: '$1B run', es: 'Partida $1B' },
  viaChest: { en: '{tier} chest', es: 'Cofre {tier}' },
  viaGrant: { en: 'Bonus', es: 'Bono' },

  // Results
  chestProgress: { en: 'CHEST PROGRESS', es: 'PROGRESO DE COFRE' },
  chestChecking: { en: 'Adding chest progress…', es: 'Sumando progreso de cofre…' },
  chestEarned: { en: 'CHEST EARNED', es: 'COFRE GANADO' },
  chestEarnedLine: { en: '{tier} Chest · waiting in Dynasty Road', es: 'Cofre {tier} · te espera en Dinastías' },
  tooSoon: { en: 'This run was recorded too quickly after the last one to count.', es: 'Esta partida se registró demasiado pronto después de la anterior.' },

  // Keys
  keyShop: { en: 'KEYS', es: 'LLAVES' },
  keyShopLine: {
    en: 'A key instantly unlocks one chest you’ve already earned. Keys never add chests or change what’s inside.',
    es: 'Una llave abre al instante un cofre que ya ganaste. Nunca añade cofres ni cambia su contenido.',
  },
  keyShopUnavailable: { en: 'Keys aren’t available right now.', es: 'Las llaves no están disponibles ahora.' },
  keyShopFine: {
    en: 'Every chest also opens free by waiting. Purchases are processed by Apple.',
    es: 'Todos los cofres también se abren gratis esperando. Apple procesa las compras.',
  },
  keysAdded: { en: '{n} keys added.', es: '{n} llaves añadidas.' },
  purchasePending: { en: 'Purchase pending approval. Keys arrive once it completes.', es: 'Compra pendiente. Las llaves llegarán al completarse.' },
  purchaseFailed: {
    en: 'Couldn’t confirm the purchase yet. It will be retried automatically.',
    es: 'Aún no se pudo confirmar la compra. Se reintentará automáticamente.',
  },
  oneKey: { en: '1 key', es: '1 llave' },
  manyKeys: { en: '{n} keys', es: '{n} llaves' },

  // Achievements
  achFirst: { en: 'Complete your first dynasty.', es: 'Completa tu primera dinastía.' },
  achThree: { en: 'Complete three dynasties.', es: 'Completa tres dinastías.' },
  achAll: { en: 'Complete every championship dynasty.', es: 'Completa todas las dinastías campeonas.' },
  achBadge: { en: 'DYNASTY', es: 'DINASTÍA' },
} satisfies Record<string, Copy>;

export type DynastyCopyKey = keyof typeof DC;

export function dc(key: DynastyCopyKey, locale: string, vars?: Record<string, string | number>): string {
  const text = locale === 'es' ? DC[key].es : DC[key].en;
  if (!vars) return text;
  return Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), text);
}
