import { clearLocalUserData } from '@/lib/account/clearLocalUserData';
import { mapRoomRpcError } from '@/lib/multiplayer/types';
import {
  ensureAnonymousSession,
  resetAuthSessionCache,
} from '@/lib/supabase/auth';
import {
  getSupabaseBrowserClient,
  resetSupabaseBrowserClient,
} from '@/lib/supabase/client';

export type DeleteUserDataResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Permanently deletes the current anonymous Supabase identity, associated
 * multiplayer records, and local installation data, then creates a fresh session.
 */
export async function deleteUserData(): Promise<DeleteUserDataResult> {
  try {
    await ensureAnonymousSession();
    const supabase = getSupabaseBrowserClient();

    const { data, error } = await supabase.rpc('delete_my_data');
    if (error) {
      throw mapRoomRpcError(error);
    }

    const payload = data as { ok?: boolean; deleted?: boolean } | null;
    if (!payload?.ok || !payload?.deleted) {
      throw new Error(
        'Delete did not complete. Try again or contact onebillionrun@gmail.com.',
      );
    }

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* session may already be invalid after auth.users delete */
    }

    clearLocalUserData();
    resetSupabaseBrowserClient();
    resetAuthSessionCache();

    await ensureAnonymousSession();
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : 'Could not delete your data. Try again or contact onebillionrun@gmail.com.';
    return { ok: false, message };
  }
}
