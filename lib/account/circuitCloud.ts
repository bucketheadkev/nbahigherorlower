/**
 * The Circuit — Cash Leagues (supabase/migrations/20261018_3_the_circuit.sql).
 * Competitions, fees, entries, deadlines and payouts are all server-side.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { BANK_CHANGED_EVENT } from '@/lib/tradeup/bank';

export type CircuitFormat = 'open_run' | 'no_reroll';

const FORMATS = new Set<string>(['open_run', 'no_reroll']);

export interface CircuitStanding {
  rank: number;
  username: string;
  runValue: number;
  isMe: boolean;
  /** Final payout (finished leagues only). */
  payout?: number;
}

export interface CircuitEntry {
  attemptId: string | null;
  runValue: number | null;
  rank: number | null;
  payout: number;
}

export interface CircuitCompetition {
  id: string;
  format: CircuitFormat;
  name: string;
  entryFee: number;
  rerollsAllowed: boolean;
  startsAt: string;
  endsAt: string;
  status: 'open' | 'settled' | 'cancelled';
  cancelReason: string | null;
  /** Submitted runs needed to pay out; fewer → refunds. */
  minRuns: number;
  participants: number;
  submitted: number;
  prizePool: number;
  /** 1st, 2nd, 3rd prize at the current pool. */
  prizes: number[];
  standings: CircuitStanding[];
  me: CircuitEntry | null;
}

export interface CircuitSnapshot {
  /** Server clock minus device clock, so countdowns match the real deadline. */
  clockOffsetMs: number;
  competitions: CircuitCompetition[];
}

/** Everything a client needs to play the official entry run. */
export interface CircuitRunConfig {
  competitionId: string;
  format: CircuitFormat;
  name: string;
  attemptId: string;
  rerollsAllowed: boolean;
}

export type CircuitFailure =
  | 'unavailable'
  | 'insufficient'
  | 'closed'
  | 'account'
  | 'played'
  | 'error';

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883', '42P01']);

function reasonFrom(error: { code?: string; message?: string }): CircuitFailure {
  const message = error.message ?? '';
  if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return 'unavailable';
  if (message.includes('insufficient_funds')) return 'insufficient';
  if (message.includes('entries_closed') || message.includes('competition_closed')) return 'closed';
  if (message.includes('permanent_account_required') || message.includes('profile_required')) return 'account';
  if (message.includes('entry_already_played')) return 'played';
  console.error('[circuit]', error.message);
  return 'error';
}

const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

/** Mirrors public.circuit_prizes: 50 / 30 / 20, remainder dollars to 1st. */
export const PRIZE_SHARES = [50, 30, 20] as const;

export function prizesFor(pool: number): number[] {
  const second = Math.floor((pool * 30) / 100);
  const third = Math.floor((pool * 20) / 100);
  return [pool - second - third, second, third];
}

function mapStanding(s: Record<string, unknown>, index: number): CircuitStanding {
  return {
    rank: s.rank == null ? index + 1 : num(s.rank),
    username: String(s.username ?? ''),
    runValue: num(s.run_value),
    isMe: Boolean(s.is_me),
    payout: s.payout == null ? undefined : num(s.payout),
  };
}

function mapStatus(v: unknown): CircuitCompetition['status'] {
  return v === 'settled' || v === 'cancelled' ? v : 'open';
}

function mapCompetition(raw: Record<string, unknown>): CircuitCompetition {
  const me = raw.me as Record<string, unknown> | null;
  const standings = Array.isArray(raw.standings) ? (raw.standings as Array<Record<string, unknown>>) : [];
  return {
    id: String(raw.id),
    format: raw.format as CircuitFormat,
    name: String(raw.name ?? ''),
    entryFee: num(raw.entry_fee),
    rerollsAllowed: Boolean(raw.rerolls_allowed),
    startsAt: String(raw.starts_at),
    endsAt: String(raw.ends_at),
    status: mapStatus(raw.status),
    cancelReason: typeof raw.cancel_reason === 'string' ? raw.cancel_reason : null,
    minRuns: num(raw.min_runs) || 3,
    participants: num(raw.participants),
    submitted: num(raw.submitted),
    prizePool: num(raw.prize_pool),
    prizes: Array.isArray(raw.prizes) ? (raw.prizes as unknown[]).map(num) : prizesFor(num(raw.prize_pool)),
    standings: standings.map(mapStanding),
    me: me
      ? {
          attemptId: typeof me.attempt_id === 'string' ? me.attempt_id : null,
          runValue: me.run_value == null ? null : num(me.run_value),
          rank: me.rank == null ? null : num(me.rank),
          payout: num(me.payout),
        }
      : null,
  };
}

export async function fetchCircuit(): Promise<
  { ok: true; snapshot: CircuitSnapshot } | { ok: false; reason: CircuitFailure }
