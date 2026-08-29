'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { hapticTap } from '@/lib/tradeup/haptics';

interface LegalPageShellProps {
  kicker?: string;
  title: string;
  children: ReactNode;
}

/** Scrollable public legal/support page shell — navy theme, native back when in app. */
export function LegalPageShell({ kicker, title, children }: LegalPageShellProps) {
  const router = useRouter();
  const showBack = Capacitor.isNativePlatform();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showBack) router.push('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, showBack]);

  return (
    <div className="legal-page">
      <header className="legal-page__header">
        {showBack ? (
          <button
            type="button"
            className="legal-page__back"
            onPointerDown={() => {
              hapticTap();
              router.push('/');
            }}
          >
            ← Back
          </button>
        ) : null}
        <div className="legal-page__titles">
          {kicker ? <p className="legal-page__kicker">{kicker}</p> : null}
          <h1 className="legal-page__title">{title}</h1>
        </div>
      </header>

      <main className="legal-page__scroll">{children}</main>
      <div className="legal-page__scroll-pad" aria-hidden />
    </div>
  );
}
