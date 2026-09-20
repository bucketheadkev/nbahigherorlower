import type { Session, User } from '@supabase/supabase-js';
import { isAnonymousUser, isPermanentAuthUser } from '@/lib/account/userKind';
import { getSupabaseBrowserClient } from './client';

export type AuthReadyState =
  | { status: 'loading' }
  | { status: 'ready'; session: Session; user: User }
  | { status: 'error'; message: string };

let ensureInFlight: Promise<Session> | null = null;

/** Clears in-flight multiplayer session ensure (after account deletion / logout). */
export function resetAuthSessionCache(): void {
  ensureInFlight = null;
}

function authErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message?: unknown }).message ?? '').trim();
    if (msg) return msg;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Could not sign in. Check your connection and try again.';
}

/**
 * Ensures a Supabase session exists for 1v1 multiplayer RPCs.
 *
 * - If a permanent (email) session is already persisted, it is kept as-is.
 * - If an anonymous session exists, it is kept as-is.
 * - Only when there is no session does this create a new anonymous user.
 *
 * Never replaces a permanent account with a fresh anonymous sign-in.
 */
export async function ensureAnonymousSession(): Promise<Session> {
  if (ensureInFlight) return ensureInFlight;

  ensureInFlight = (async () => {
    const supabase = getSupabaseBrowserClient();

    const { data: existing, error: existingError } = await supabase.auth.getSession();
    if (existingError) {
      throw new Error(authErrorMessage(existingError));
    }
    if (existing.session?.user) {
      // Permanent or anonymous — both are valid JWT subjects for 1v1 RPCs.
      if (
        isPermanentAuthUser(existing.session.user) ||
        isAnonymousUser(existing.session.user)
      ) {
        return existing.session;
      }
      return existing.session;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      throw new Error(authErrorMessage(error));
    }
    if (!data.session?.user) {
      throw new Error('Anonymous sign-in did not return a session.');
    }
    return data.session;
  })();

  try {
    return await ensureInFlight;
  } finally {
    ensureInFlight = null;
  }
}
