'use client';

import { AnimatePresence, motion } from 'framer-motion';
import localFont from 'next/font/local';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '@/hooks/useLocale';
import { formatCash, readBankPreview } from '@/lib/tradeup/bank';
import { hapticHeavy, hapticLight, hapticSuccess, hapticTap } from '@/lib/tradeup/haptics';
import { playFinalTotalSettleSound } from '@/lib/tradeup/gameAudio';
import { BillionCelebration } from './BillionCelebration';
import {
  fetchMyInduction,
  fetchMySignature,
  fetchWallOfFame,
  stampWallOfFame,
  type WallInductee,
} from '@/lib/account/wallOfFameCloud';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import {
  BANK_MILESTONES,
  SIGNATURE_MAX,
  WALL_OF_FAME_GOAL,
  getLocalInduction,
  getLocalSignature,
  isWallPreview,
  nextMilestone,
  normalizeSignature,
  previewInductees,
  qualifiesForWall,
  recordLocalInduction,
  saveLocalSignature,
  type WallSignature,
} from '@/lib/tradeup/wallOfFame';

const signatureFont = localFont({
  src: '../../node_modules/@fontsource/mr-dafoe/files/mr-dafoe-latin-400-normal.woff2',
  display: 'swap',
  variable: '--font-signature',
});

const COPY = {
  back: { en: '← Back', es: '← Atrás' },
  title: { en: 'WALL OF FAME', es: 'MURO DE LA FAMA' },
  sub: { en: 'Reserved for a $1,000,000,000 Bank.', es: 'Reservado para un Banco de $1,000,000,000.' },
  empty: { en: 'Unsigned', es: 'Sin firmas' },
  yours: { en: 'Your name belongs here', es: 'Tu nombre va aquí' },
  bank: { en: 'My Bank', es: 'Mi Banco' },
  toGo: { en: '{amount} to go', es: 'Faltan {amount}' },
  signIn: {
    en: 'Create an account to sign the wall.',
    es: 'Crea una cuenta para firmar el muro.',
  },
  you: { en: 'You', es: 'Tú' },
  signed: { en: '{count} signed', es: '{count} firmas' },
  next: { en: 'Next milestone {amount}', es: 'Próxima meta {amount}' },
  device: { en: 'Inducted on this device', es: 'Inducción en este dispositivo' },
  permanent: { en: 'Permanent — spending never removes your name.', es: 'Permanente: gastar nunca borra tu nombre.' },
  ladder: { en: 'Milestones to the Wall', es: 'Metas hacia el Muro' },
  earned: { en: 'You made it. Sign your name for the ages.', es: 'Lo lograste. Firma tu nombre para la historia.' },
  signKicker: { en: 'A $1,000,000,000 BANK', es: 'UN BANCO DE $1,000,000,000' },
  signLabel: { en: 'Your name for the Wall of Fame', es: 'Tu nombre para el Muro de la Fama' },
  tapToSign: { en: 'Tap to sign', es: 'Toca para firmar' },
  signHint: { en: 'The name you want remembered', es: 'El nombre que quieres que recuerden' },
  stamp: { en: 'STAMP YOUR LEGACY', es: 'SELLA TU LEGADO' },
  stamping: { en: 'STAMPING…', es: 'SELLANDO…' },
  stampNote: { en: 'Permanent — your signature can’t be changed.', es: 'Permanente: tu firma no se puede cambiar.' },
  invalid: {
    en: 'Use 2–24 letters, numbers, spaces, periods, apostrophes or hyphens.',
    es: 'Usa de 2 a 24 letras, números, espacios, puntos, apóstrofos o guiones.',
  },
  stampFailed: { en: "Couldn't stamp your name. Try again.", es: 'No se pudo sellar tu nombre. Intenta de nuevo.' },
  congrats: { en: 'CONGRATULATIONS', es: 'FELICIDADES' },
  congratsTitle: { en: '{name}, your legacy is stamped.', es: '{name}, tu legado está sellado.' },
  congratsSub: { en: 'Forever on the 1B Run Wall of Fame', es: 'Para siempre en el Muro de la Fama de 1B Run' },
  deviceSigned: {
    en: 'Signed on this device. Create an account to appear on the public wall.',
    es: 'Firmado en este dispositivo. Crea una cuenta para aparecer en el muro público.',
  },
  backToGame: { en: 'BACK TO THE GAME', es: 'VOLVER AL JUEGO' },
};

function formatDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale === 'es' ? 'es-US' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type Locale = 'en' | 'es';

function pick(copy: { en: string; es: string }, locale: string): string {
  return copy[(locale as Locale) in copy ? (locale as Locale) : 'en'];
}

