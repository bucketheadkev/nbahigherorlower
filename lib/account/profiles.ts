import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  isValidUsername,
  normalizeUsername,
  sanitizeUsernameDisplay,
} from './username';

export interface ProfileRow {
  user_id: string;
  username: string;
  username_normalized: string;
  created_at: string;
  updated_at: string;
}

export type ProfileResult =
  | { ok: true; profile: ProfileRow }
  | { ok: false; code: 'TAKEN' | 'INVALID' | 'UNAUTHORIZED' | 'UNKNOWN'; message: string };

function mapProfile(row: Record<string, unknown>): ProfileRow | null {
  if (
    typeof row.user_id !== 'string' ||
    typeof row.username !== 'string' ||
    typeof row.username_normalized !== 'string' ||
    typeof row.created_at !== 'string' ||
    typeof row.updated_at !== 'string'
  ) {
    return null;
  }
  return {
    user_id: row.user_id,
    username: row.username,
    username_normalized: row.username_normalized,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Case-insensitive availability check (public SELECT on profiles). */
export type UsernameAvailability = 'available' | 'taken' | 'invalid' | 'error';

export async function checkUsernameAvailability(raw: string): Promise<UsernameAvailability> {
  const display = sanitizeUsernameDisplay(raw);
  if (!isValidUsername(display)) return 'invalid';
  const normalized = normalizeUsername(display);
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('username_normalized', normalized)
    .maybeSingle();
  if (error) {
    console.warn('[profiles] username availability check failed', error.message);
    return 'error';
  }
  return data == null ? 'available' : 'taken';
}

/** @deprecated Prefer checkUsernameAvailability for clearer error handling. */
export async function isUsernameAvailable(raw: string): Promise<boolean> {
  const status = await checkUsernameAvailability(raw);
  return status === 'available' || status === 'error';
}

export async function fetchProfileForUser(userId: string): Promise<ProfileRow | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, username_normalized, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapProfile(data as Record<string, unknown>);
}

export async function createOwnProfile(rawUsername: string): Promise<ProfileResult> {
  const display = sanitizeUsernameDisplay(rawUsername);
  if (!isValidUsername(display)) {
    return {
      ok: false,
      code: 'INVALID',
      message: 'Letters, numbers, and underscores only (3–20 characters).',
    };
  }

  const supabase = getSupabaseBrowserClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'You need to be signed in to create a profile.',
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({ user_id: user.id, username: display })
    .select('user_id, username, username_normalized, created_at, updated_at')
    .single();

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    const code = String(error.code ?? '');
    if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
      return {
        ok: false,
        code: 'TAKEN',
        message: 'That username was just claimed. Try another.',
      };
    }
    return {
      ok: false,
      code: 'UNKNOWN',
      message: error.message || 'Could not create your profile. Try again.',
    };
  }

  const profile = mapProfile((data ?? {}) as Record<string, unknown>);
  if (!profile) {
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Profile was created but could not be loaded.',
    };
  }
  return { ok: true, profile };
}
