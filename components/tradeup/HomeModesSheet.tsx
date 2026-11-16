'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { hapticLight } from '@/lib/tradeup/haptics';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';

interface HomeModesSheetProps {
  open: boolean;
  onClose: () => void;
  onClassic: () => void;
  onHeadToHead: () => void;
}

function ClassicMark() {
  return (
    <svg className="home-mode__mark" viewBox="0 0 48 48" width="48" height="48" aria-hidden>
      <rect x="2" y="2" width="44" height="44" rx="12" fill="#12284f" stroke="#6ea4ff" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="12" fill="none" stroke="#f0a24a" strokeWidth="2" />
      <path d="M24 12v24M12 24h24" stroke="#f0a24a" strokeWidth="1.5" />
      <path d="M15 16c4 3 14 3 18 0M15 32c4-3 14-3 18 0" fill="none" stroke="#f0a24a" strokeWidth="1.5" />
    </svg>
  );
}

function H2HMark() {
  return (
    <svg className="home-mode__mark" viewBox="0 0 48 48" width="48" height="48" aria-hidden>
      <rect x="2" y="2" width="44" height="44" rx="12" fill="#12284f" stroke="#6ea4ff" strokeWidth="1.5" />
      <path d="M14 34V18l6-4 6 4v16" fill="#e8eefc" />
      <path d="M28 34V20l6-3 6 3v14" fill="#ff8a3d" />
      <circle cx="24" cy="24" r="5" fill="#0b1630" stroke="#ffe29a" strokeWidth="1.4" />
      <text x="24" y="26.5" textAnchor="middle" fontSize="6" fontWeight="800" fill="#ffe29a" fontFamily="Avenir Next, Helvetica Neue, Arial, sans-serif">
        VS
      </text>
    </svg>
  );
}

function Chevron() {
  return (
    <svg className="home-mode__chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HomeModesSheet({ open, onClose, onClassic, onHeadToHead }: HomeModesSheetProps) {
  const { t } = useLocale();
  const reduceMotion = getPrefersReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const pick = (fn: () => void) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    hapticLight();
    onClose();
    fn();
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="home-sheet" role="dialog" aria-modal="true" aria-labelledby="home-sheet-title">
          <motion.button
            type="button"
            className="home-sheet__scrim"
            aria-label={t('home.modesClose')}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
          />
          <motion.section
            className="home-sheet__panel"
            initial={reduceMotion ? false : { y: '100%' }}
            animate={{ y: 0 }}
            exit={reduceMotion ? undefined : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.9 }}
          >
            <span className="home-sheet__grip" aria-hidden />
            <header className="home-sheet__head">
              <h2 id="home-sheet-title">{t('home.modes')}</h2>
              <button type="button" className="home-sheet__close" aria-label={t('home.modesClose')} onClick={onClose}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </header>
            <div className="home-sheet__list">
              <motion.button
                type="button"
                className="home-mode"
                onClick={pick(onClassic)}
                whileTap={{ scale: 0.985 }}
              >
                <ClassicMark />
                <span className="home-mode__copy">
                  <strong>{t('home.classicTitle')}</strong>
                  <em>{t('home.classicDesc')}</em>
                </span>
                <Chevron />
              </motion.button>
              <motion.button
                type="button"
                className="home-mode"
                onClick={pick(onHeadToHead)}
                whileTap={{ scale: 0.985 }}
              >
                <H2HMark />
                <span className="home-mode__copy">
                  <strong>{t('home.h2hTitle')}</strong>
                  <em>{t('home.h2hDesc')}</em>
                </span>
                <Chevron />
              </motion.button>
            </div>
          </motion.section>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
