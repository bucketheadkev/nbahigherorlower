/**
 * Franchise Ownership — server calls (supabase/migrations/20261024_1, 20261024_3, 20261025_2, 20261025_4).
 * The server owns every rule: prices, spins, pick eligibility, fans, hourly pay, timing and resale.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { franchiseTier, TIER_ORDER, type FranchiseTier } from '@/lib/tradeup/ownership/config';
import type { Position } from '@/lib/tradeup/types';
import { isFranchisePreview, previewCall } from './franchisePreview';

export interface FranchisePick {
  slot: Position;
  playerId: string;
  value: number;
  /** The player's fans as stored by the server at pick time. */
  fans: number | null;
}

/** `complete` = the 48 hours are over; anything unpaid waits in the earnings summary. */
export type FranchiseCycleStatus = 'drafting' | 'earning' | 'complete';

export interface FranchiseCycle {
  id: string;
  teamId: string;
  status: FranchiseCycleStatus;
  picks: FranchisePick[];
  spin: { teamId: string; era: string } | null;
  lineupValue: number | null;
  /** Fixed at lock. Null for rosters locked before fans existed. */
  fans: number | null;
  /** Fan Power in thousandths, fixed at lock. */
  fanPowerMilli: number | null;
  cycleTotal: number | null;
  hourlyRate: number | null;
  hoursTotal: number | null;
  hoursEarned: number;
  hoursPaid: number;
  completionBonus: number | null;
  bonusEarned: boolean;
  bonusPaid: boolean;
  /** Earned and not yet collected (hours + bonus once earned). */
  unpaid: number;
  lockedAt: string | null;
  endsAt: string | null;
}

export interface FranchiseListing {
  teamId: string;
  name: string;
  championships: number;
  tier: FranchiseTier;
  price: number;
}

export interface FranchiseOwned {
  teamId: string;
  pricePaid: number;
  purchasedAt: string | null;
  resaleValue: number;
}

export interface FranchiseSnapshot {
  serverTime: string;
  resaleBps: number;
  owned: FranchiseOwned | null;
  cycle: FranchiseCycle | null;
  franchises: FranchiseListing[];
}

export interface FranchiseSale {
  teamId: string;
  proceeds: number;
  income: number;
  hours: number;
  bonus: number;
  forfeitedHours: number;
  forfeitedBonus: number;
}

export type FranchiseFailure =
  | 'unavailable'
  | 'account'
  | 'insufficient'
  | 'already_own'
  | 'cycle_active'
  | 'collect_first'
  | 'invalid_pick'
  | 'error';

export type FranchiseResult<T> = { ok: true; data: T } | { ok: false; reason: FranchiseFailure };

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);
const POSITIONS = new Set(['PG', 'SG', 'SF', 'PF', 'C']);

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const numOrNull = (v: unknown) => (v == null ? null : num(v));

export function toCycle(raw: unknown): FranchiseCycle | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const spin = r.spin as Record<string, unknown> | null;
  const status: FranchiseCycleStatus =
    r.status === 'earning' || r.status === 'complete' ? r.status : 'drafting';
  return {
    id: String(r.id),
    teamId: String(r.team_id),
    status,
    picks: (Array.isArray(r.picks) ? r.picks : [])
      .map((p) => p as Record<string, unknown>)
      .filter((p) => POSITIONS.has(String(p.slot)))
      .map((p) => ({
        slot: String(p.slot) as Position,
        playerId: String(p.player_id),
        value: num(p.value),
        fans: numOrNull(p.fans),
      })),
    spin: spin && spin.team_id ? { teamId: String(spin.team_id), era: String(spin.era) } : null,
    lineupValue: numOrNull(r.lineup_value),
    fans: numOrNull(r.fans),
    fanPowerMilli: numOrNull(r.fan_power_milli),
    cycleTotal: numOrNull(r.cycle_total),
    hourlyRate: numOrNull(r.hourly_rate),
    hoursTotal: numOrNull(r.hours_total),
    hoursEarned: num(r.hours_earned),
    hoursPaid: num(r.hours_paid),
    completionBonus: numOrNull(r.completion_bonus),
    bonusEarned: Boolean(r.bonus_earned),
    bonusPaid: Boolean(r.bonus_paid),
    unpaid: num(r.unpaid),
    lockedAt: typeof r.locked_at === 'string' ? r.locked_at : null,
    endsAt: typeof r.ends_at === 'string' ? r.ends_at : null,
  };
}

/** Older Franchise servers price and pay differently; the app must not trade against them. */
class OutdatedServerError extends Error {}

const TIERS = new Set<string>(TIER_ORDER);

