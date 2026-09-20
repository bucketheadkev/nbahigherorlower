import type { Session, User } from '@supabase/supabase-js';
import {
  createOwnProfile,
  checkUsernameAvailability,
  fetchProfileForUser,
  type ProfileRow,
} from '@/lib/account/profiles';
import { isAnonymousUser } from '@/lib/account/userKind';
import {
  isValidUsername,
  sanitizeUsernameDisplay,
  usernameValidationMessage,
} from '@/lib/account/username';
import { resetAuthSessionCache } from '@/lib/supabase/auth';
import {
  getSupabaseBrowserClient,
  resetSupabaseBrowserClient,
} from '@/lib/supabase/client';

export type AccountKind = 'guest' | 'anonymous' | 'permanent';

export type AccountAuthState =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'anonymous'; session: Session; user: User }
  | {
      status: 'permanent';
      session: Session;
      user: User;
      profile: ProfileRow;
    }
  | {
      /** Email/password session exists but profiles row is missing (rare race / incomplete signup). */
      status: 'needs_username';
      session: Session;
      user: User;
    };

export { isAnonymousUser, isPermanentAuthUser } from '@/lib/account/userKind';

function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message?: unknown }).message ?? '').trim();
    if (msg) return msg;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export async function resolveAccountAuthState(): Promise<AccountAuthState> {
  const supabase = getSupabaseBrowserClient();

  // Guard against rare auth-lock hangs (surfaces as stuck "loading" / bare Event rejections).
  const sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<{ data: { session: null }; error: Error }>((resolve) => {
      const timer =
        typeof globalThis.setTimeout === 'function'
          ? globalThis.setTimeout
          : null;
      if (!timer) {
        resolve({
          data: { session: null },
          error: new Error('Session lookup timed out.'),
        });
        return;
      }
      timer(() => {
        resolve({
          data: { session: null },
          error: new Error('Session lookup timed out.'),
        });
      }, 8000);
    }),
  ]);

  const { data, error } = sessionResult;
  if (error) {
    console.warn('[account] getSession failed', error.message);
    return { status: 'guest' };
  }
  const session = data.session;
  if (!session?.user) return { status: 'guest' };

  if (isAnonymousUser(session.user)) {
    return { status: 'anonymous', session, user: session.user };
  }

  const profile = await fetchProfileForUser(session.user.id);
  if (!profile) {
    return { status: 'needs_username', session, user: session.user };
  }
  return { status: 'permanent', session, user: session.user, profile };
}

export type AuthActionResult =
  | { ok: true; state: AccountAuthState }
  | { ok: false; message: string };

/**
 * Sign up with email/password + public username profile.
 * Replaces any prior anonymous session (no anonymous linking in this phase).
 */
export async function signUpWithEmail(input: {
  username: string;
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  const username = sanitizeUsernameDisplay(input.username);
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  const usernameError = usernameValidationMessage(username);
  if (usernameError) return { ok: false, message: usernameError };
  if (!email || !email.includes('@')) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  if (password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' };
  }

  const availability = await checkUsernameAvailability(username);
  if (availability === 'taken') {
    return { ok: false, message: 'That username is taken. Try another.' };
  }
  if (availability === 'invalid') {
    return { ok: false, message: usernameError ?? 'Invalid username.' };
  }
  // 'error' → continue; insert UNIQUE will catch races / flaky checks.

  // Discard orphaned Account A local achievements/Classic; keep tagged guest progress only.
  const { prepareLocalAchievementsForAccountBind } = await import(
    '@/lib/account/achievementCloud'
  );
  const { prepareLocalClassicForAccountBind } = await import('@/lib/account/classicCloud');
  prepareLocalClassicForAccountBind();
  prepareLocalAchievementsForAccountBind();

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return {
      ok: false,
      message: authErrorMessage(error, 'Could not create your account. Try again.'),
    };
  }

  if (!data.session?.user) {
    return {
      ok: false,
      message:
        'Account was created but no session was returned. Try logging in, or check email confirmation settings.',
    };
  }

  const profileResult = await createOwnProfile(username);
  if (profileResult.ok === false) {
    const message = profileResult.message;
    // Avoid leaving a logged-in shell with no profile after a username race.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* ignore */
    }
    resetSupabaseBrowserClient();
    resetAuthSessionCache();
    return { ok: false, message };
  }

  resetAuthSessionCache();
  return {
    ok: true,
    state: {
      status: 'permanent',
      session: data.session,
      user: data.session.user,
      profile: profileResult.profile,
    },
  };
}

