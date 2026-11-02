/**
 * Franchise mode v5 — server calls (supabase/migrations/20261101_1_franchise_v5_chests.sql).
 * The server decides everything: prices, chest odds, the players drawn, lineup rules, and every
 * paycheck. The app only displays the state it returns.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { CardTier, ChestId, Slot } from '@/lib/tradeup/franchise/config';
import { isFranchisePreview } from './franchisePreview';

export interface FCard {
  id: string;
  playerId: string;
  tier: CardTier;
  fans: number;
  source: 'starter' | 'chest' | 'legacy';
  acquiredAt: string;
}

export interface FOpenCard {
  cardId: string;
  playerId: string;
  tier: CardTier;
  fans: number;
  slot: Slot | null;
}

export interface FOpen {
  id: string;
  requestId: string;
  chestId: ChestId;
  price: number;
  cards: FOpenCard[];
  revealed: boolean;
}

export interface FPay {
  periodStart: number;
  periodEnd: number;
  lastAt: number;
  fans: number;
  fanSeconds: number;
  periodsPaid: number;
}

export interface FChest {
  id: ChestId;
  price: number;
  picks: number;
  guarantee: CardTier;
  odds: { tier: CardTier; bps: number; minScoreBp: number }[];
}

export interface FListing {
  teamId: string;
  name: string;
  championships: number;
  price: number;
}

export interface FState {
  /** Server clock minus device clock, ms — add to Date.now() for server time. */
  clockOffset: number;
  settings: { payPeriodHours: number; payPpm: number; resaleBps: number };
  bank: number;
  profile: { introSeen: boolean; starterClaimed: boolean };
  owned: { ownershipId: string; teamId: string; pricePaid: number; resaleValue: number } | null;
  pay: FPay | null;
  lineup: Partial<Record<Slot, string>>;
  cards: FCard[];
  pending: FOpen[];
  chests: FChest[];
  franchises: FListing[];
  /** Paychecks this call just banked. */
  paidNow: number;
}

export type FFailure =
  | 'unavailable'
  | 'account'
  | 'insufficient'
  | 'starter_claimed'
  | 'no_franchise'
  | 'duplicate_player'
  | 'invalid_slot'
  | 'offline'
  | 'error';

export type FResult<T> = { ok: true; data: T } | { ok: false; reason: FFailure };

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const ms = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : num(v));
const SLOTS = new Set(['PG', 'SG', 'SF', 'PF', 'C']);

function toOpen(raw: unknown): FOpen {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    requestId: String(r.request_id),
    chestId: String(r.chest_id) as ChestId,
    price: num(r.price),
    revealed: Boolean(r.revealed),
    cards: (Array.isArray(r.cards) ? r.cards : []).map((c) => {
      const x = c as Record<string, unknown>;
      return {
        cardId: String(x.card_id),
        playerId: String(x.player_id),
        tier: String(x.tier) as CardTier,
        fans: num(x.fans),
        slot: SLOTS.has(String(x.slot)) ? (String(x.slot) as Slot) : null,
      };
    }),
  };
}

