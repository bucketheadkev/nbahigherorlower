/**
 * Server coin balance for signed-in accounts (coin_accounts / get_my_coin_balance).
 * Local XP profile remains the spend/earn cache; cloud is the permanent-account source
 * of truth when higher (admin grants, verified IAP).
 */

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getXpProfile, saveXpProfile, XP_CHANGED_EVENT } from './storage';

/** Pull cloud coins and raise the local balance if the server is ahead (never lowers). */
export async function syncCloudCoinsIntoLocal(): Promise<number | null> {
  if (typeof window === 'undefined') return null;
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc('get_my_coin_balance');
    if (error) {
      // Migration not applied yet — leave local coins alone.
      return null;
    }
    const cloud = Math.max(0, Math.floor(Number(data) || 0));
    const profile = getXpProfile();
    if (cloud > profile.coins) {
      saveXpProfile({ ...profile, coins: cloud });
      window.dispatchEvent(new Event(XP_CHANGED_EVENT));
    }
    return cloud;
  } catch {
    return null;
  }
}