/** Small, deterministic tilt so stacked signatures don't look typeset. */
function tilt(name: string, index: number): number {
  let h = index * 31;
  for (let i = 0; i < name.length; i += 1) h = (h * 33 + name.charCodeAt(i)) % 997;
  return ((h % 7) - 3) * 0.7;
}

interface WallOfFameScreenProps {
  open: boolean;
  /** Signed-in 1B Run username, or null for guests. */
  username: string | null;
  permanent: boolean;
  bankBalance: number;
  onClose: () => void;
}

export function WallOfFameScreen({ open, username, permanent, bankBalance, onClose }: WallOfFameScreenProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <WallOfFame
          key="wall"
          username={username}
          permanent={permanent}
          bank={bankBalance}
          onClose={onClose}
        />
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function WallOfFame({
  username,
  permanent,
  bank,
  onClose,
}: {
  username: string | null;
  permanent: boolean;
  bank: number;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const preview = useMemo(() => isWallPreview(), []);
  const bankPreview = useMemo(() => readBankPreview() != null, []);
  const demo = preview || bankPreview;
  const [remote, setRemote] = useState<WallInductee[]>([]);
  const [serverInducted, setServerInducted] = useState<string | null>(null);
  const [serverDown, setServerDown] = useState(false);
  const [signatureServer, setSignatureServer] = useState(false);
  const [localInducted, setLocalInducted] = useState<string | null>(null);
  const [signature, setSignature] = useState<WallSignature | null>(null);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [stamping, setStamping] = useState(false);
  const [stampError, setStampError] = useState<string | null>(null);
  const [justStamped, setJustStamped] = useState(false);
  const [congrats, setCongrats] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const youRef = useRef<HTMLLIElement | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchWallOfFame().then((result) => {
      if (!cancelled && result.ok) setRemote(result.entries);
    });
    if (demo) return;
    if (permanent) {
      void fetchMySignature().then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setSignatureServer(true);
          setServerInducted(result.inductedAt);
          if (result.displayName) {
            setSignature({ name: result.displayName, signedAt: result.signedAt ?? result.inductedAt ?? '' });
          }
          return;
        }
        // Signature migration not applied yet: fall back to induction + device signature.
        setSignature(getLocalSignature());
        void fetchMyInduction().then((induction) => {
          if (cancelled) return;
          if (induction.ok) setServerInducted(induction.inductedAt);
          else setServerDown(true);
        });
      });
    } else {
      setSignature(getLocalSignature());
    }
    return () => {
      cancelled = true;
    };
  }, [demo, permanent]);

  useEffect(() => {
    if (bankPreview) {
      setLocalInducted(qualifiesForWall(bank) ? new Date().toISOString() : null);
      return;
    }
    if (!permanent) setLocalInducted(recordLocalInduction(bank) ?? getLocalInduction());
  }, [bank, bankPreview, permanent]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const youInductedAt = bankPreview
    ? localInducted
    : preview
      ? new Date().toISOString()
      : permanent
        ? serverInducted ?? (serverDown && qualifiesForWall(bank) ? '' : null)
        : localInducted;
  const qualified = youInductedAt != null;
  const needsStamp = qualified && !signature;

  const youKeys = [signature?.name, username].filter(Boolean).map((n) => n!.toLowerCase());
  const others = (demo ? [...remote, ...previewInductees()] : remote).filter(
    (row) => !youKeys.includes(row.username.toLowerCase()),
  );
  const entries: Array<{ username: string; inductedAt: string | null; isYou: boolean }> = others.map((row) => ({
    username: row.username,
    inductedAt: row.inductedAt || null,
    isYou: false,
  }));
  if (signature) {
    // You sit in the middle of the wall so the zoom-out reveals names on every side.
    entries.splice(Math.floor(entries.length / 2), 0, {
      username: signature.name,
      inductedAt: youInductedAt || signature.signedAt || null,
      isYou: true,
    });
  }
  const compact = entries.length > 6;
  const pct = Math.min(1, bank / WALL_OF_FAME_GOAL);
  const milestone = nextMilestone(bank);
  const validName = normalizeSignature(draft);

  // Zoom out from your signature: scale the wall around where your name lands.
  useLayoutEffect(() => {
    if (!justStamped || !listRef.current || !youRef.current) return;
    const list = listRef.current;
    const you = youRef.current;
    list.style.transformOrigin = `${you.offsetLeft + you.offsetWidth / 2}px ${you.offsetTop + you.offsetHeight / 2}px`;
  }, [justStamped]);

  const stamp = async () => {
    if (stamping || signature) return;
    const name = normalizeSignature(draft);
    if (!name) {
      setStampError(pick(COPY.invalid, locale));
      return;
    }
    hapticTap();
    setStampError(null);
    setStamping(true);
    inputRef.current?.blur();
    const minDelay = new Promise((resolve) => window.setTimeout(resolve, reduceMotion ? 0 : 700));
    let next: WallSignature | null = null;
    if (demo) {
      next = { name, signedAt: new Date().toISOString() };
    } else if (permanent && signatureServer) {
      const result = await stampWallOfFame(name);
      if (result.ok === true) next = { name: result.displayName, signedAt: result.signedAt };
      else setStampError(pick(result.reason === 'invalid' ? COPY.invalid : COPY.stampFailed, locale));
    } else {
      next = saveLocalSignature(name);
      if (!next) setStampError(pick(COPY.stampFailed, locale));
    }
    await minDelay;
    setStamping(false);
    if (!next) return;
    hapticHeavy();
    playFinalTotalSettleSound();
    setSignature(next);
    setJustStamped(true);
    timers.current.push(
      window.setTimeout(
        () => {
          hapticSuccess();
          setCongrats(true);
        },
        reduceMotion ? 200 : 2100,
      ),
    );
  };

  return (
    <motion.div
      className={`wof ${signatureFont.variable}`}
      role="dialog"
      aria-modal="true"
      aria-label={pick(COPY.title, locale)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      transition={{ duration: 0.35 }}
    >
      {congrats && !reduceMotion ? <BillionCelebration durationMs={2200} /> : null}
      <motion.div
        className="wof__frame"
        initial={reduceMotion ? false : { y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0, transition: { duration: 0.2 } }}
        transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
      >
        <header className="wof__top">
          <button
            type="button"
            className="wof__back"
            onClick={() => {
              hapticLight();
              onClose();
            }}
          >
            {pick(COPY.back, locale)}
          </button>
        </header>

        <div className="wof__head">
          <p className="wof__eyebrow">1B RUN</p>
          <h1 className="wof__title">{pick(COPY.title, locale)}</h1>
          <span className="wof__rule" aria-hidden>
            <i />
          </span>
          <p className="wof__sub">{pick(needsStamp ? COPY.earned : COPY.sub, locale)}</p>
          {entries.length > 0 && !needsStamp ? (
            <motion.p
              className="wof__count"
              initial={justStamped && !reduceMotion ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.5 }}
            >
              {pick(COPY.signed, locale).replace('{count}', entries.length.toLocaleString('en-US'))}
            </motion.p>
          ) : null}
        </div>

        <section
          className={`wof__wall${needsStamp ? ' is-signing' : ''}${justStamped ? ' is-revealing' : ''}`}
          aria-label={pick(COPY.title, locale)}
        >
          <span className="wof__wall-light" aria-hidden />
          {needsStamp ? (
            <div
              className={`wof-sign${stamping ? ' is-stamping' : ''}${focused ? ' is-focused' : ''}`}
              onClick={() => inputRef.current?.focus()}
            >
              <p className="wof-sign__kicker">{pick(COPY.signKicker, locale)}</p>
              <input
                ref={inputRef}
                className="wof-sign__input"
                value={draft}
                maxLength={SIGNATURE_MAX}
                placeholder={pick(COPY.yours, locale)}
                aria-label={pick(COPY.signLabel, locale)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="words"
                spellCheck={false}
                enterKeyHint="done"
                disabled={stamping}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setStampError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void stamp();
                }}
              />
              <span className="wof__line" aria-hidden />
              <span className="wof__empty-label">
                {draft
                  ? `${pick(COPY.signHint, locale)} · ${draft.length}/${SIGNATURE_MAX}`
                  : pick(COPY.tapToSign, locale)}
              </span>
            </div>
          ) : entries.length > 0 ? (
            <motion.ol
              ref={listRef}
              className={`wof__names${compact ? ' wof__names--compact' : ''}`}
              initial={justStamped && !reduceMotion ? { scale: 2.4 } : false}
              animate={{ scale: 1 }}
              transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
            >
              {entries.map((entry, i) => (
                <motion.li
                  key={`${entry.username}-${i}`}
                  ref={entry.isYou ? youRef : undefined}
                  className={`wof__name${entry.isYou ? ' is-you' : ''}${entry.isYou && justStamped ? ' is-fresh' : ''}`}
                  style={{ rotate: `${tilt(entry.username, i)}deg` }}
                  initial={
                    reduceMotion || (justStamped && entry.isYou)
                      ? false
                      : { opacity: 0, y: justStamped ? 0 : 8 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.5,
                    ease: [0.25, 1, 0.5, 1],
                    delay: justStamped ? 0.7 + Math.abs(i - entries.findIndex((e) => e.isYou)) * 0.09 : 0.25 + i * 0.12,
                  }}
                >
                  <span
                    className="wof__ink"
                    style={entry.isYou && !reduceMotion && !justStamped ? { animationDelay: `${0.35 + i * 0.12}s` } : undefined}
                  >
                    {entry.username}
                  </span>
                  <span className="wof__meta">
                    {entry.isYou ? <span className="wof__you">{pick(COPY.you, locale)}</span> : null}
                    {formatDate(entry.inductedAt, locale) ? (
                      <span className="wof__date">{formatDate(entry.inductedAt, locale)}</span>
                    ) : null}
                  </span>
                </motion.li>
              ))}
            </motion.ol>
          ) : (
            <div className="wof__empty">
              <span className="wof__ghost">{pick(COPY.yours, locale)}</span>
              <span className="wof__line" aria-hidden />
              <span className="wof__empty-label">{pick(COPY.empty, locale)}</span>
              <ol className="wof__ladder" aria-label={pick(COPY.ladder, locale)}>
                {[...BANK_MILESTONES].reverse().map((mark) => {
                  const reached = bank >= mark;
                  const isNext = milestone?.next === mark;
                  return (
                    <li
                      key={mark}
                      className={`wof__rung${reached ? ' is-reached' : ''}${isNext ? ' is-next' : ''}${
                        mark === WALL_OF_FAME_GOAL ? ' is-goal' : ''
                      }`}
                    >
                      <span className="wof__rung-dot" aria-hidden />
                      <span className="wof__rung-amount">{formatCash(mark)}</span>
                      {isNext ? (
                        <span className="wof__rung-pct">{Math.floor((milestone?.pct ?? 0) * 100)}%</span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </section>

        {needsStamp ? (
          <div className="wof-stamp-bar">
            <button
              type="button"
              className="wof-stamp"
              disabled={!validName || stamping}
              onClick={() => void stamp()}
            >
              {stamping ? pick(COPY.stamping, locale) : pick(COPY.stamp, locale)}
            </button>
            <p className={`wof__note${stampError ? ' wof__note--error' : ''}`} role={stampError ? 'alert' : undefined}>
              {stampError ?? pick(COPY.stampNote, locale)}
            </p>
          </div>
        ) : null}

        <AnimatePresence>
          {congrats && signature ? (
            <motion.div
              className="wof-congrats"
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.55, ease: [0.25, 1, 0.5, 1] }}
            >
              <p className="wof-congrats__kicker">{pick(COPY.congrats, locale)}</p>
              <p className="wof-congrats__title">
                {pick(COPY.congratsTitle, locale).replace('{name}', signature.name)}
              </p>
              <p className="wof-congrats__sub">
                {pick(COPY.congratsSub, locale)}
                {formatDate(youInductedAt || signature.signedAt, locale)
                  ? ` · ${formatDate(youInductedAt || signature.signedAt, locale)}`
                  : ''}
              </p>
              {!permanent && !demo ? <p className="wof__note">{pick(COPY.deviceSigned, locale)}</p> : null}
              <button
                type="button"
                className="wof-stamp"
                onClick={() => {
                  hapticLight();
                  onClose();
                }}
              >
                {pick(COPY.backToGame, locale)}
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {!needsStamp && !congrats && qualified && signature ? (
          <p className="wof__note">
            {!permanent && !demo ? pick(COPY.deviceSigned, locale) : pick(COPY.permanent, locale)}
          </p>
        ) : null}

        {!qualified ? (
          <div className="wof__progress">
            <div className="wof__progress-row">
              <span>{pick(COPY.bank, locale)}</span>
              <strong>{formatCash(bank)}</strong>
            </div>
            <div className="wof__meter" aria-hidden>
              <motion.span
                className="wof__meter-fill"
                initial={reduceMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: Math.max(pct, 0.012) }}
                transition={{ duration: 1.1, ease: [0.25, 1, 0.5, 1], delay: 0.3 }}
              />
            </div>
            <p className="wof__togo">
              {pick(COPY.toGo, locale).replace('{amount}', formatCash(Math.max(0, WALL_OF_FAME_GOAL - bank)))}
              {milestone && milestone.next < WALL_OF_FAME_GOAL
                ? ` · ${pick(COPY.next, locale).replace('{amount}', formatCash(milestone.next))}`
                : ''}
            </p>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