function toSnapshot(raw: unknown): FranchiseSnapshot {
  const r = (raw ?? {}) as Record<string, unknown>;
  const settings = (r.settings ?? {}) as Record<string, unknown>;
  if (!('owned' in r) || num(settings.version) < 4) throw new OutdatedServerError('franchise server is before v4');
  const owned = r.owned as Record<string, unknown> | null;
  return {
    serverTime: typeof r.server_time === 'string' ? r.server_time : new Date().toISOString(),
    resaleBps: num(settings.resale_bps),
    owned:
      owned && owned.team_id
        ? {
            teamId: String(owned.team_id),
            pricePaid: num(owned.price_paid),
            purchasedAt: typeof owned.purchased_at === 'string' ? owned.purchased_at : null,
            resaleValue: num(owned.resale_value),
          }
        : null,
    cycle: toCycle(r.cycle),
    franchises: (Array.isArray(r.franchises) ? r.franchises : []).map((f) => {
      const row = f as Record<string, unknown>;
      return {
        teamId: String(row.team_id),
        name: String(row.name),
        championships: num(row.championships),
        tier: TIERS.has(String(row.tier)) ? (String(row.tier) as FranchiseTier) : franchiseTier(String(row.team_id)),
        price: num(row.price),
      };
    }),
  };
}

function toSale(raw: unknown): { snapshot: FranchiseSnapshot; sale: FranchiseSale | null } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const s = r.sale as Record<string, unknown> | null;
  return {
    snapshot: toSnapshot(r.snapshot),
    sale: s
      ? {
          teamId: String(s.team_id),
          proceeds: num(s.proceeds),
          income: num(s.income),
          hours: num(s.hours),
          bonus: num(s.bonus),
          forfeitedHours: num(s.forfeited_hours),
          forfeitedBonus: num(s.forfeited_bonus),
        }
      : null,
  };
}

function failureFrom(error: { code?: string; message?: string }): FranchiseFailure {
  const msg = error.message ?? '';
  if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return 'unavailable';
  if (msg.includes('insufficient_funds')) return 'insufficient';
  if (msg.includes('already_own_one')) return 'already_own';
  if (msg.includes('cycle_active')) return 'cycle_active';
  if (msg.includes('collect_first')) return 'collect_first';
  if (msg.includes('invalid_pick')) return 'invalid_pick';
  if (msg.includes('permanent_account_required') || msg.includes('not_owned')) return 'account';
  return 'error';
}

/** No response at all (offline, sleep/wake, Wi-Fi switch). Transient; the screen retries on its timer. */
const NETWORK_FAILURE = /failed to fetch|load failed|networkerror|network request failed/i;

function logFailure(fn: string, detail: unknown) {
  const text = detail instanceof Error ? detail.message : String(detail ?? '');
  if (NETWORK_FAILURE.test(text)) console.warn(`[franchise] ${fn} offline`, text);
  else console.error(`[franchise] ${fn} failed`, text);
}

export async function franchiseRpc<T>(
  fn: string,
  args: Record<string, unknown> | undefined,
  map: (raw: unknown) => T,
): Promise<FranchiseResult<T>> {
  if (isFranchisePreview()) {
    const result = await previewCall(fn, args);
    return result.ok === true ? { ok: true, data: map(result.data) } : { ok: false, reason: result.reason };
  }
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc(fn, args);
    if (error) {
      const reason = failureFrom(error);
      if (reason === 'error') logFailure(fn, error.message);
      return { ok: false, reason };
    }
    return { ok: true, data: map(data) };
  } catch (err) {
    if (err instanceof OutdatedServerError) return { ok: false, reason: 'unavailable' };
    logFailure(fn, err);
    return { ok: false, reason: 'error' };
  }
}

const cycleOrThrow = (raw: unknown): FranchiseCycle => {
  const cycle = toCycle(raw);
  if (!cycle) throw new Error('bad cycle');
  return cycle;
};

export const fetchFranchises = () => franchiseRpc('get_franchises', undefined, toSnapshot);
export const buyFranchise = (teamId: string) => franchiseRpc('buy_franchise', { p_team: teamId }, toSnapshot);
export const sellFranchise = (teamId: string) => franchiseRpc('sell_franchise', { p_team: teamId }, toSale);
export const startFranchiseDraft = (teamId: string) =>
  franchiseRpc('start_franchise_draft', { p_team: teamId }, toSnapshot);
export const spinFranchiseDraft = (cycleId: string) => franchiseRpc('franchise_spin', { p_cycle: cycleId }, cycleOrThrow);
export const pickFranchisePlayer = (cycleId: string, playerId: string, slot: Position) =>
  franchiseRpc('franchise_pick', { p_cycle: cycleId, p_player_id: playerId, p_slot: slot }, cycleOrThrow);
export const moveFranchisePlayer = (cycleId: string, from: Position, to: Position) =>
  franchiseRpc('franchise_move', { p_cycle: cycleId, p_from: from, p_to: to }, cycleOrThrow);
export const confirmFranchiseLineup = (cycleId: string) =>
  franchiseRpc('confirm_franchise_lineup', { p_cycle: cycleId }, cycleOrThrow);