export async function signInWithEmail(input: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!email || !email.includes('@')) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  if (!password) {
    return { ok: false, message: 'Enter your password.' };
  }

  // Discard orphaned local achievements/Classic before binding a permanent session.
  const { prepareLocalAchievementsForAccountBind } = await import(
    '@/lib/account/achievementCloud'
  );
  const { prepareLocalClassicForAccountBind } = await import('@/lib/account/classicCloud');
  prepareLocalClassicForAccountBind();
  prepareLocalAchievementsForAccountBind();

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      ok: false,
      message: authErrorMessage(error, 'Could not log in. Check your email and password.'),
    };
  }
  if (!data.session?.user) {
    return { ok: false, message: 'Login did not return a session.' };
  }

  resetAuthSessionCache();

  if (isAnonymousUser(data.session.user)) {
    return { ok: false, message: 'Unexpected anonymous session after login.' };
  }

  const profile = await fetchProfileForUser(data.session.user.id);
  if (!profile) {
    return {
      ok: true,
      state: {
        status: 'needs_username',
        session: data.session,
        user: data.session.user,
      },
    };
  }

  return {
    ok: true,
    state: {
      status: 'permanent',
      session: data.session,
      user: data.session.user,
      profile,
    },
  };
}

/** Complete profile for an email user missing a profiles row. */
export async function completeUsernameForSession(
  rawUsername: string,
): Promise<AuthActionResult> {
  if (!isValidUsername(rawUsername)) {
    return {
      ok: false,
      message: usernameValidationMessage(rawUsername) ?? 'Invalid username.',
    };
  }
  const availability = await checkUsernameAvailability(rawUsername);
  if (availability === 'taken') {
    return { ok: false, message: 'That username is taken. Try another.' };
  }
  if (availability === 'invalid') {
    return {
      ok: false,
      message: usernameValidationMessage(rawUsername) ?? 'Invalid username.',
    };
  }
  const profileResult = await createOwnProfile(rawUsername);
  if (profileResult.ok === false) {
    return { ok: false, message: profileResult.message };
  }
  const state = await resolveAccountAuthState();
  return { ok: true, state };
}

export async function signOutAccount(): Promise<AuthActionResult> {
  // Drop permanent-account progress caches before clearing the session so the
  // next guest / other account cannot inherit this user's PB, runs, or achievements.
  const { detachAchievementCloudCache } = await import('@/lib/account/achievementCloud');
  const { detachClassicCloudCache } = await import('@/lib/account/classicCloud');
  detachClassicCloudCache();
  detachAchievementCloudCache();

  const supabase = getSupabaseBrowserClient();
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    return {
      ok: false,
      message: authErrorMessage(error, 'Could not log out. Try again.'),
    };
  }
  resetSupabaseBrowserClient();
  resetAuthSessionCache();
  return { ok: true, state: { status: 'guest' } };
}

/**
 * Sends a password-reset email. Redirect lands on /reset-password where the
 * recovery session is consumed and the user sets a new password.
 */
export async function requestPasswordReset(emailRaw: string): Promise<AuthActionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, message: 'Enter the email for your account.' };
  }
  const supabase = getSupabaseBrowserClient();
  const redirectTo = passwordResetRedirectUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    return {
      ok: false,
      message: authErrorMessage(error, 'Could not send reset email. Try again.'),
    };
  }
  // Always succeed from UX perspective once the API accepts the request.
  return { ok: true, state: await resolveAccountAuthState() };
}

/** Website reset landing page (also used as Supabase redirect allow-list entry). */
export function passwordResetRedirectUrl(): string {
  const origin =
    (typeof window !== 'undefined' && window.location?.origin) ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '') ||
    'https://1brun.com';
  return `${origin.replace(/\/$/, '')}/reset-password`;
}

/**
 * Consume PKCE `?code=` (or legacy hash recovery tokens) on the reset-password page.
 * Does not log tokens. Returns whether a recovery-capable session is available.
 */
export async function consumePasswordRecoverySession(): Promise<{
  ok: boolean;
  ready: boolean;
  message?: string;
}> {
  if (typeof window === 'undefined') {
    return { ok: false, ready: false, message: 'Unavailable.' };
  }
  const supabase = getSupabaseBrowserClient();

  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      url.searchParams.delete('code');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      if (error) {
        return {
          ok: false,
          ready: false,
          message: authErrorMessage(error, 'This reset link is invalid or expired.'),
        };
      }
    } else if (url.hash && /access_token|type=recovery/i.test(url.hash)) {
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');
      window.history.replaceState({}, '', url.pathname + url.search);
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          return {
            ok: false,
            ready: false,
            message: authErrorMessage(error, 'This reset link is invalid or expired.'),
          };
        }
      } else {
        return {
          ok: false,
          ready: false,
          message: 'This reset link is invalid or expired.',
        };
      }
    }

    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      return {
        ok: false,
        ready: false,
        message: 'Open the reset link from your email to choose a new password.',
      };
    }
    return { ok: true, ready: true };
  } catch (error) {
    return {
      ok: false,
      ready: false,
      message: authErrorMessage(error, 'Could not open the reset link. Try again.'),
    };
  }
}

/** Update password for the current recovery (or signed-in) session. */
export async function updatePasswordWithRecoverySession(
  password: string,
  confirm: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' };
  }
  if (password !== confirm) {
    return { ok: false, message: 'Passwords do not match.' };
  }
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return {
      ok: false,
      message: 'Reset session expired. Request a new password reset email.',
    };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      ok: false,
      message: authErrorMessage(error, 'Could not update password. Try again.'),
    };
  }
  return { ok: true };
}
