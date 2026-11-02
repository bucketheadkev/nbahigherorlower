/**
 * Franchise cards: every historical player version (era + team + player) gets a card tier, a
 * ranking score inside that tier (0–1) and a fixed fan count:
 *
 *   fans = tier minimum + (tier maximum − tier minimum) × ranking score   (3 significant digits)
 *
 * Tier comes from the version's authored rating (the same ladder Classic uses): GOAT → GOAT,
 * S → Legend, A → Superstar, B → All-Star, C/D → Pro. Deep-bench (F) versions are not in chests.
 *
 * Ranking score blends how good that version was (its in-game value, as a percentile inside the
 * tier) with the person's worldwide fame (a curated list below), so icons sit at the top of every
 * tier they appear in. GOAT fans are curated per person outright. Fans never change between pulls.
 */

import { resolveAuthoritativePlayerValue } from '@/lib/tradeup/billionDollar';
import { getEligiblePositions } from '@/lib/tradeup/alternatePositions';
import {
  DECADE_ERAS,
  decadePlayerToTradePlayer,
  getDecadeRoster,
  teamsForEra,
} from '@/lib/tradeup/decadeRosters';
import { getPlayerTier } from '@/lib/tradeup/tiers';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import { CARD_TIERS, type CardTier } from './config';

/** GOAT tier: fans per person, set by hand. Every GOAT version of that person has this number. */
export const GOAT_FANS: Record<string, number> = {
  michael_jordan: 180_000_000,
  lebron_james: 175_000_000,
  kobe_bryant: 150_000_000,
  shaquille_o_neal: 140_000_000,
  magic_johnson: 135_000_000,
  stephen_curry: 125_000_000,
  larry_bird: 122_000_000,
  kevin_durant: 120_000_000,
  kareem_abdul_jabbar: 120_000_000,
  wilt_chamberlain: 118_000_000,
  luka_doncic: 116_000_000,
  giannis_antetokounmpo: 114_000_000,
  nikola_jokic: 110_000_000,
  hakeem_olajuwon: 108_000_000,
  victor_wembanyama: 106_000_000,
  oscar_robertson: 104_000_000,
  joel_embiid: 102_000_000,
  shai_gilgeous_alexander: 101_000_000,
};

/**
 * Worldwide fame, 0–1, for players whose following outgrows their numbers (greatness, cultural
 * influence, legacy, global recognition). Anyone not listed is ranked by his play alone.
 */
export const FAME: Record<string, number> = {
  michael_jordan: 1,
  lebron_james: 1,
  kobe_bryant: 0.97,
  stephen_curry: 0.95,
  shaquille_o_neal: 0.95,
  magic_johnson: 0.92,
  larry_bird: 0.9,
  kevin_durant: 0.9,
  allen_iverson: 0.9,
  yao_ming: 0.9,
  kareem_abdul_jabbar: 0.88,
  luka_doncic: 0.88,
  giannis_antetokounmpo: 0.87,
  wilt_chamberlain: 0.86,
  tim_duncan: 0.86,
  dirk_nowitzki: 0.86,
  victor_wembanyama: 0.85,
  dwyane_wade: 0.85,
  charles_barkley: 0.84,
  kyrie_irving: 0.84,
  james_harden: 0.84,
  nikola_jokic: 0.82,
  hakeem_olajuwon: 0.82,
  kevin_garnett: 0.82,
  scottie_pippen: 0.82,
  russell_westbrook: 0.82,
  bill_russell: 0.8,
  jerry_west: 0.8,
  julius_erving: 0.8,
  dennis_rodman: 0.8,
  kawhi_leonard: 0.8,
  carmelo_anthony: 0.8,
  vince_carter: 0.8,
  tracy_mcgrady: 0.8,
  jayson_tatum: 0.8,
  anthony_edwards: 0.8,
  anthony_davis: 0.8,
  oscar_robertson: 0.78,
  joel_embiid: 0.78,
  chris_paul: 0.78,
  damian_lillard: 0.78,
  klay_thompson: 0.78,
  derrick_rose: 0.78,
  shai_gilgeous_alexander: 0.76,
  pete_maravich: 0.76,
  ja_morant: 0.75,
  patrick_ewing: 0.74,
  isiah_thomas: 0.74,
  karl_malone: 0.74,
  ray_allen: 0.74,
  paul_pierce: 0.74,
  reggie_miller: 0.74,
  dwight_howard: 0.74,
  pau_gasol: 0.74,
  devin_booker: 0.74,
  jimmy_butler: 0.74,
  steve_nash: 0.72,
  gary_payton: 0.72,
  grant_hill: 0.72,
  anfernee_hardaway: 0.72,
  manu_ginobili: 0.72,
  zion_williamson: 0.72,
  trae_young: 0.72,
  blake_griffin: 0.72,
  jason_kidd: 0.7,
  john_stockton: 0.7,
  clyde_drexler: 0.7,
  dikembe_mutombo: 0.7,
  elgin_baylor: 0.7,
  moses_malone: 0.7,
  james_worthy: 0.7,
  tony_parker: 0.7,
  jalen_brunson: 0.7,
  lamelo_ball: 0.7,
  jaylen_brown: 0.7,
  donovan_mitchell: 0.7,
  shawn_kemp: 0.7,
  chris_webber: 0.68,
  gilbert_arenas: 0.68,
  david_robinson: 0.68,
  dominique_wilkins: 0.68,
  john_havlicek: 0.66,
  tyrese_haliburton: 0.66,
  george_gervin: 0.65,
  alonzo_mourning: 0.65,
  demar_derozan: 0.65,
  stephon_marbury: 0.65,
  draymond_green: 0.65,
  kevin_mchale: 0.64,
};