export function toState(raw: unknown): FState {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (num(r.version) < 5) throw new Error('franchise server is before v5');
  const settings = (r.settings ?? {}) as Record<string, unknown>;
  const profile = (r.profile ?? {}) as Record<string, unknown>;
  const owned = r.owned as Record<string, unknown> | null;
  const pay = r.pay as Record<string, unknown> | null;
  const lineup: Partial<Record<Slot, string>> = {};
  for (const row of Array.isArray(r.lineup) ? r.lineup : []) {
    const x = row as Record<string, unknown>;
    if (SLOTS.has(String(x.slot))) lineup[String(x.slot) as Slot] = String(x.card_id);
  }
  return {
    clockOffset: ms(r.server_time) - Date.now(),
    settings: {
      payPeriodHours: num(settings.pay_period_hours) || 12,
      payPpm: num(settings.pay_ppm),
      resaleBps: num(settings.resale_bps),
    },
    bank: num(r.bank),
    profile: { introSeen: Boolean(profile.intro_seen), starterClaimed: Boolean(profile.starter_claimed) },
    owned:
      owned && owned.team_id
        ? {
            ownershipId: String(owned.ownership_id),
            teamId: String(owned.team_id),
            pricePaid: num(owned.price_paid),
            resaleValue: num(owned.resale_value),
          }
        : null,
    pay: pay
      ? {
          periodStart: ms(pay.period_start),
          periodEnd: ms(pay.period_end),
          lastAt: ms(pay.last_at),
          fans: num(pay.fans),
          fanSeconds: num(pay.fan_seconds),
          periodsPaid: num(pay.periods_paid),
        }
      : null,
    lineup,
    cards: (Array.isArray(r.cards) ? r.cards : []).map((c) => {
      const x = c as Record<string, unknown>;
      return {
        id: String(x.id),
        playerId: String(x.player_id),
        tier: String(x.tier) as CardTier,
        fans: num(x.fans),
        source: (String(x.source) as FCard['source']) ?? 'chest',
        acquiredAt: String(x.acquired_at ?? ''),
      };
    }),
    pending: (Array.isArray(r.pending) ? r.pending : []).map(toOpen),
    chests: (Array.isArray(r.chests) ? r.chests : []).map((c) => {
      const x = c as Record<string, unknown>;
      return {
        id: String(x.id) as ChestId,
        price: num(x.price),
        picks: num(x.picks),
        guarantee: String(x.guarantee) as CardTier,
        odds: (Array.isArray(x.odds) ? x.odds : []).map((o) => {
          const y = o as Record<string, unknown>;
          return { tier: String(y.tier) as CardTier, bps: num(y.bps), minScoreBp: num(y.min_score_bp) };
        }),
      };
    }),
    franchises: (Array.isArray(r.franchises) ? r.franchises : []).map((f) => {
      const x = f as Record<string, unknown>;
      return { teamId: String(x.team_id), name: String(x.name), championships: num(x.championships), price: num(x.price) };
    }),
    paidNow: num(r.paid_now),
  };
}

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);
const NETWORK_FAILURE = /failed to fetch|load failed|networkerror|network request failed/i;

function failureFrom(error: { code?: string; message?: string }): FFailure {
  const msg = error.message ?? '';
  if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return 'unavailable';
  if (msg.includes('insufficient_funds')) return 'insufficient';
  if (msg.includes('starter_claimed')) return 'starter_claimed';
  if (msg.includes('no_franchise')) return 'no_franchise';
  if (msg.includes('duplicate_player')) return 'duplicate_player';
  if (msg.includes('invalid_slot')) return 'invalid_slot';
  if (msg.includes('permanent_account_required') || msg.includes('not_owned')) return 'account';
  if (NETWORK_FAILURE.test(msg)) return 'offline';
  return 'error';
}

async function call<T>(fn: string, args: Record<string, unknown> | undefined, map: (raw: unknown) => T): Promise<FResult<T>> {
  try {
    let data: unknown;
    if (isFranchisePreview()) {
      const { previewV5Call } = await import('./franchiseV5Preview');
      const result = await previewV5Call(fn, args);
      if (result.ok === false) return result;
      data = result.data;
    } else {
      const res = await getSupabaseBrowserClient().rpc(fn, args);
      if (res.error) {
        const reason = failureFrom(res.error);
        if (reason === 'error') console.error(`[franchise] ${fn} failed`, res.error.message);
        return { ok: false, reason };
      }
      data = res.data;
    }
    return { ok: true, data: map(data) };
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err ?? '');
    if (/before v5/.test(text)) return { ok: false, reason: 'unavailable' };
    if (NETWORK_FAILURE.test(text)) return { ok: false, reason: 'offline' };
    console.error(`[franchise] ${fn} failed`, text);
    return { ok: false, reason: 'error' };
  }
}

export const fetchFranchiseState = () => call('franchise_v5_state', undefined, toState);
export const markFranchiseIntro = () => call('franchise_v5_mark_intro', undefined, () => true);
export const buyFranchiseV5 = (teamId: string) => call('franchise_v5_buy', { p_team: teamId }, toState);
export const openChest = (chestId: ChestId, requestId: string) =>
  call('franchise_v5_open_chest', { p_chest: chestId, p_request: requestId }, (raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return { open: toOpen(r.open), state: toState(r.state) };
  });
export const markChestRevealed = (openId: string) => call('franchise_v5_reveal', { p_open: openId }, toState);
export const setLineupSlot = (slot: Slot, cardId: string) =>
  call('franchise_v5_set_lineup', { p_slot: slot, p_card: cardId }, toState);
/** Sell an extra copy of a player version for its tier's pack price (20261102_1). */
export const sellDuplicateCard = (cardId: string) =>
  call('franchise_v5_sell_duplicate', { p_card: cardId }, (raw) => ({
    state: toState(raw),
    sold: num((raw as { sold?: unknown })?.sold),
  }));

/** A fresh id for one tap of "open"; retries of the same tap reuse it. */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
