/**
 * Server Classic run session helpers (permanent accounts).
 * Canonical id is the UUID from classic_run_begin.
 * Spins are server-authored (classic_spin) — client only animates the result.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isPermanentAuthUser } from '@/lib/account/userKind';
import { listValidSpinPairs, type SpinPair } from '@/lib/tradeup/billionDollar';

const MISSING_RPC = new Set(['PGRST202', '42883']);

let activeSessionId: string | null = null;

export function getActiveClassicRunId(): string | null {
  return activeSessionId;
}

export function setActiveClassicRunId(id: string | null): void {
  activeSessionId = id && id.trim() ? id.trim().slice(0, 120) : null;
}

function actionId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`.slice(0, 80);
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`.slice(0, 80);
}

async function permanentReady(): Promise<boolean> {
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    const user = data.session?.user ?? null;
    return Boolean(user && isPermanentAuthUser(user));
  } catch {
    return false;
  }
}

function pairFromServer(teamId: string, era: string): SpinPair | null {
  const id = teamId.toUpperCase();
  const found = listValidSpinPairs().find((p) => p.team.id === id && p.era === era);
  if (found) return found;
  const anyTeam = listValidSpinPairs().find((p) => p.team.id === id);
  if (anyTeam) return { team: anyTeam.team, era: era as SpinPair['era'] };
  return null;
}

export async function beginClassicRunSession(_clientHint?: string): Promise<string | null> {
  try {
    if (!(await permanentReady())) return null;
    const { data, error } = await getSupabaseBrowserClient().rpc('classic_run_begin');
    if (error) {
      if (error.code && MISSING_RPC.has(error.code)) return null;
      console.warn('[classic-session] begin', error.message);
      return null;
    }
    const id = typeof data === 'string' ? data : String(data ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    setActiveClassicRunId(id);
    return id;
  } catch {
    return null;
  }
}

/** Server-authored spin (uniform team then era among valid open-seat pairs). */
export async function requestClassicSpin(): Promise<SpinPair | null> {
  const session = activeSessionId;
  if (!session) return null;
  try {
    if (!(await permanentReady())) return null;
    const { data, error } = await getSupabaseBrowserClient().rpc('classic_spin', {
      p_session: session,
      p_action_id: actionId('spin'),
    });
    if (error) {
      if (error.code && MISSING_RPC.has(error.code)) return null;
      console.warn('[classic-session] spin', error.message);
      return null;
    }
    const row = (data ?? {}) as Record<string, unknown>;
    const team = String(row.spin_team ?? '');
    const era = String(row.spin_era ?? '');
    if (!team || !era) return null;
    return pairFromServer(team, era);
  } catch {
    return null;
  }
}

/** @deprecated Client-chosen spins are rejected server-side. */
export async function commitClassicSpin(_teamId: string, _era: string): Promise<boolean> {
  return (await requestClassicSpin()) != null;
}

export async function commitClassicPick(playerId: string, slot: string): Promise<boolean> {
  const session = activeSessionId;
  if (!session) return false;
  try {
    if (!(await permanentReady())) return false;
    const { error } = await getSupabaseBrowserClient().rpc('classic_pick_commit', {
      p_session: session,
      p_player_id: playerId,
      p_slot: slot,
      p_action_id: actionId('pick'),
    });
    if (error) {
      if (error.code && MISSING_RPC.has(error.code)) return false;
      console.warn('[classic-session] pick', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function commitClassicSwap(outSlot: string, inPlayerId: string): Promise<boolean> {
  const session = activeSessionId;
  if (!session) return false;
  try {
    if (!(await permanentReady())) return false;
    const { error } = await getSupabaseBrowserClient().rpc('classic_swap_commit', {
      p_session: session,
      p_out_slot: outSlot,
      p_in_player_id: inPlayerId,
      p_action_id: actionId('swap'),
    });
    if (error) {
      if (error.code && MISSING_RPC.has(error.code)) return false;
      console.warn('[classic-session] swap', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function completeClassicRunSession(_ignored?: string): Promise<{
  ok: boolean;
  verifiedValue?: number;
  coinsBalance?: number;
}> {
  const session = activeSessionId;
  if (!session) return { ok: false };
  try {
    if (!(await permanentReady())) return { ok: false };
    const { data, error } = await getSupabaseBrowserClient().rpc('classic_run_submit', {
      p_session: session,
    });
    if (error) {
      if (error.code && MISSING_RPC.has(error.code)) return { ok: false };
      console.warn('[classic-session] submit', error.message);
      return { ok: false };
    }
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      ok: row.ok === true,
      verifiedValue: Math.max(0, Math.floor(Number(row.verified_value) || 0)),
      coinsBalance:
        row.coins_balance == null ? undefined : Math.max(0, Math.floor(Number(row.coins_balance) || 0)),
    };
  } catch {
    return { ok: false };
  }
}

export type ClassicBoostKind =
  | 'reroll_team'
  | 'reroll_era'
  | 'perk_double_draft'
  | 'perk_xray'
  | 'perk_player_swap';

export async function consumeClassicBoost(
  _clientRunId: string,
  kind: ClassicBoostKind,
): Promise<{ boostsUsed: number | null; spin?: SpinPair | null }> {
  const session = activeSessionId;
  if (!session) return { boostsUsed: null };
  try {
    if (!(await permanentReady())) return { boostsUsed: null };
    if (kind.startsWith('perk_')) {
      const perk = kind.replace(/^perk_/, '');
      const { data, error } = await getSupabaseBrowserClient().rpc('classic_perk_activate', {
        p_session: session,
        p_perk: perk,
        p_action_id: actionId(`perk_${perk}`),
      });
      if (error) {
        if (error.code && MISSING_RPC.has(error.code)) return { boostsUsed: null };
        console.warn('[classic-session] perk', error.message);
        return { boostsUsed: null };
      }
      const row = (data ?? {}) as Record<string, unknown>;
      return { boostsUsed: Math.max(0, Math.floor(Number(row.boosts_used) || 0)) };
    }
    const { data, error } = await getSupabaseBrowserClient().rpc('classic_boost_reroll', {
      p_session: session,
      p_kind: kind,
      p_action_id: actionId(kind),
    });
    if (error) {
      if (error.code && MISSING_RPC.has(error.code)) return { boostsUsed: null };
      console.warn('[classic-session] boost', error.message);
      return { boostsUsed: null };
    }
    const row = (data ?? {}) as Record<string, unknown>;
    const team = String(row.spin_team ?? '');
    const era = String(row.spin_era ?? '');
    return {
      boostsUsed: Math.max(0, Math.floor(Number(row.boosts_used) || 0)),
      spin: team && era ? pairFromServer(team, era) : null,
    };
  } catch {
    return { boostsUsed: null };
  }
}

export async function consumeServerPerk(perk: string, _runRef?: string): Promise<boolean> {
  const used = await consumeClassicBoost('', `perk_${perk}` as ClassicBoostKind);
  return used.boostsUsed != null;
}
