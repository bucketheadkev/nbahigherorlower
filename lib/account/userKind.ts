import type { User } from '@supabase/supabase-js';

/** True when the JWT belongs to a Supabase anonymous user. */
export function isAnonymousUser(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.is_anonymous === true) return true;
  const provider = user.app_metadata?.provider;
  if (provider === 'anonymous') return true;
  return false;
}

export function isPermanentAuthUser(user: User | null | undefined): boolean {
  return Boolean(user && !isAnonymousUser(user));
}