export interface CardInfo {
  playerId: string;
  tier: CardTier;
  /** Ranking score inside the tier, 0–1, in ten-thousandths (server stores score_bp). */
  scoreBp: number;
  fans: number;
  eligible: Position[];
}

/** Era/team-free player key: hist_1990s_CHI_michael_jordan → michael_jordan. */
export function cardSlug(playerId: string): string {
  return playerId.replace(/^hist_\d{4}s_[A-Za-z]+_/, '');
}

function cardTierFor(player: TradePlayer): CardTier | null {
  switch (getPlayerTier(player)) {
    case 'GOAT':
      return 'goat';
    case 'S':
      return 'legend';
    case 'A':
      return 'superstar';
    case 'B':
      return 'all_star';
    case 'C':
    case 'D':
      return 'pro';
    default:
      return null;
  }
}

function production(player: TradePlayer): number {
  const s = player.stats;
  return s.ppg + s.rpg + s.apg + s.spg + s.bpg;
}

function roundSig(n: number, digits = 3): number {
  if (n <= 0) return 0;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(n)) - (digits - 1));
  return Math.round(n / step) * step;
}

/** fans = min + (max − min) × score, rounded to 3 significant digits. */
export function fansFor(tier: CardTier, scoreBp: number): number {
  const { minFans, maxFans } = CARD_TIERS[tier];
  return roundSig(minFans + ((maxFans - minFans) * scoreBp) / 10_000);
}

let catalog: Map<string, CardInfo> | null = null;

/** Every card in the game, keyed by player version id. Built once on first use. */
export function cardCatalog(): Map<string, CardInfo> {
  if (catalog) return catalog;
  const rows: { player: TradePlayer; tier: CardTier; value: number }[] = [];
  for (const era of DECADE_ERAS) {
    for (const team of teamsForEra(era)) {
      for (const row of getDecadeRoster(team.id, era)) {
        const player = decadePlayerToTradePlayer(row, team.id, era);
        const tier = cardTierFor(player);
        if (tier) rows.push({ player, tier, value: resolveAuthoritativePlayerValue(player) });
      }
    }
  }
  const out = new Map<string, CardInfo>();
  for (const tier of Object.keys(CARD_TIERS) as CardTier[]) {
    // Play first (in-game value, then rating, then production), so nearly every version ranks apart.
    const inTier = rows
      .filter((r) => r.tier === tier)
      .sort(
        (a, b) =>
          a.value - b.value ||
          a.player.tradeValue - b.player.tradeValue ||
          production(a.player) - production(b.player) ||
          a.player.id.localeCompare(b.player.id),
      );
    const n = inTier.length;
    inTier.forEach((r, rank) => {
      const valueScore = n > 1 ? rank / (n - 1) : 1;
      const slug = cardSlug(r.player.id);
      let score: number;
      if (tier === 'goat') {
        const curated = GOAT_FANS[slug];
        const { minFans, maxFans } = CARD_TIERS.goat;
        score = curated != null ? (curated - minFans) / (maxFans - minFans) : 0.2 * (FAME[slug] ?? valueScore);
      } else {
        // Play sets 60% of the score; worldwide fame adds up to 40% on top.
        score = 0.6 * valueScore + 0.4 * (FAME[slug] ?? 0);
      }
      const scoreBp = Math.round(Math.min(1, Math.max(0, score)) * 10_000);
      out.set(r.player.id, {
        playerId: r.player.id,
        tier,
        scoreBp,
        fans: tier === 'goat' && GOAT_FANS[slug] != null ? GOAT_FANS[slug]! : fansFor(tier, scoreBp),
        eligible: getEligiblePositions(r.player),
      });
    });
  }
  catalog = out;
  return out;
}

export function cardInfo(playerId: string): CardInfo | null {
  return cardCatalog().get(playerId) ?? null;
}
