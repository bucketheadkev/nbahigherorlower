/**
 * Server coin balance for signed-in accounts (web + iOS).
 *
 * Permanent accounts: server ledger is authoritative.
 * Clients never choose credit amounts — only named claim/spend RPCs.
 * Guests stay local-only.
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isPermanentAuthUser } from '@/lib/account/userKind';
import { getXpProfile, setXpCoins, XP_CHANGED_EVENT } from './storage';

/** Last cloud balance applied for this user. */
export const COIN_CLOUD_SYNCED_KEY = 'oneb_coin_cloud_synced_v1';

type SyncedMap = Record<string, number>;

const MISSING_RPC = new Set(['PGRST202', '42883']);

function readSyncedMap(): SyncedMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(COIN_CLOUD_SYNCED_KEY) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: SyncedMap = {};
    for (const [uid, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        out[uid] = Math.floor(value);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeSynced(userId: string, cloud: number): void {
  if (typeof window === 'undefined') return;
  try {
    const map = readSyncedMap();
    map[userId] = Math.max(0, Math.floor(cloud));
    localStorage.setItem(COIN_CLOUD_SYNCED_KEY, JSON.stringify(map));
  } catch {
    /* private mode */
  }
}

async function permanentUserId(): Promise<string | null> {
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    const user = data.session?.user ?? null;
    if (!user || !isPermanentAuthUser(user)) return null;
    return user.id;
  } catch {
    return null;
  }
}

async function fetchCloudBalance(): Promise<number | null> {
  try {
    const { data, error } = await getSupabaseBrowserClient().rpc('get_my_coin_balance');
    if (error) return null;
    return Math.max(0, Math.floor(Number(data) || 0));
  } catch {
    return null;
  }
}

function applyCloud(userId: string, cloud: number): number {
  setXpCoins(cloud);
  writeSynced(userId, cloud);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(XP_CHANGED_EVENT));
  }
  void getXpProfile();
  return cloud;
}

/**
 * Pull server coins and set local = cloud (absolute).
 * Never invents a catch-up credit from localStorage.
 */
export async function syncCloudCoinsIntoLocal(): Promise<number | null> {
  if (typeof window === 'undefined') return null;
  try {
    const userId = await permanentUserId();
    if (!userId) return null;
    const cloud = await fetchCloudBalance();
    if (cloud == null) return null;
    return applyCloud(userId, cloud);
  } catch {
    return null;
  }
}

/** Claim the one-time welcome gift (server amount). */
export async function claimWelcomeCoins(): Promise<number | null> {
  try {
    const userId = await permanentUserId();
    if (!userId) return null;
    const { data, error } = await getSupabaseBrowserClient().rpc('coin_claim_welcome');
    if (error) {
      if (error.code && MISSING_RPC.has(error.code)) return null;
      console.warn('[coins] welcome', error.message);
      return null;
    }
    const bal = Math.max(0, Math.floor(Number(data) || 0));
    return applyCloud(userId, bal);
  } catch {
    return null;
  }
}

/** Award Classic run coins from a verified leaderboard run (server amounts). */
export async function awardClassicRunCoins(clientRunId: string): Promise<number | null> {
  const ref = typeof clientRunId === 'string' ? clientRunId.trim() : '';
  if (!ref) return null;
  try {
    const userId = await permanentUserId();
    if (!userId) return null;
    const { data, error } = await getSupabaseBrowserClient().rpc('coin_award_classic_run', {
      p_client_run_id: ref,
    });
    if (error) {
      if (error.code && MISSING_RPC.has(error.code)) return null;
      if (/run_not_verified|duplicate|unique/i.test(error.message ?? '')) {
        return fetchCloudBalance().then((b) => (b == null ? null : applyCloud(userId, b)));
      }
      console.warn('[coins] run award', error.message);
      return null;
    }
    const bal = Math.max(0, Math.floor(Number(data) || 0));
    return applyCloud(userId, bal);
  } catch {
    return null;
  }
}

/**
 * Debit a paid Team/Era reroll (fixed 100) and count toward the server 3-boost
 * budget when `clientRunId` is provided.
 */
export async function spendRerollCoins(
  sourceRef: string,
  clientRunId?: string | null,
): Promise<number | null> {
  const ref = typeof sourceRef === 'string' ? sourceRef.trim() : '';
  if (!ref) return null;
  try {
    const userId = await permanentUserId();
    if (!userId) return null;
    const run =
      typeof clientRunId === 'string' && clientRunId.trim()
        ? clientRunId.trim().slice(0, 120)
        : null;
    const { data, error } = await getSupabaseBrowserClient().rpc('coin_spend_reroll', {
      p_source_ref: ref.slice(0, 180),
      ...(run ? { p_client_run_id: run } : {}),
    });
    if (error) {
      if (error.code && MISSING_RPC.has(error.code)) return null;
      console.warn('[coins] reroll spend', error.message);
      return null;
    }
    const bal = Math.max(0, Math.floor(Number(data) || 0));
    return applyCloud(userId, bal);
  } catch {
    return null;
  }
}

/**
 * @deprecated Unsafe generic credit — no longer posts to the server.
 * Kept so older call sites compile; local-only no-op for cloud.
 */
export function mirrorCoinCredit(
  _amount: number,
  _kind: 'run_award' | 'welcome' | 'iap_grant',
  _ref: string,
): void {
  /* intentional no-op — use claimWelcomeCoins / awardClassicRunCoins / IAP edge */
}

/**
 * @deprecated Prefer spendRerollCoins / coin_buy_perk_* RPCs.
 * Local spend already applied; best-effort allowlisted spend_my_coins.
 * Reroll refs use coin_spend_reroll (+ active run boost) instead.
 */
export function mirrorCoinSpend(amount: number, ref?: string): void {
  const cost = Math.max(0, Math.floor(amount));
  if (cost <= 0 || !ref) return;
  void (async () => {
    const userId = await permanentUserId();
    if (!userId) return;
    try {
      // Team/Era / perk gameplay spends: dedicated session RPCs only.
      // spend_my_coins is intentionally rejected server-side.
      if (ref.startsWith('reroll:') || ref.startsWith('perk_activate:')) {
        // Gameplay spends are owned by classic_boost_reroll / classic_perk_activate
        // (called from the draft UI with stable action ids). Sync balance only.
        const bal = await fetchCloudBalance();
        if (bal != null) applyCloud(userId, bal);
        return;
      }
      // Pack/bundle buys use coin_buy_perk_* — do not call spend_my_coins.
    } catch {
      /* offline */
    }
  })();
}
