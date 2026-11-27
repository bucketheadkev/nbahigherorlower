import type { Session, User } from '@supabase/supabase-js';
import {
  createOwnProfile,
  cachedProfileForUser,
  checkUsernameAvailability,
  clearCachedProfile,
  findProfileByUsername,
  lookupProfileForUser,
  type ProfileRow,
} from '@/lib/account/profiles';
import { isAnonymousUser } from '@/lib/account/userKind';
import {
  isValidUsername,
  sanitizeUsernameDisplay,
  usernameValidationMessage,
} from '@/lib/account/username';
import { isNativeApp } from '@/lib/platform/isNativeApp';
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
    }
  | {
      /** Session read failed. Callers should keep the last known account, not treat this as a logout. */
      status: 'unavailable';
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout : null;
    if (!timer) {
      resolve();
      return;
    }
    timer(resolve, ms);
  });
}

async function readSession(): Promise<
  { ok: true; session: Session | null } | { ok: false }
> {
  const supabase = getSupabaseBrowserClient();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sessionResult = await Promise.race([
      supabase.auth.getSession(),
      new Promise<{ data: { session: null }; error: Error }>((resolve) => {
        const timer =
          typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout : null;
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
    if (!sessionResult.error) {
      return { ok: true, session: sessionResult.data.session };
    }
    console.warn('[account] getSession failed', sessionResult.error.message);
    if (attempt === 0) await delay(400);
  }
  return { ok: false };
}

export async function resolveAccountAuthState(): Promise<AccountAuthState> {
  const sessionResult = await readSession();
  if (sessionResult.ok === false) return { status: 'unavailable' };

  const session = sessionResult.session;
  if (!session?.user) return { status: 'guest' };

  if (isAnonymousUser(session.user)) {
    return { status: 'anonymous', session, user: session.user };
  }

  let lookup = await lookupProfileForUser(session.user.id);
  if (lookup.status !== 'found') {
    await delay(lookup.status === 'error' ? 500 : 350);
    lookup = await lookupProfileForUser(session.user.id);
  }

  if (lookup.status === 'found') {
    return { status: 'permanent', session, user: session.user, profile: lookup.profile };
  }

  if (lookup.status === 'error') {
    const cached = cachedProfileForUser(session.user.id);
    if (cached) {
      return { status: 'permanent', session, user: session.user, profile: cached };
    }
    // A failed read is not proof the profile is missing. Do not open username setup.
    return { status: 'unavailable' };
  }

  return { status: 'needs_username', session, user: session.user };
}

/**
 * - confirm_email_sent: signup accepted, but the project requires email confirmation first.
 * - email_not_confirmed: login refused until the confirmation link is opened.
 * - email_in_use: an account already exists for that email.
 */
export type AuthFailureCode = 'confirm_email_sent' | 'email_not_confirmed' | 'email_in_use';

export type AuthActionResult =
  | { ok: true; state: AccountAuthState }
  | { ok: false; message: string; code?: AuthFailureCode };

function authErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? '');
  }
  return '';
}

/** Username chosen at signup, kept in auth metadata until the profiles row exists. */
function pendingSignupUsername(user: User): string | null {
  const raw = user.user_metadata?.username;
  if (typeof raw !== 'string') return null;
  const display = sanitizeUsernameDisplay(raw);
  return isValidUsername(display) ? display : null;
}

export function pendingUsernameForState(state: AccountAuthState): string {
  return state.status === 'needs_username' ? (pendingSignupUsername(state.user) ?? '') : '';
}

const PRODUCTION_SUPABASE_REF = 'rqogjyjfatnyuoorvyix';
const PRODUCTION_SITE_ORIGIN = 'https://1brun.com';
const NON_PRODUCTION_AUTH_FALLBACK = 'http://localhost:3000';

function isProductionSiteOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === '1brun.com' || host.endsWith('.1brun.com');
  } catch {
    return false;
  }
}

/**
 * Origin for links inside auth emails. The native shell's origin (capacitor://localhost)
 * cannot be opened from Mail, so iOS points at the website instead.
 * A non-production backend never links to the production website: its reset page would
 * try to use staging tokens against the production project.
 */
