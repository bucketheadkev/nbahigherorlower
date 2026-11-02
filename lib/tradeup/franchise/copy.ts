import type { ChestId, CardTier, Slot } from './config';

type Copy = { en: string; es: string };

export const FC = {
  // Intro
  introTitle: { en: 'BUILD YOUR FRANCHISE', es: 'CONSTRUYE TU FRANQUICIA' },
  ownTitle: { en: 'OWN A TEAM', es: 'TEN UN EQUIPO' },
  ownLine: { en: 'Buy your favorite NBA franchise.', es: 'Compra tu franquicia NBA favorita.' },
  buildTitle: { en: 'BUILD YOUR FIVE', es: 'ARMA TU QUINTETO' },
  buildLine: { en: 'Open packs and collect legendary players.', es: 'Abre sobres y colecciona jugadores legendarios.' },
  paidTitle: { en: 'GET PAID', es: 'COBRA' },
  paidLine: { en: 'More fans = bigger paychecks every 12 hours.', es: 'Más fans = sueldos más grandes cada 12 horas.' },
  chooseFranchise: { en: 'CHOOSE FRANCHISE', es: 'ELIGE FRANQUICIA' },
  gotIt: { en: 'GOT IT', es: 'ENTENDIDO' },
  signInTitle: { en: 'Franchises need an account', es: 'Las franquicias requieren una cuenta' },
  signInLine: { en: 'Your team, players and paychecks are saved to it.', es: 'Tu equipo, jugadores y sueldos se guardan en ella.' },
  signIn: { en: 'CREATE ACCOUNT', es: 'CREAR CUENTA' },
  unavailable: { en: 'Franchises are being upgraded. Check back soon.', es: 'Las franquicias se están actualizando. Vuelve pronto.' },
  offline: { en: 'Can’t reach the server. Check your connection.', es: 'No hay conexión con el servidor.' },
  retry: { en: 'TRY AGAIN', es: 'REINTENTAR' },
  back: { en: 'Back', es: 'Atrás' },
  close: { en: 'Close', es: 'Cerrar' },

  // Selection
  chooseTitle: { en: 'CHOOSE YOUR FRANCHISE', es: 'ELIGE TU FRANQUICIA' },
  chooseSub: { en: '30 TEAMS. ONE FRANCHISE.', es: '30 EQUIPOS. UNA FRANQUICIA.' },
  search: { en: 'Search team or city', es: 'Busca equipo o ciudad' },
  all: { en: 'ALL', es: 'TODOS' },
  east: { en: 'EAST', es: 'ESTE' },
  west: { en: 'WEST', es: 'OESTE' },
  noMatch: { en: 'No team matches “{q}”.', es: 'Ningún equipo coincide con “{q}”.' },
  owned: { en: 'YOUR TEAM', es: 'TU EQUIPO' },
  signInToBuy: { en: 'CREATE ACCOUNT TO BUY', es: 'CREA UNA CUENTA PARA COMPRAR' },
  franchisePrice: { en: 'FRANCHISE PRICE', es: 'PRECIO DE LA FRANQUICIA' },
  yourBank: { en: 'YOUR BANK', es: 'TU BANCO' },
  saleCredit: { en: 'SELL {team}', es: 'VENDER {team}' },
  buyFranchise: { en: 'BUY FRANCHISE', es: 'COMPRAR FRANQUICIA' },
  switchFranchise: { en: 'SELL & SWITCH', es: 'VENDER Y CAMBIAR' },
  buying: { en: 'BUYING…', es: 'COMPRANDO…' },
  needMore: { en: 'You need {amount} more Bank cash.', es: 'Te faltan {amount} en tu Banco.' },
  backToTeams: { en: 'Back to teams', es: 'Volver a equipos' },
  oneAtATime: { en: 'You can own one franchise at a time. Your players stay with you.', es: 'Puedes tener una franquicia a la vez. Tus jugadores se quedan contigo.' },
  ownedNote: { en: 'This is your franchise.', es: 'Esta es tu franquicia.' },

  // Home
  totalFans: { en: 'TOTAL FANS', es: 'FANS TOTALES' },
  every12: { en: 'EVERY 12 HOURS', es: 'CADA 12 HORAS' },
  paycheck12: { en: '12H PAYCHECK', es: 'SUELDO 12H' },
  thisPaycheck: { en: 'This paycheck', es: 'Este sueldo' },
  prorated: { en: 'Prorated for lineup changes this period', es: 'Prorrateado por cambios en este periodo' },
  nextPaycheck: { en: 'NEXT PAYCHECK', es: 'PRÓXIMO SUELDO' },
  paycheckIn: { en: 'PAYCHECK IN', es: 'SUELDO EN' },
  howEarnings: { en: 'HOW EARNINGS WORK', es: 'CÓMO SE GANA' },
  howLine: { en: 'Your five players’ fans pay you every 12 hours: 100,000,000 fans = $1,000,000.', es: 'Los fans de tus cinco pagan cada 12 horas: 100,000,000 fans = $1,000,000.' },
  fansUnit: { en: 'FANS', es: 'FANS' },
  startingFive: { en: 'MY STARTING FIVE', es: 'MI QUINTETO' },
  openChests: { en: 'OPEN PACKS', es: 'ABRIR SOBRES' },
  collection: { en: 'COLLECTION', es: 'COLECCIÓN' },
  switch: { en: 'SWITCH', es: 'CAMBIAR' },
  topDraw: { en: 'TOP DRAW', es: 'MÁS FANS' },
  paidToast: { en: 'PAYCHECK +{amount} added to your Bank', es: 'SUELDO +{amount} sumado a tu Banco' },
  starterReady: { en: 'OPEN YOUR FREE STARTER PACK', es: 'ABRE TU SOBRE INICIAL GRATIS' },
  emptySeat: { en: 'EMPTY', es: 'VACÍO' },
  bank: { en: 'BANK', es: 'BANCO' },

  // Opening
  tapToOpen: { en: 'TAP TO OPEN', es: 'TOCA PARA ABRIR' },
  starterChest: { en: 'STARTER PACK', es: 'SOBRE INICIAL' },
  next: { en: 'NEXT PLAYER', es: 'SIGUIENTE' },
  goHome: { en: 'GO TO MY FRANCHISE', es: 'IR A MI FRANQUICIA' },
  addToLineup: { en: 'ADD TO LINEUP', es: 'AL QUINTETO' },
  keep: { en: 'KEEP IN COLLECTION', es: 'GUARDAR EN COLECCIÓN' },

  // Shop
  shopTitle: { en: 'PACK SHOP', es: 'TIENDA DE SOBRES' },
  shopSub: { en: 'Every pack reveals one player.', es: 'Cada sobre revela un jugador.' },
  chest: { en: 'PACK', es: 'SOBRE' },
  orBetter: { en: '{tier} or better', es: '{tier} o mejor' },
  highLegend: { en: 'High-end Legend or better', es: 'Leyenda de élite o mejor' },
  buyOpen: { en: 'BUY & OPEN', es: 'COMPRAR Y ABRIR' },
  opening: { en: 'OPENING…', es: 'ABRIENDO…' },
  playClassic: { en: 'PLAY CLASSIC TO EARN', es: 'JUEGA CLÁSICO PARA GANAR' },
  odds: { en: 'ODDS', es: 'PROBABILIDADES' },
  openChest: { en: 'OPEN', es: 'ABRIR' },
  chestPrice: { en: 'PACK PRICE', es: 'PRECIO DEL SOBRE' },
  onePlayer: { en: '1 player', es: '1 jugador' },

  // Collection + lineup
  collectionTitle: { en: 'MY COLLECTION', es: 'MI COLECCIÓN' },
  starting: { en: 'STARTING · {slot}', es: 'TITULAR · {slot}' },
  choosePosition: { en: 'CHOOSE A POSITION', es: 'ELIGE UNA POSICIÓN' },
  currentPlayer: { en: 'CURRENT PLAYER', es: 'JUGADOR ACTUAL' },
  newPlayer: { en: 'NEW PLAYER', es: 'JUGADOR NUEVO' },
  fanIncrease: { en: 'FAN CHANGE', es: 'CAMBIO DE FANS' },
  payIncrease: { en: 'PAYCHECK CHANGE', es: 'CAMBIO DE SUELDO' },
  per12: { en: '/ 12 HOURS', es: '/ 12 HORAS' },
  confirmReplace: { en: 'CONFIRM REPLACEMENT', es: 'CONFIRMAR CAMBIO' },
  confirmAdd: { en: 'ADD TO LINEUP', es: 'AL QUINTETO' },
  alreadyIn: { en: '{name} is already starting at {slot}.', es: '{name} ya es titular en {slot}.' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  improves: { en: 'Bigger paycheck', es: 'Sueldo mayor' },
  lowers: { en: 'Smaller paycheck', es: 'Sueldo menor' },
  sortFans: { en: 'FANS', es: 'FANS' },
  sortRarity: { en: 'RARITY', es: 'RAREZA' },
  notHisPosition: { en: 'Not his position', es: 'No es su posición' },
  startingHere: { en: 'Starting here', es: 'Titular aquí' },
  inLineupAt: { en: 'Starting at {slot}', es: 'Titular en {slot}' },
  fansWord: { en: 'fans', es: 'fans' },
  sell: { en: 'SELL', es: 'VENDER' },
  sellTitle: { en: 'Sell your extra {name}?', es: '¿Vender tu {name} repetido?' },
  sellNote: { en: 'Duplicate {tier} jersey · you keep your other copy.', es: 'Camiseta {tier} repetida · conservas la otra.' },
  sellConfirm: { en: 'SELL · +{amount}', es: 'VENDER · +{amount}' },
  soldToast: { en: 'SOLD · +{amount} added to your Bank', es: 'VENDIDA · +{amount} a tu Banco' },
  duplicate: { en: 'DUPLICATE · SELLS FOR {amount}', es: 'REPETIDA · SE VENDE EN {amount}' },
  emptySlot: { en: 'Open seat', es: 'Puesto libre' },
  errorGeneric: { en: 'Something went wrong. Try again.', es: 'Algo salió mal. Intenta de nuevo.' },
} satisfies Record<string, Copy>;

export const TIER_NAME: Record<CardTier, Copy> = {
  pro: { en: 'PRO', es: 'PRO' },
  all_star: { en: 'ALL-STAR', es: 'ALL-STAR' },
  superstar: { en: 'SUPERSTAR', es: 'SUPERESTRELLA' },
  legend: { en: 'LEGEND', es: 'LEYENDA' },
  goat: { en: 'GOAT', es: 'GOAT' },
};

export const CHEST_NAME: Record<ChestId, Copy> = {
  starter: { en: 'STARTER', es: 'INICIAL' },
  pro: { en: 'PRO', es: 'PRO' },
  all_star: { en: 'ALL-STAR', es: 'ALL-STAR' },
  superstar: { en: 'SUPERSTAR', es: 'SUPERSTAR' },
  legend: { en: 'LEGEND', es: 'LEYENDA' },
  goat: { en: 'GOAT', es: 'GOAT' },
};

export const SLOT_NAME: Record<Slot, Copy> = {
  PG: { en: 'POINT GUARD', es: 'BASE' },
  SG: { en: 'SHOOTING GUARD', es: 'ESCOLTA' },
  SF: { en: 'SMALL FORWARD', es: 'ALERO' },
  PF: { en: 'POWER FORWARD', es: 'ALA-PÍVOT' },
  C: { en: 'CENTER', es: 'PÍVOT' },
};

/** Tier colors (match the chest colors). */
export const TIER_COLOR: Record<CardTier, string> = {
  pro: '#3cf274',
  all_star: '#4d98ff',
  superstar: '#ffcf33',
  legend: '#b673ff',
  goat: '#ff4855',
};

export function tx(copy: Copy, locale: string, vars?: Record<string, string | number>): string {
  let text = locale === 'es' ? copy.es : copy.en;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}
