'use client';

import { useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '@/hooks/useLocale';
import { useSound } from '@/hooks/useSound';

interface HomeModesSheetProps {
  open: boolean;
  onClose: () => void;
  onClassic: () => void;
  onHeadToHead: () => void;
}

export function HomeModesSheet({ open, onClose, onClassic, onHeadToHead }: HomeModesSheetProps) {
  const { t } = useLocale();
  const { resume, playTap } = useSound();

  useEffect(() => {
    if (!open) return;
    // Kill any leftover text/image selection from opening the sheet (copyable blue quads).
    const clearSel = () => {
      try {
        window.getSelection()?.removeAllRanges();
      } catch {
        /* ignore */
      }
    };
    clearSel();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearSel();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const dismiss = () => {
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      /* ignore */
    }
    onClose();
  };

  const pick = (fn: () => void) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    resume();
    playTap();
    dismiss();
    fn();
  };

  // Portal to body so hub overflow / transforms never clip the sheet on iOS.
  return createPortal(
    <div className="rh3-sheet" role="dialog" aria-modal="true" aria-labelledby="rh3-sheet-title">
      {/* Non-focusable scrim — a full-screen <button> left a selectable highlight quad. */}
      <div className="rh3-sheet__scrim" aria-hidden onClick={dismiss} />
      <section className="rh3-sheet__panel">
        <span className="rh3-sheet__grip" aria-hidden />
        <header className="rh3-sheet__head">
          <h2 id="rh3-sheet-title">{t('home.modes')}</h2>
          <button type="button" className="rh3-sheet__close" aria-label={t('home.modesClose')} onClick={dismiss}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="rh3-sheet__list">
          <button type="button" className="rh3-mode rh3-mode--classic" onClick={pick(onClassic)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="rh3-mode__art"
              src="/images/home-v2/classic.jpg"
              alt=""
              aria-hidden
              decoding="async"
              draggable={false}
            />
            <span className="rh3-mode__copy">
              <strong>{t('home.classicTitle')}</strong>
              <em>{t('home.classicDesc')}</em>
            </span>
            <Chevron />
          </button>
          <button type="button" className="rh3-mode rh3-mode--h2h" onClick={pick(onHeadToHead)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="rh3-mode__art"
              src="/images/home-v2/1v1.jpg"
              alt=""
              aria-hidden
              decoding="async"
              draggable={false}
            />
            <span className="rh3-mode__copy">
              <strong>{t('home.h2hTitle')}</strong>
              <em>{t('home.h2hDesc')}</em>
            </span>
            <Chevron />
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function Chevron() {
  return (
    <svg className="rh3-mode__chev" viewBox="0 0 8 12" width="8" height="12" fill="none" aria-hidden>
      <path d="M2 1.75 6.25 6 2 10.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
