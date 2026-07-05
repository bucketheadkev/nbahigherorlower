'use client';

import { formatXHandle, getXUsername, saveXUsername } from '@/lib/xUsername';
import { FormEvent, useEffect, useState } from 'react';

interface UsernameSetupProps {
  onSaved?: (username: string) => void;
  variant?: 'hero' | 'compact';
}

export function UsernameSetup({ onSaved, variant = 'hero' }: UsernameSetupProps) {
  const [handle, setHandle] = useState('');
  const [savedHandle, setSavedHandle] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    const existing = getXUsername();
    setHandle(existing);
    setSavedHandle(existing);
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = saveXUsername(handle);
    setHandle(normalized);
    setSavedHandle(normalized);
    setSavedMessage('Saved — your streaks will show on the leaderboard.');
    onSaved?.(normalized);
    setTimeout(() => setSavedMessage(''), 3000);
  }

  if (variant === 'compact' && savedHandle) {
    return (
      <div className="username-saved-pill">
        <span className="text-white/45">Playing as</span>
        <span className="font-semibold text-white">{formatXHandle(savedHandle)}</span>
      </div>
    );
  }

  return (
    <div className={variant === 'hero' ? 'username-card' : 'username-card-compact'}>
      <div className="mb-4">
        <p className="section-label">Leaderboard name</p>
        <h3 className="mt-1 text-lg font-semibold text-white">Type your X username</h3>
        <p className="mt-1 text-sm text-white/45">
          No login required — just type your handle so friends recognize you on the board.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 items-center rounded-xl border border-white/10 bg-black/30 px-4">
          <span className="text-sm font-medium text-orange-400">@</span>
          <input
            value={handle}
            onChange={(event) => setHandle(event.target.value.replace(/^@+/, ''))}
            placeholder="yourhandle"
            className="w-full bg-transparent py-3.5 pl-2 text-white outline-none placeholder:text-white/25"
            autoComplete="off"
            spellCheck={false}
            maxLength={30}
          />
        </label>
        <button type="submit" className="btn-accent shrink-0 px-6">
          Save
        </button>
      </form>

      {savedHandle ? (
        <p className="mt-3 text-sm text-white/50">
          Current: <span className="font-medium text-white">{formatXHandle(savedHandle)}</span>
        </p>
      ) : null}

      {savedMessage ? <p className="mt-2 text-sm text-emerald-400">{savedMessage}</p> : null}
    </div>
  );
}
