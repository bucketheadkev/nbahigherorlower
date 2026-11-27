'use client';

import {
  useEffect,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  completeUsernameForSession,
  pendingUsernameForState,
  requestPasswordReset,
  resendSignupConfirmation,
  signInWithEmail,
  signOutAccount,
  signUpWithEmail,
  type AccountAuthState,
} from '@/lib/account/accountAuth';
import { markAccountPromptSeen } from '@/lib/account/accountPromptStorage';
import { USERNAME_MAX } from '@/lib/account/username';
import { useSound } from '@/hooks/useSound';
import {
  playAccountSuccessSound,
  playUiBackSound,
  playUiConfirmSound,
} from '@/lib/tradeup/gameAudio';
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
  const { resume, playTap } = useSound();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (!open) return;
    setView(state.status === 'needs_username' ? 'claim' : initialView);
    setUsername(pendingUsernameForState(state));
    setEmail('');
    setPassword('');
    setError(null);
    setInfo(null);
    setCanResend(false);
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens or auth status changes
  }, [open, initialView, state.status]);

  const press =
    (fn: () => void, opts?: { skipWhen?: () => boolean; tone?: 'tap' | 'confirm' | 'back' }) =>
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      if (opts?.skipWhen?.()) return;
      e.preventDefault();
      e.stopPropagation();
      void resume();
      const tone = opts?.tone ?? 'tap';
      if (tone === 'confirm') {
        playUiConfirmSound();
        hapticTap();
      } else if (tone === 'back') {
        playUiBackSound();
        hapticTap();
      } else {
        playTap();
      }
      fn();
    };

  /** Form submit is still inside the tap — play the confirm click before awaiting. */
  const beginSubmit = () => {
    void resume();
    playUiConfirmSound();
    hapticTap();
  };

  const go = (next: AccountSheetView) => {
    setError(null);
    setInfo(null);
    setCanResend(false);
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
    beginSubmit();
    setBusy(true);
    setError(null);
    const result = await signUpWithEmail({ username, email, password });
    setBusy(false);
    if (result.ok === false) {
      if (result.code === 'confirm_email_sent' || result.code === 'email_in_use') {
        go('login');
        setPassword('');
        if (result.code === 'confirm_email_sent') {
          setInfo(result.message);
          setCanResend(true);
        } else {
          setError(result.message);
        }
        return;
      }
      setError(result.message);
      return;
    }
    markAccountPromptSeen();
    hapticTap();
    playAccountSuccessSound();
    onStateChange(result.state);
    close();
  };

  const handleLogIn = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    beginSubmit();
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await signInWithEmail({ email, password });
    setBusy(false);
    if (result.ok === false) {
      setError(result.message);
      if (result.code === 'email_not_confirmed') setCanResend(true);
      return;
    }
    setCanResend(false);
    markAccountPromptSeen();
    hapticTap();
    playAccountSuccessSound();
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
    beginSubmit();
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
    playAccountSuccessSound();
    onStateChange(result.state);
    close();
  };

  const handleForgot = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    beginSubmit();
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    playAccountSuccessSound();
    setInfo(
      'If an account exists for that email, a reset link was sent. Open it to choose a new password.',
    );
  };

  const handleResend = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await resendSignupConfirmation(email);
    setBusy(false);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    setInfo(`Confirmation email sent to ${email.trim().toLowerCase()}.`);
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
    playAccountSuccessSound();
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
        onClick={press(close, { skipWhen: () => busy, tone: 'back' })}
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
                onClick={press(close, { skipWhen: () => busy, tone: 'back' })}
              >
                Close
              </button>
              <button
                type="button"
                className="settings-ctrl settings-name-modal__save settings-name-modal__save--danger"
                disabled={busy}
                onClick={press(handleLogOut, { skipWhen: () => busy, tone: 'confirm' })}
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
                onClick={press(() => go('signup'), { tone: 'confirm' })}
              >
                Create Account
              </button>
              <button
                type="button"
                className="settings-ctrl settings-name-modal__cancel account-sheet__full"
                onClick={press(() => go('login'))}
              >
                Log In
              </button>
              <button
                type="button"
                className="settings-ctrl account-sheet__text-link"
                onClick={press(close, { tone: 'back' })}
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
                onClick={press(() => go('menu'), { skipWhen: () => busy, tone: 'back' })}
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
              onClick={press(() => go('login'), { skipWhen: () => busy })}
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
            {info ? <p className="account-sheet__info">{info}</p> : null}
            <div className="settings-name-modal__actions">
              <button
                type="button"
                className="settings-ctrl settings-name-modal__cancel"
                disabled={busy}
                onClick={press(() => go('menu'), { skipWhen: () => busy, tone: 'back' })}
              >
                Back
              </button>
              <button type="submit" className="settings-ctrl settings-name-modal__save" disabled={busy}>
                {busy ? 'Logging in…' : 'Log In'}
              </button>
            </div>
            {canResend ? (
              <button
                type="button"
                className="settings-ctrl account-sheet__text-link"
                disabled={busy}
                onClick={press(handleResend, { skipWhen: () => busy })}
              >
                Resend confirmation email
              </button>
            ) : null}
            <button
              type="button"
              className="settings-ctrl account-sheet__text-link"
              disabled={busy}
              onClick={press(() => go('forgot'), { skipWhen: () => busy })}
            >
              Forgot Password?
            </button>
            <button
              type="button"
              className="settings-ctrl account-sheet__text-link"
              disabled={busy}
              onClick={press(() => go('signup'), { skipWhen: () => busy })}
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
                onClick={press(() => go('login'), { skipWhen: () => busy, tone: 'back' })}
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
              Pick a public username for the leaderboard. If this account already has one, enter that same name to sign back in.
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
                onClick={press(handleLogOut, { skipWhen: () => busy, tone: 'confirm' })}
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
