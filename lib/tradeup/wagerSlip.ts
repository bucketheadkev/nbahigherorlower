/**
 * Bet on Yourself slip — the player's 1–3 pre-run wagers.
 *
 * Draft: chosen before the first spin (kept on this device until it locks).
 * Lock: the first SPIN of a Classic Run debits the total stake once.
 *   Signed-in → place_wager_slip (server); guests → the on-device Bank ledger.
 * Settle: once per slip when that run finishes (server judges signed-in slips).
 * A slip whose run never finished is forfeited when the next slip locks.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { appendLocalLedger, BANK_CHANGED_EVENT, getBankBalance } from './bank';
import {
  isWagerId,
  settleWagers,
  validateSlip,
  WAGER_BY_ID,
  type WagerPick,
  type WagerResult,
  type WagerRunFacts,
} from './wagers';

export const WAGER_SLIP_EVENT = 'oneb:wager-slip';

const DRAFT_KEY = 'oneb_wager_draft_v1';
const LOCAL_SLIP_KEY = 'oneb_wager_slip_v1';
const LEGACY_WAGER_KEY = 'oneb_cash_table_wager_v1';
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

export type SlipMode = 'local' | 'server';

export interface LockedSlip {
  id: string;
  runRef: string;
  mode: SlipMode;
  picks: WagerPick[];
  totalStake: number;
  status: 'open' | 'settled' | 'forfeited';
  results?: WagerResult[];
}

export type LockFailure = 'insufficient' | 'invalid' | 'error';

interface SlipState {
  draft: WagerPick[];
  current: LockedSlip | null;
  lockError: LockFailure | null;
}

const state: SlipState = { draft: [], current: null, lockError: null };
let draftLoaded = false;

function emit(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WAGER_SLIP_EVENT));
}

function notifyBank(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
}

function sanitizePicks(raw: unknown): WagerPick[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is WagerPick => Boolean(p) && isWagerId((p as WagerPick).id) && Number.isFinite((p as WagerPick).stake))
    .slice(0, 3);
}

function loadDraft(): void {
  if (draftLoaded || typeof window === 'undefined') return;
  draftLoaded = true;
  try {
    state.draft = sanitizePicks(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '[]'));
  } catch {
    state.draft = [];
  }
}

function readLocalSlip(): LockedSlip | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_SLIP_KEY) ?? 'null') as LockedSlip | null;
    return parsed && typeof parsed.id === 'string' ? { ...parsed, picks: sanitizePicks(parsed.picks) } : null;
  } catch {
    return null;
  }
}

function writeLocalSlip(slip: LockedSlip | null): void {
  try {
    if (slip) localStorage.setItem(LOCAL_SLIP_KEY, JSON.stringify(slip));
    else localStorage.removeItem(LOCAL_SLIP_KEY);
  } catch {
    /* private mode */
  }
}

/* ── Draft ─────────────────────────────────────────────────────── */

export function getSlipState(): Readonly<SlipState> {
  loadDraft();
  return state;
}

export function setDraft(picks: WagerPick[]): void {
  loadDraft();
  state.draft = sanitizePicks(picks);
  state.lockError = null;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.draft));
  } catch {
    /* private mode */
  }
  emit();
}

/* ── Run lifecycle ─────────────────────────────────────────────── */

/**
 * New Classic Run: forget the previous run's slip in memory and refund any open bet from the
 * retired single Cash Table on this device (its settlement no longer exists).
 */
export function beginWagerRun(): void {
  loadDraft();
  state.current = null;
  state.lockError = null;
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_WAGER_KEY) ?? 'null') as { id?: string } | null;
    if (legacy?.id) {
      appendLocalLedger({ ref: legacy.id, amount: 100_000, kind: 'cash_table_refund' });
      localStorage.removeItem(LEGACY_WAGER_KEY);
      notifyBank();
    }
  } catch {
    /* ignore */
  }
  emit();
}