> {
  try {
    const requestedAt = Date.now();
    const { data, error } = await getSupabaseBrowserClient().rpc('get_circuit');
    if (error) return { ok: false, reason: reasonFrom(error) };
    const row = (data ?? {}) as Record<string, unknown>;
    const serverTime = Date.parse(String(row.server_time ?? ''));
    const midpoint = (requestedAt + Date.now()) / 2;
    // Retired cups (High Stakes) are dropped even before the server stops listing them.
    const competitions = Array.isArray(row.competitions)
      ? (row.competitions as Array<Record<string, unknown>>).filter((c) => FORMATS.has(String(c.format))).map(mapCompetition)
      : [];
    return {
      ok: true,
      snapshot: {
        clockOffsetMs: Number.isFinite(serverTime) ? serverTime - midpoint : 0,
        competitions,
      },
    };
  } catch (err) {
    console.error('[circuit] fetch error', err);
    return { ok: false, reason: 'error' };
  }
}

export async function enterCircuit(
  competitionId: string,
): Promise<{ ok: true; competition: CircuitCompetition } | { ok: false; reason: CircuitFailure }> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('enter_circuit', {
      p_competition: competitionId,
    });
    if (error) return { ok: false, reason: reasonFrom(error) };
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
    return { ok: true, competition: mapCompetition((data ?? {}) as Record<string, unknown>) };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function startCircuitRun(
  competition: CircuitCompetition,
): Promise<{ ok: true; config: CircuitRunConfig } | { ok: false; reason: CircuitFailure }> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('start_circuit_run', {
      p_competition: competition.id,
    });
    if (error) return { ok: false, reason: reasonFrom(error) };
    const row = (data ?? {}) as Record<string, unknown>;
    if (typeof row.attempt_id !== 'string') return { ok: false, reason: 'error' };
    return {
      ok: true,
      config: {
        competitionId: competition.id,
        format: competition.format,
        name: competition.name,
        attemptId: row.attempt_id,
        rerollsAllowed: Boolean(row.rerolls_allowed),
      },
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Dev-only `?circuitPreview=1`: sample leagues for design review. Nothing is charged or stored. */
export function isCircuitPreview(): boolean {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('circuitPreview') === '1';
  } catch {
    return false;
  }
}

const PREVIEW_NAMES = [
  'Vaultline', 'NorthStar', 'Kairo', 'Meridian', 'Halcyon', 'Brightwater', 'Okonkwo', 'Sable',
  'Ridgeline', 'Copperfield', 'Lumen', 'Atlas',
];

/** Deterministic sample standings; `meAt` (1-based) marks the player's row. */
export function previewStandings(count: number, top: number, meAt: number | null, pool = 0): CircuitStanding[] {
  const prizes = prizesFor(pool);
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    username: meAt === i + 1 ? 'You' : PREVIEW_NAMES[i % PREVIEW_NAMES.length]!,
    runValue: top - i * 6_000_000 - (i % 3) * 1_000_000,
    isMe: meAt === i + 1,
    payout: pool > 0 && i < 3 ? prizes[i] : undefined,
  }));
}

export function readCircuitPreview(): CircuitSnapshot | null {
  if (!isCircuitPreview()) return null;
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const base = { status: 'open' as const, cancelReason: null, minRuns: 3 };
  const fee = 25_000;
  const open = 7 * fee;
  const noReroll = 3 * fee;
  return {
    clockOffsetMs: 0,
    competitions: [
      {
        ...base, id: 'preview-open', format: 'open_run', name: 'Open Run', entryFee: fee, rerollsAllowed: true,
        startsAt: iso(now - 3_600_000 * 6), endsAt: iso(now + 3_600_000 * 5 + 754_000),
        participants: 7, submitted: 5, prizePool: open, prizes: prizesFor(open),
        standings: previewStandings(5, 1_061_000_000, 2),
        me: { attemptId: 'circuit_preview_open', runValue: 1_054_000_000, rank: 2, payout: 0 },
      },
      {
        ...base, id: 'preview-noreroll', format: 'no_reroll', name: 'No Reroll', entryFee: fee, rerollsAllowed: false,
        startsAt: iso(now - 3_600_000 * 20), endsAt: iso(now + 2_400_000),
        participants: 3, submitted: 2, prizePool: noReroll, prizes: prizesFor(noReroll),
        standings: previewStandings(2, 1_018_000_000, null), me: null,
      },
    ],
  };
}

/** Full ranked list (top 100 plus the caller) for a live or finished league. */
export async function fetchStandings(
  competitionId: string,
): Promise<
  | { ok: true; competition: CircuitCompetition; rows: CircuitStanding[] }
  | { ok: false; reason: CircuitFailure }
> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('get_circuit_standings', {
      p_competition: competitionId,
      p_limit: 100,
    });
    if (error) return { ok: false, reason: reasonFrom(error) };
    const raw = (data ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(raw.rows) ? (raw.rows as Array<Record<string, unknown>>) : [];
    return { ok: true, competition: mapCompetition(raw), rows: rows.map(mapStanding) };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