function authEmailOrigin(): string {
  const clean = (v: string | undefined) => v?.trim().replace(/\/$/, '') || '';
  const site = clean(process.env.NEXT_PUBLIC_SITE_URL);
  const override = clean(process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN);
  const windowOrigin =
    !isNativeApp() && typeof window !== 'undefined' ? clean(window.location?.origin) : '';
  const origin = windowOrigin || override || site || PRODUCTION_SITE_ORIGIN;

  const productionBackend = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(
    PRODUCTION_SUPABASE_REF,
  );
  if (productionBackend || !isProductionSiteOrigin(origin)) return origin;
  return override && !isProductionSiteOrigin(override) ? override : NON_PRODUCTION_AUTH_FALLBACK;
}

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
  // XP/coins never migrate into a brand-new permanent account.
  const { prepareLocalAchievementsForAccountBind } = await import(
    '@/lib/account/achievementCloud'
  );
  const { prepareLocalClassicForAccountBind } = await import('@/lib/account/classicCloud');
  const { prepareLocalXpForAccountBind } = await import('@/lib/tradeup/xp');
  prepareLocalClassicForAccountBind();
  prepareLocalAchievementsForAccountBind();
  prepareLocalXpForAccountBind();

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: `${authEmailOrigin()}/`,
    },
  });

  if (error) {
    const code = authErrorCode(error);
    if (code === 'user_already_exists' || code === 'email_exists') {
      return {
        ok: false,
        code: 'email_in_use',
        message: 'An account already uses that email. Log in instead.',
      };
    }
    return {
      ok: false,
      message: authErrorMessage(error, 'Could not create your account. Try again.'),
    };
  }

  if (!data.session?.user) {
    // With confirmation on, an existing email comes back as a user with no identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return {
        ok: false,
        code: 'email_in_use',
        message: 'An account already uses that email. Log in instead.',
      };
    }
    // The profiles row is created on first login from the username stored in metadata.
    return {
      ok: false,
      code: 'confirm_email_sent',
      message: `Check ${email} for a confirmation link, then log in here.`,
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
  // Guest XP stays in the guest bucket; the signed-in slot loads per-user (empty if new).
  const { prepareLocalAchievementsForAccountBind } = await import(
    '@/lib/account/achievementCloud'
  );
  const { prepareLocalClassicForAccountBind } = await import('@/lib/account/classicCloud');
  const { prepareLocalXpForAccountBind } = await import('@/lib/tradeup/xp');
  prepareLocalClassicForAccountBind();
  prepareLocalAchievementsForAccountBind();
  prepareLocalXpForAccountBind();

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (authErrorCode(error) === 'email_not_confirmed') {
      return {
        ok: false,
        code: 'email_not_confirmed',
        message: 'Confirm your email first. Open the link we sent, then log in.',
      };
    }
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

  const signedIn = await resolveAccountAuthState();
  if (signedIn.status === 'unavailable') {
    return { ok: false, message: 'Signed in, but your profile could not be loaded. Try again.' };
  }
  if (signedIn.status !== 'permanent' && signedIn.status !== 'needs_username') {
    return { ok: false, message: 'Login did not return a session.' };
  }
  if (signedIn.status === 'needs_username') {
    const pending = pendingSignupUsername(signedIn.user);
    if (pending) {
      const claimed = await completeUsernameForSession(pending);
      if (claimed.ok) return claimed;
    }
  }
  return { ok: true, state: signedIn };
}

/** Re-send the signup confirmation email. */
export async function resendSignupConfirmation(emailRaw: string): Promise<AuthActionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, message: 'Enter the email you signed up with.' };
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${authEmailOrigin()}/` },
  });
  if (error) {
    return {
      ok: false,
      message: authErrorMessage(error, 'Could not resend the confirmation email. Try again.'),
    };
  }
  return { ok: true, state: await resolveAccountAuthState() };
}

async function permanentState(profile: ProfileRow): Promise<AccountAuthState> {
  const sessionResult = await readSession();
  if (sessionResult.ok && sessionResult.session?.user && !isAnonymousUser(sessionResult.session.user)) {
    return {
      status: 'permanent',
      session: sessionResult.session,
      user: sessionResult.session.user,
      profile,
    };
  }
  return resolveAccountAuthState();
}

/** Complete profile for an email user missing a profiles row. */
export async function completeUsernameForSession(
  rawUsername: string,
): Promise<AuthActionResult> {
  const supabase = getSupabaseBrowserClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, message: 'You need to be signed in to save a username.' };
  }
  const userId = userData.user.id;

  const own = await lookupProfileForUser(userId);
  if (own.status === 'found') {
    return { ok: true, state: await permanentState(own.profile) };
  }

  const existing = await findProfileByUsername(rawUsername);
  if (existing?.user_id === userId) {
    return { ok: true, state: await permanentState(existing) };
  }
  if (existing) {
    return { ok: false, message: 'That username is taken. Try another.' };
  }

  if (!isValidUsername(rawUsername)) {
    return {
      ok: false,
      message: usernameValidationMessage(rawUsername) ?? 'Invalid username.',
    };
  }
  const availability = await checkUsernameAvailability(rawUsername);
  if (availability === 'invalid') {
    return {
      ok: false,
      message: usernameValidationMessage(rawUsername) ?? 'Invalid username.',
    };
  }
  if (availability === 'taken') {
    const again = await findProfileByUsername(rawUsername);
    if (again?.user_id === userId) {
      return { ok: true, state: await permanentState(again) };
    }
    return { ok: false, message: 'That username is taken. Try another.' };
  }

  const profileResult = await createOwnProfile(rawUsername);
  if (profileResult.ok === false) {
    const recovered = await lookupProfileForUser(userId);
    if (recovered.status === 'found') {
      return { ok: true, state: await permanentState(recovered.profile) };
    }
    return { ok: false, message: profileResult.message };
  }
  return { ok: true, state: await permanentState(profileResult.profile) };
}

export async function signOutAccount(): Promise<AuthActionResult> {
  // Drop permanent-account progress caches before clearing the session so the
  // next guest / other account cannot inherit this user's PB, runs, or achievements.
  const { detachAchievementCloudCache } = await import('@/lib/account/achievementCloud');
  const { detachClassicCloudCache } = await import('@/lib/account/classicCloud');
  const { detachXpProfileToGuest } = await import('@/lib/tradeup/xp');
  detachClassicCloudCache();
  detachAchievementCloudCache();
  detachXpProfileToGuest();
  clearCachedProfile();

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
  return `${authEmailOrigin().replace(/\/$/, '')}/reset-password`;
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
