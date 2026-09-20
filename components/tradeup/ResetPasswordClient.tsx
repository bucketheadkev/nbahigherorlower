'use client';

import {
  useEffect,
  useState,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import {
  consumePasswordRecoverySession,
  updatePasswordWithRecoverySession,
} from '@/lib/account/accountAuth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { hapticTap } from '@/lib/tradeup/haptics';

type Phase = 'loading' | 'form' | 'success' | 'error';

/**
 * Dedicated password-recovery landing page.
 * Supabase email links redirect here with a PKCE code (or legacy hash tokens).
 */
export function ResetPasswordClient() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY') {
        setPhase('form');
        setMessage(null);
      }
    });

    void (async () => {
      const result = await consumePasswordRecoverySession();
      if (cancelled) return;
      if (result.ready) {
        setPhase('form');
        setMessage(null);
      } else {
        setPhase('error');
        setMessage(result.message ?? 'This reset link is invalid or expired.');
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await updatePasswordWithRecoverySession(password, confirm);
    setBusy(false);
    if (result.ok === false) {
      setMessage(result.message);
      return;
    }
    hapticTap();
    setPhase('success');
    setPassword('');
    setConfirm('');
  };

  return (
    <main className="reset-password-page">
      <div className="reset-password-page__card settings-name-modal__card">
        <p className="reset-password-page__brand">1B RUN</p>
        <h1 className="settings-name-modal__title reset-password-page__title">
          {phase === 'success' ? 'Password updated' : 'Reset password'}
        </h1>

        {phase === 'loading' ? (
          <p className="settings-name-modal__copy">Checking your reset link…</p>
        ) : null}

        {phase === 'error' ? (
          <>
            <p className="settings-name-modal__copy">
              {message ?? 'This reset link is invalid or expired.'}
            </p>
            <Link href="/" className="settings-ctrl settings-name-modal__save account-sheet__full">
              Back to 1B Run
            </Link>
          </>
        ) : null}

        {phase === 'success' ? (
          <>
            <p className="settings-name-modal__copy">
              Your password was saved. You can log in with your new password.
            </p>
            <Link href="/" className="settings-ctrl settings-name-modal__save account-sheet__full">
              Continue to 1B Run
            </Link>
          </>
        ) : null}

        {phase === 'form' ? (
          <form className="account-sheet__stack" onSubmit={handleSubmit}>
            <p className="settings-name-modal__copy">
              Choose a new password for your 1B Run account.
            </p>
            <label className="settings-name-modal__field">
              <span>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label className="settings-name-modal__field">
              <span>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
              />
            </label>
            {message ? <p className="settings-name-modal__error">{message}</p> : null}
            <button
              type="submit"
              className="settings-ctrl settings-name-modal__save account-sheet__full"
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save password'}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
