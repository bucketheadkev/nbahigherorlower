'use client';

import {
  useEffect,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  completeUsernameForSession,
  requestPasswordReset,
  signInWithEmail,
  signOutAccount,
  signUpWithEmail,
  type AccountAuthState,
} from '@/lib/account/accountAuth';
import { markAccountPromptSeen } from '@/lib/account/accountPromptStorage';
import { USERNAME_MAX } from '@/lib/account/username';
import { hapticTap } from '@/lib/tradeup/haptics';

export type AccountSheetView = 'menu' | 'signup' | 'login' | 'forgot' | 'claim';

interface AccountAuthSheetProps {
  open: boolean;
  initialView?: AccountSheetView;
  state: AccountAuthState;
  onStateChange: (next: AccountAuthState) => void;
  onClose: () => void;
}

/**
 * Compact account sheet (signup / login / signed-in).
 * Reuses settings-name-modal typography — not a large Settings card.
 */
export function AccountAuthSheet({
  open,
  initialView = 'menu',
  state,
  onStateChange,
  onClose,
}: AccountAuthSheetProps) {
  const [view, setView] = useState<AccountSheetView>(initialView);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setView(state.status === 'needs_username' ? 'claim' : initialView);
    setUsername('');
    setEmail('');
    setPassword('');
    setError(null);
    setInfo(null);
    setBusy(false);
  }, [open, initialView, state.status]);

  const press =
    (fn: () => void, opts?: { skipWhen?: () => boolean }) =>
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (opts?.skipWhen?.()) return;
      e.preventDefault();
      e.stopPropagation();
      fn();
    };

  const go = (next: AccountSheetView) => {
    setError(null);
    setInfo(null);
    setView(next);
  };

  const close = () => {
    setBusy(false);
    setError(null);
    setInfo(null);
    onClose();
  };

  const handleSignUp = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await signUpWithEmail({ username, email, password });
    setBusy(false);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    markAccountPromptSeen();
    hapticTap();
    onStateChange(result.state);
    close();
  };

  const handleLogIn = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await signInWithEmail({ email, password });
    setBusy(false);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    markAccountPromptSeen();
    hapticTap();
    if (result.state.status === 'needs_username') {
      setView('claim');
      onStateChange(result.state);
      return;
    }
    onStateChange(result.state);
    close();
  };

  const handleClaim = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await completeUsernameForSession(username);
    setBusy(false);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    markAccountPromptSeen();
    hapticTap();
    onStateChange(result.state);
    close();
  };

  const handleForgot = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    setInfo(
      'If an account exists for that email, a reset link was sent. Open it to choose a new password.',
    );
  };

  const handleLogOut = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await signOutAccount();
    setBusy(false);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    hapticTap();
    setView('menu');
    onStateChange(result.state);
  };

  if (!open) return null;

  const title =
    view === 'signup'
      ? 'Create Account'
      : view === 'login'
        ? 'Log In'
        : view === 'forgot'
          ? 'Forgot Password?'
          : view === 'claim'
            ? 'Choose a username'
            : 'Account';

  const showSignedIn = state.status === 'permanent' && view === 'menu';  const showGuestMenu =
    view === 'menu' &&
    (state.status === 'guest' ||
      state.status === 'anonymous' ||
      state.status === 'loading');

  return (
    <div
      className="settings-name-modal account-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="settings-ctrl settings-name-modal__scrim"
        aria-label="Close"
        disabled={busy}
        onPointerDown={press(close, { skipWhen: () => busy })}
      />
      <div className="settings-name-modal__card account-sheet__card">
        {showSignedIn ? (
          <>
            <p className="settings-name-modal__kicker">Account</p>
            <h3 className="settings-name-modal__title">{state.profile.username}</h3>
            <p className="settings-name-modal__copy">
              Signed in. Achievements and Classic progress sync with this account.
            </p>
            {error ? <p className="settings-name-modal__error">{error}</p> : null}
            <div className="settings-name-modal__actions">
              <button
                type="button"
                className="settings-ctrl settings-name-modal__cancel"
                disabled={busy}
                onPointerDown={press(close, { skipWhen: () => busy })}
              >
                Close
              </button>
              <button
                type="button"
                className="settings-ctrl settings-name-modal__save settings-name-modal__save--danger"
                disabled={busy}
                onPointerDown={press(handleLogOut, { skipWhen: () => busy })}
              >
                {busy ? 'Logging out…' : 'Log Out'}
              </button>
            </div>
          </>
        ) : null}

        {showGuestMenu ? (
          <>
            <p className="settings-name-modal__kicker">Save your progress</p>
            <h3 className="settings-name-modal__title">Create an account</h3>
            <p className="settings-name-modal__copy">
              Create an account to eventually save achievements, runs, and leaderboard stats
              across devices. You can keep playing as a guest anytime.
            </p>
            <div className="account-sheet__stack">
              <button
                type="button"
                className="settings-ctrl settings-name-modal__save account-sheet__full"
                onPointerDown={press(() => go('signup'))}
              >
                Create Account
              </button>
              <button
                type="button"
                className="settings-ctrl settings-name-modal__cancel account-sheet__full"
                onPointerDown={press(() => go('login'))}
              >
                Log In
              </button>
              <button
                type="button"
                className="settings-ctrl account-sheet__text-link"
                onPointerDown={press(close)}
              >
                Close
              </button>
            </div>
          </>
        ) : null}

        {view === 'signup' ? (
          <form onSubmit={handleSignUp}>
            <p className="settings-name-modal__kicker">Save your progress</p>
            <h3 className="settings-name-modal__title">Create Account</h3>
            <p className="settings-name-modal__copy">
              Username is your future public leaderboard name. Email stays private.
            </p>
            <label className="settings-name-modal__field">
              <span>Username</span>
              <input
                value={username}
                maxLength={USERNAME_MAX}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="settings-name-modal__field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                autoComplete="email"
                inputMode="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="settings-name-modal__field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                autoComplete="new-password"
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error ? <p className="settings-name-modal__error">{error}</p> : null}
            <div className="settings-name-modal__actions">
              <button
                type="button"
                className="settings-ctrl settings-name-modal__cancel"
                disabled={busy}
                onPointerDown={press(() => go('menu'), { skipWhen: () => busy })}
              >
                Back
              </button>
              <button type="submit" className="settings-ctrl settings-name-modal__save" disabled={busy}>
                {busy ? 'Creating…' : 'Create Account'}
              </button>
            </div>
            <button
              type="button"
              className="settings-ctrl account-sheet__text-link"
              disabled={busy}
              onPointerDown={press(() => go('login'), { skipWhen: () => busy })}
            >
              Already have an account? Log In
            </button>
          </form>
        ) : null}

        {view === 'login' ? (
          <form onSubmit={handleLogIn}>
            <p className="settings-name-modal__kicker">Welcome back</p>
            <h3 className="settings-name-modal__title">Log In</h3>
            <label className="settings-name-modal__field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                autoComplete="email"
                inputMode="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="settings-name-modal__field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error ? <p className="settings-name-modal__error">{error}</p> : null}
            <div className="settings-name-modal__actions">
              <button
                type="button"
                className="settings-ctrl settings-name-modal__cancel"
                disabled={busy}
                onPointerDown={press(() => go('menu'), { skipWhen: () => busy })}
              >
                Back
              </button>
              <button type="submit" className="settings-ctrl settings-name-modal__save" disabled={busy}>
                {busy ? 'Logging in…' : 'Log In'}
              </button>
            </div>
            <button
              type="button"
              className="settings-ctrl account-sheet__text-link"
              disabled={busy}
              onPointerDown={press(() => go('forgot'), { skipWhen: () => busy })}
            >
              Forgot Password?
            </button>
            <button
              type="button"
              className="settings-ctrl account-sheet__text-link"
              disabled={busy}
              onPointerDown={press(() => go('signup'), { skipWhen: () => busy })}
            >
              Don&apos;t have an account? Sign Up
            </button>
          </form>
        ) : null}

        {view === 'forgot' ? (
          <form onSubmit={handleForgot}>
            <p className="settings-name-modal__kicker">Password</p>
            <h3 className="settings-name-modal__title">Forgot Password?</h3>
            <p className="settings-name-modal__copy">
              We’ll email a reset link. Finishing the reset in-app still needs a recovery page.
            </p>
            <label className="settings-name-modal__field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                autoComplete="email"
                inputMode="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error ? <p className="settings-name-modal__error">{error}</p> : null}
            {info ? <p className="account-sheet__info">{info}</p> : null}
            <div className="settings-name-modal__actions">
              <button
                type="button"
                className="settings-ctrl settings-name-modal__cancel"
                disabled={busy}
                onPointerDown={press(() => go('login'), { skipWhen: () => busy })}
              >
                Back
              </button>
              <button type="submit" className="settings-ctrl settings-name-modal__save" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </div>
          </form>
        ) : null}

        {view === 'claim' ? (
          <form onSubmit={handleClaim}>
            <p className="settings-name-modal__kicker">Finish setup</p>
            <h3 className="settings-name-modal__title">Choose a username</h3>
            <p className="settings-name-modal__copy">
              Pick a public username for the future leaderboard.
            </p>
            <label className="settings-name-modal__field">
              <span>Username</span>
              <input
                value={username}
                maxLength={USERNAME_MAX}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            {error ? <p className="settings-name-modal__error">{error}</p> : null}
            <div className="settings-name-modal__actions">
              <button
                type="button"
                className="settings-ctrl settings-name-modal__cancel"
                disabled={busy}
                onPointerDown={press(handleLogOut, { skipWhen: () => busy })}
              >
                Log out
              </button>
              <button type="submit" className="settings-ctrl settings-name-modal__save" disabled={busy}>
                {busy ? 'Saving…' : 'Save username'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