function newSlipId(): string {
  return `slip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function lockLocal(runRef: string, picks: WagerPick[]): { ok: true; slip: LockedSlip } | { ok: false; reason: LockFailure } {
  const previous = readLocalSlip();
  if (previous && previous.status === 'open' && previous.runRef !== runRef) {
    writeLocalSlip({ ...previous, status: 'forfeited' }); // abandoned run — stake already taken
  }
  const invalid = validateSlip(picks, getBankBalance());
  if (invalid) return { ok: false, reason: invalid === 'insufficient' ? 'insufficient' : 'invalid' };
  const totalStake = picks.reduce((sum, p) => sum + p.stake, 0);
  const slip: LockedSlip = { id: newSlipId(), runRef, mode: 'local', picks, totalStake, status: 'open' };
  if (!appendLocalLedger({ ref: slip.id, amount: -totalStake, kind: 'cash_table_wager' })) {
    return { ok: false, reason: 'error' };
  }
  writeLocalSlip(slip);
  return { ok: true, slip };
}

type ServerSlipRow = {
  slip_id?: string;
  status?: string;
  total_stake?: number;
  items?: Array<{ id: string; stake: number; multiplier_x100: number; won: boolean | null; returned: number }>;
};

function slipFromServer(row: ServerSlipRow, runRef: string, fallback: WagerPick[]): LockedSlip {
  const items = Array.isArray(row.items) ? row.items : [];
  const picks = items.length
    ? items.filter((i) => isWagerId(i.id)).map((i) => ({ id: i.id as WagerPick['id'], stake: Number(i.stake) }))
    : fallback;
  const status = row.status === 'settled' || row.status === 'forfeited' ? row.status : 'open';
  return {
    id: String(row.slip_id ?? ''),
    runRef,
    mode: 'server',
    picks,
    totalStake: Number(row.total_stake) || picks.reduce((s, p) => s + p.stake, 0),
    status,
    results:
      status === 'settled'
        ? items
            .filter((i) => isWagerId(i.id))
            .map((i) => ({
              id: i.id as WagerPick['id'],
              stake: Number(i.stake),
              multiplierX100: Number(i.multiplier_x100),
              won: Boolean(i.won),
              returned: Number(i.returned) || 0,
            }))
        : undefined,
  };
}

/**
 * Locks the drafted wagers for this run (called on the run's first SPIN, before any draft
 * information is shown). No draft → nothing happens.
 */
export async function lockDraftForRun(runRef: string, permanent: boolean): Promise<LockedSlip | null> {
  loadDraft();
  const picks = state.draft;
  if (picks.length === 0 || state.current) return state.current;

  let result: { ok: true; slip: LockedSlip } | { ok: false; reason: LockFailure };
  if (permanent) {
    result = await lockServer(runRef, picks);
  } else {
    result = lockLocal(runRef, picks);
  }

  if (result.ok === false) {
    state.lockError = result.reason;
    emit();
    return null;
  }
  state.current = result.slip;
  state.lockError = null;
  setDraft([]);
  notifyBank();
  return result.slip;
}

async function lockServer(
  runRef: string,
  picks: WagerPick[],
): Promise<{ ok: true; slip: LockedSlip } | { ok: false; reason: LockFailure }> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('place_wager_slip', {
      p_client_run_id: runRef,
      p_picks: picks,
    });
    if (error) {
      // Server without the slip migration: this device's Bank holds the wager instead.
      if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return lockLocal(runRef, picks);
      if (error.message?.includes('insufficient_funds')) return { ok: false, reason: 'insufficient' };
      if (error.message?.includes('invalid_slip')) return { ok: false, reason: 'invalid' };
      console.error('[wagers] place failed', error.message);
      return { ok: false, reason: 'error' };
    }
    return { ok: true, slip: slipFromServer((data ?? {}) as ServerSlipRow, runRef, picks) };
  } catch (err) {
    console.error('[wagers] place error', err);
    return { ok: false, reason: 'error' };
  }
}

/** Guest settlement at the end of the run. Pays once; returns the per-wager results. */
export function settleLocalSlip(runRef: string, facts: WagerRunFacts): WagerResult[] | null {
  const slip = state.current?.mode === 'local' ? state.current : null;
  const stored = readLocalSlip();
  if (!slip || !stored || stored.id !== slip.id || stored.runRef !== runRef) return null;
  if (stored.status === 'settled') return stored.results ?? null;
  if (stored.status !== 'open') return null;
  const results = settleWagers(stored.picks, facts);
  const returned = results.reduce((sum, r) => sum + r.returned, 0);
  const settled: LockedSlip = { ...stored, status: 'settled', results };
  writeLocalSlip(settled);
  state.current = settled;
  if (returned > 0) appendLocalLedger({ ref: stored.id, amount: returned, kind: 'cash_table_payout' });
  notifyBank();
  emit();
  return results;
}

/** Signed-in settlement after the verified submit. The server prices the lineup. */
export async function settleServerSlip(
  runRef: string,
  fifthPlayerId: string | null,
  rerollsUsed: boolean,
): Promise<WagerResult[] | null> {
  if (state.current?.mode !== 'server' || state.current.runRef !== runRef) return null;
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('settle_wager_slip', {
      p_client_run_id: runRef,
      p_fifth_player_id: fifthPlayerId,
      p_rerolls_used: rerollsUsed,
    });
    if (error) {
      console.error('[wagers] settle failed', error.message);
      return null;
    }
    const slip = slipFromServer((data ?? {}) as ServerSlipRow, runRef, state.current.picks);
    state.current = slip;
    notifyBank();
    emit();
    return slip.results ?? null;
  } catch (err) {
    console.error('[wagers] settle error', err);
    return null;
  }
}

export function slipTotals(picks: WagerPick[]): { atRisk: number; maxReturn: number } {
  return picks.reduce(
    (acc, p) => ({
      atRisk: acc.atRisk + p.stake,
      maxReturn: acc.maxReturn + Math.floor((p.stake * WAGER_BY_ID[p.id].multiplierX100) / 100),
    }),
    { atRisk: 0, maxReturn: 0 },
  );
}
