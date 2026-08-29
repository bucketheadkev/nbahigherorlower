import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './client';

export type AuthReadyState =
  | { status: 'loading' }
  | { status: 'ready'; session: Session; user: User }
  | { status: 'error'; message: string };

let ensureInFlight: Promise<Session> | null = null;

/** Clears in-flight anonymous sign-in (after account deletion). */
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
 * Ensures an anonymous Supabase session exists.
 * Safe to call repeatedly; concurrent callers share one in-flight request.
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
