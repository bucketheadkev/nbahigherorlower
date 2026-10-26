'use client';

import { AnimatePresence, motion } from 'framer-motion';
import localFont from 'next/font/local';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '@/hooks/useLocale';
import {
  fetchMyWallStatus,
  fetchWallPage,
  signWallOfFame,
  type MyWallStatus,
  type SignFailure,
  type WallEntry,
} from '@/lib/account/wallOfFameCloud';
import { formatCash, readBankPreview } from '@/lib/tradeup/bank';
import { playFinalTotalSettleSound } from '@/lib/tradeup/gameAudio';
import { hapticHeavy, hapticLight, hapticSuccess, hapticTap } from '@/lib/tradeup/haptics';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import {
  isWallPreview,
  normalizeSignature,
  previewWall,
  qualifiesForWall,
  SIGNATURE_MAX,
  WALL_OF_FAME_GOAL,
} from '@/lib/tradeup/wallOfFame';
import { BillionCelebration } from './BillionCelebration';

const signatureFont = localFont({
  src: '../../node_modules/@fontsource/mr-dafoe/files/mr-dafoe-latin-400-normal.woff2',
  display: 'swap',
  variable: '--font-signature',
});

type Copy = { en: string; es: string };

const COPY = {
  back: { en: '← Back', es: '← Atrás' },
  eyebrow: { en: '1B RUN', es: '1B RUN' },
  title: { en: 'WALL OF FAME', es: 'MURO DE LA FAMA' },
  sub: {
    en: 'Every name on this wall built a $1,000,000,000 Bank.',
    es: 'Cada nombre en este muro construyó un Banco de $1,000,000,000.',
  },
  count: { en: '{n} legends have signed', es: '{n} leyendas han firmado' },
  count1: { en: '1 legend has signed', es: '1 leyenda ha firmado' },
  plaque: { en: 'HALL OF LEGENDS', es: 'SALÓN DE LEYENDAS' },
  empty: { en: 'The wall awaits its first legend.', es: 'El muro espera a su primera leyenda.' },
  loading: { en: 'Opening the hall…', es: 'Abriendo el salón…' },
  offline: { en: 'The Wall of Fame is coming online.', es: 'El Muro de la Fama está por abrir.' },
  no: { en: 'No. {n}', es: 'N.º {n}' },
  you: { en: 'YOU', es: 'TÚ' },
  eligibleTitle: { en: 'Your place is waiting', es: 'Tu lugar te espera' },
  eligibleSub: { en: 'You built a $1,000,000,000 Bank.', es: 'Construiste un Banco de $1,000,000,000.' },
  signCta: { en: 'SIGN THE WALL', es: 'FIRMA EL MURO' },
  signedTitle: { en: 'You’re No. {n} on the wall', es: 'Eres el N.º {n} del muro' },
  signedTitleNoNum: { en: 'You’re on the wall', es: 'Estás en el muro' },
  findMe: { en: 'FIND MY SIGNATURE', es: 'VER MI FIRMA' },
  guestTitle: { en: 'You reached $1,000,000,000', es: 'Llegaste a $1,000,000,000' },
  guestSub: { en: 'Create an account to sign the public wall.', es: 'Crea una cuenta para firmar el muro público.' },
  guestCta: { en: 'CREATE ACCOUNT', es: 'CREAR CUENTA' },
  progressLabel: { en: 'My Bank', es: 'Mi Banco' },
  toGo: { en: '{amount} to go to sign the wall', es: 'Faltan {amount} para firmar el muro' },
  // Signing experience
  signKicker: { en: 'A $1,000,000,000 BANK', es: 'UN BANCO DE $1,000,000,000' },
  signTitle: { en: 'Sign the Wall of Fame', es: 'Firma el Muro de la Fama' },
  signLead: {
    en: 'Write the name the game will remember. It goes up for every player to see.',
    es: 'Escribe el nombre que el juego recordará. Lo verán todos los jugadores.',
  },
  placeholder: { en: 'Your signature', es: 'Tu firma' },
  inputLabel: { en: 'Your signature for the Wall of Fame', es: 'Tu firma para el Muro de la Fama' },
  shownWith: { en: 'Shown with your username @{user}', es: 'Se muestra con tu usuario @{user}' },
  permanent: { en: 'Permanent — a signature can’t be changed.', es: 'Permanente: la firma no se puede cambiar.' },
  engrave: { en: 'ENGRAVE MY SIGNATURE', es: 'GRABAR MI FIRMA' },
  engraving: { en: 'ENGRAVING…', es: 'GRABANDO…' },
  cancel: { en: 'Not yet', es: 'Todavía no' },
  invalid: {
    en: 'Use 2–24 letters, numbers, spaces, periods, apostrophes or hyphens.',
    es: 'Usa de 2 a 24 letras, números, espacios, puntos, apóstrofos o guiones.',
  },
  taken: { en: 'That signature is already on the wall. Try another.', es: 'Esa firma ya está en el muro. Prueba otra.' },
  failed: { en: 'Couldn’t sign the wall. Try again.', es: 'No se pudo firmar el muro. Intenta de nuevo.' },
  welcome: { en: 'WELCOME TO THE WALL', es: 'BIENVENIDO AL MURO' },
  welcomeSub: { en: 'No. {n} · forever on the 1B Run Wall of Fame', es: 'N.º {n} · para siempre en el Muro de la Fama de 1B Run' },
  seeWall: { en: 'SEE YOUR NAME ON THE WALL', es: 'VER TU NOMBRE EN EL MURO' },
} satisfies Record<string, Copy>;

const PAGE = 120;

function pick(copy: Copy, locale: string): string {
  return locale === 'es' ? copy.es : copy.en;
}

function fill(text: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), text);
}

function monthYear(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale === 'es' ? 'es-US' : 'en-US', { month: 'short', year: 'numeric' });
}

/** Small, deterministic tilt so signatures look hand-signed, not typeset. */
function tilt(name: string): number {
  let h = 7;
  for (let i = 0; i < name.length; i += 1) h = (h * 33 + name.charCodeAt(i)) % 997;
  return ((h % 7) - 3) * 0.6;
}

interface WallOfFameScreenProps {
  open: boolean;
  /** Signed-in 1B Run username, or null for guests. */
  username: string | null;
  permanent: boolean;
  bankBalance: number;
  onClose: () => void;
  onSignIn?: () => void;
}

export function WallOfFameScreen(props: WallOfFameScreenProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>{props.open ? <WallOfFame key="wall" {...props} /> : null}</AnimatePresence>,
    document.body,
  );
}

function WallOfFame({ username, permanent, bankBalance: bank, onClose, onSignIn }: WallOfFameScreenProps) {
  const { locale } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const wallPreview = useMemo(() => isWallPreview(), []);
  const bankPreview = useMemo(() => readBankPreview() != null, []);
  const demo = wallPreview || bankPreview;
  const demoEntries = useMemo(() => (wallPreview ? previewWall() : []), [wallPreview]);

  const [entries, setEntries] = useState<WallEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [status, setStatus] = useState<MyWallStatus | null>(null);
  const [signing, setSigning] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const loadingRef = useRef(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const entriesRef = useRef<WallEntry[]>([]);
  entriesRef.current = entries;
  const demoSigned = useRef(false);

  const loadMore = useCallback(async (): Promise<WallEntry[]> => {
    if (loadingRef.current) return [];
    loadingRef.current = true;
    // The ref is updated synchronously so back-to-back calls page forward instead of repeating.
    const append = (next: WallEntry[]) => {
      const seen = new Set(entriesRef.current.map((e) => e.number));
      const merged = [...entriesRef.current, ...next.filter((e) => !seen.has(e.number))].sort((a, b) => a.number - b.number);
      entriesRef.current = merged;
      setEntries(merged);
    };
    try {
      const offset = entriesRef.current.length;
      if (demo) {
        const next = demoEntries.slice(offset, offset + PAGE);
        append(next);
        setTotal(demoEntries.length + (demoSigned.current ? 1 : 0));
        return next;
      }
      const result = await fetchWallPage(offset, PAGE);
      if (result.ok === false) {
        if (result.reason === 'unavailable') setOffline(true);
        return [];
      }
      setTotal(result.page.total);
      append(result.page.entries);
      return result.page.entries;
    } finally {
      loadingRef.current = false;
      setLoaded(true);
    }
  }, [demo, demoEntries]);

  useEffect(() => {
    void loadMore();
    if (demo) {
      setStatus({ inductedAt: qualifiesForWall(bank) || wallPreview ? new Date().toISOString() : null, signature: null, signedAt: null, number: null });
      return;
    }
    if (!permanent) return;
    let cancelled = false;
    void fetchMyWallStatus().then((result) => {
      if (!cancelled && result.ok) setStatus(result.status);
    });
    return () => {
      cancelled = true;
    };
    // Loads once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite wall: fetch the next page as the bottom comes into view.
  const hasMore = entries.length < total;
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (items) => {
        if (items.some((i) => i.isIntersecting)) void loadMore();
      },
      { root: frameRef.current, rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !signing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, signing]);

  const findMine = useCallback(
    async (number: number) => {
      let guard = 0;
      while (entriesRef.current.length < number && guard < 60) {
        const next = await loadMore();
        if (next.length === 0) break;
        guard += 1;
      }
      setHighlight(number);
      window.setTimeout(() => {
        frameRef.current
          ?.querySelector(`[data-number="${number}"]`)
          ?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      }, 60);
    },
    [loadMore, reduceMotion],
  );

  const eligible = Boolean(status?.inductedAt) && !status?.signature;
  const signed = Boolean(status?.signature);
  const guestQualified = !permanent && !demo && qualifiesForWall(bank);
  const pct = Math.min(1, bank / WALL_OF_FAME_GOAL);

  const onSigned = (signature: string, number: number | null) => {
    setStatus((cur) => ({
      inductedAt: cur?.inductedAt ?? new Date().toISOString(),
      signature,
      signedAt: new Date().toISOString(),
      number,
    }));
    if (number != null) {
      const mine: WallEntry = { number, signature, username: username ?? signature, signedAt: new Date().toISOString() };
      setTotal((t) => Math.max(t + 1, number));
      if (demo) demoSigned.current = true;
      // The page already holding your number shows you right away; otherwise Find loads it.
      const cur = entriesRef.current;
      if (cur.length >= number - 1) {
        const merged = [...cur.filter((e) => e.number !== number), mine].sort((a, b) => a.number - b.number);
        entriesRef.current = merged;
        setEntries(merged);
      }
    }
  };

  let dock = null;
  if (offline && !demo) {
    dock = <p className="wf-dock__note">{pick(COPY.offline, locale)}</p>;
  } else if (signed && status) {
    dock = (
      <div className="wf-dock__row">
        <div className="wf-dock__copy">
          <strong>
            {status.number != null
              ? fill(pick(COPY.signedTitle, locale), { n: status.number.toLocaleString('en-US') })
              : pick(COPY.signedTitleNoNum, locale)}
          </strong>
          <span className="wf-dock__sig">{status.signature}</span>
        </div>
        {status.number != null ? (
          <button
            type="button"
            className="wf-btn wf-btn--ghost"
            onClick={() => {
              hapticLight();
              void findMine(status.number!);
            }}
          >
            {pick(COPY.findMe, locale)}
          </button>
        ) : null}
      </div>
    );
  } else if (eligible) {
    dock = (
      <div className="wf-dock__cta">
        <div className="wf-dock__copy">
          <strong>{pick(COPY.eligibleTitle, locale)}</strong>
          <span>{pick(COPY.eligibleSub, locale)}</span>
        </div>
        <button
          type="button"
          className="wf-btn wf-btn--gold"
          onClick={() => {
            hapticTap();
            setSigning(true);
          }}
        >
          {pick(COPY.signCta, locale)}
        </button>
      </div>
    );
  } else if (guestQualified) {
    dock = (
      <div className="wf-dock__cta">
        <div className="wf-dock__copy">
          <strong>{pick(COPY.guestTitle, locale)}</strong>
          <span>{pick(COPY.guestSub, locale)}</span>
        </div>
        {onSignIn ? (
          <button type="button" className="wf-btn wf-btn--gold" onClick={onSignIn}>
            {pick(COPY.guestCta, locale)}
          </button>
        ) : null}
      </div>
    );
  } else {
    dock = (
      <div className="wf-dock__progress">
        <div className="wf-dock__progress-row">
          <span>{pick(COPY.progressLabel, locale)}</span>
          <strong>{formatCash(bank)}</strong>
        </div>
        <div className="wf-meter" aria-hidden>
          <motion.span
            className="wf-meter__fill"
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: Math.max(pct, 0.012) }}
            transition={{ duration: 1.1, ease: [0.25, 1, 0.5, 1], delay: 0.3 }}
          />
        </div>
        <p className="wf-dock__note">
          {fill(pick(COPY.toGo, locale), { amount: formatCash(Math.max(0, WALL_OF_FAME_GOAL - bank)) })}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      className={`wf ${signatureFont.variable}`}
      role="dialog"
      aria-modal="true"
      aria-label={pick(COPY.title, locale)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      transition={{ duration: 0.35 }}
    >
      <div ref={frameRef} className="wf__frame">
        <header className="wf__top">
          <button
            type="button"
            className="wf__back"
            onClick={() => {
              hapticLight();
              onClose();
            }}
          >
            {pick(COPY.back, locale)}
          </button>
        </header>

        <motion.div
          className="wf-hero"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
        >
          <LaurelCrest className="wf-hero__crest" />
          <p className="wf-hero__eyebrow">{pick(COPY.eyebrow, locale)}</p>
          <h1 className="wf-hero__title">{pick(COPY.title, locale)}</h1>
          <p className="wf-hero__sub">{pick(COPY.sub, locale)}</p>
          {total > 0 ? (
            <p className="wf-hero__count">
              {total === 1 ? pick(COPY.count1, locale) : fill(pick(COPY.count, locale), { n: total.toLocaleString('en-US') })}
            </p>
          ) : null}
        </motion.div>

        <section className="wf-wall" aria-label={pick(COPY.plaque, locale)}>
          <span className="wf-wall__light" aria-hidden />
          <p className="wf-wall__plate">
            <span aria-hidden />
            {pick(COPY.plaque, locale)}
            <span aria-hidden />
          </p>
          {!loaded ? (
            <p className="wf-wall__empty">{pick(COPY.loading, locale)}</p>
          ) : entries.length === 0 ? (
            <p className="wf-wall__empty">{pick(offline && !demo ? COPY.offline : COPY.empty, locale)}</p>
          ) : (
            <ol className="wf-wall__grid">
              {entries.map((entry, i) => {
                const mine = signed && status?.number === entry.number;
                return (
                  <li
                    key={entry.number}
                    data-number={entry.number}
                    className={`wf-plaque${mine ? ' is-you' : ''}${highlight === entry.number ? ' is-found' : ''}`}
                    style={{ '--i': Math.min(i, 24) } as CSSProperties}
                  >
                    <span className="wf-plaque__no">{fill(pick(COPY.no, locale), { n: entry.number.toLocaleString('en-US') })}</span>
                    <span className="wf-plaque__sig" style={{ transform: `rotate(${tilt(entry.signature)}deg)` }}>
                      {entry.signature}
                    </span>
                    <span className="wf-plaque__meta">
                      @{entry.username}
                      {monthYear(entry.signedAt, locale) ? ` · ${monthYear(entry.signedAt, locale)}` : ''}
                    </span>
                    {mine ? <em className="wf-plaque__you">{pick(COPY.you, locale)}</em> : null}
                  </li>
                );
              })}
            </ol>
          )}
          {hasMore ? <div ref={sentinelRef} className="wf-wall__more" aria-hidden /> : null}
        </section>

        <div className="wf-dock">{dock}</div>
      </div>

      <AnimatePresence>
        {signing ? (
          <SignTheWall
            key="sign"
            username={username}
            demo={demo}
            demoNumber={total + 1}
            onCancel={() => setSigning(false)}
            onSigned={onSigned}
            onDone={(number) => {
              setSigning(false);
              if (number != null) void findMine(number);
            }}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── The signing experience ── */

function SignTheWall({
  username,
  demo,
  demoNumber,
  onCancel,
  onSigned,
  onDone,
}: {
  username: string | null;
  demo: boolean;
  demoNumber: number;
  onCancel: () => void;
  onSigned: (signature: string, number: number | null) => void;
  onDone: (number: number | null) => void;
}) {
  const { locale } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ signature: string; number: number | null } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const valid = normalizeSignature(draft);

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), reduceMotion ? 0 : 450);
    return () => window.clearTimeout(id);
  }, [reduceMotion]);

  const failText = (reason: SignFailure) =>
    pick(reason === 'invalid' ? COPY.invalid : reason === 'taken' ? COPY.taken : COPY.failed, locale);

  const engrave = async () => {
    if (busy || done) return;
    const name = normalizeSignature(draft);
    if (!name) {
      setError(pick(COPY.invalid, locale));
      return;
    }
    hapticTap();
    setBusy(true);
    setError(null);
    inputRef.current?.blur();
    const minDelay = new Promise((resolve) => window.setTimeout(resolve, reduceMotion ? 0 : 800));
    let result: { signature: string; number: number | null } | null = null;
    if (demo) {
      result = { signature: name, number: demoNumber };
    } else {
      const res = await signWallOfFame(name);
      if (res.ok === true) result = { signature: res.signature, number: res.number };
      else setError(failText(res.reason));
    }
    await minDelay;
    setBusy(false);
    if (!result) return;
    hapticHeavy();
    playFinalTotalSettleSound();
    window.setTimeout(hapticSuccess, 400);
    onSigned(result.signature, result.number);
    setDone(result);
  };

  return (
    <motion.div
      className="wf-sign"
      role="dialog"
      aria-modal="true"
      aria-label={pick(COPY.signTitle, locale)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3 }}
    >
      {done && !reduceMotion ? <BillionCelebration durationMs={2400} /> : null}
      <span className="wf-sign__spot" aria-hidden />
      <AnimatePresence mode="wait">
        {done ? (
          <motion.div
            key="done"
            className="wf-sign__card is-done"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <LaurelCrest className="wf-sign__crest" />
            <p className="wf-sign__kicker">{pick(COPY.welcome, locale)}</p>
            <p className="wf-sign__signed">{done.signature}</p>
            {done.number != null ? (
              <p className="wf-sign__lead">{fill(pick(COPY.welcomeSub, locale), { n: done.number.toLocaleString('en-US') })}</p>
            ) : null}
            <button
              type="button"
              className="wf-btn wf-btn--gold"
              onClick={() => {
                hapticLight();
                onDone(done.number);
              }}
            >
              {pick(COPY.seeWall, locale)}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            className={`wf-sign__card${busy ? ' is-busy' : ''}`}
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
            transition={{ duration: 0.45, ease: [0.25, 1, 0.5, 1] }}
          >
            <p className="wf-sign__kicker">{pick(COPY.signKicker, locale)}</p>
            <h2 className="wf-sign__title">{pick(COPY.signTitle, locale)}</h2>
            <p className="wf-sign__lead">{pick(COPY.signLead, locale)}</p>
            <label className="wf-sign__pad" onClick={() => inputRef.current?.focus()}>
              <span className={`wf-sign__preview${draft ? '' : ' is-empty'}`} aria-hidden>
                {draft || pick(COPY.placeholder, locale)}
              </span>
              <input
                ref={inputRef}
                className="wf-sign__input"
                value={draft}
                maxLength={SIGNATURE_MAX}
                aria-label={pick(COPY.inputLabel, locale)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="words"
                spellCheck={false}
                enterKeyHint="done"
                disabled={busy}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void engrave();
                }}
              />
              <span className="wf-sign__line" aria-hidden />
              <span className="wf-sign__count">
                {draft.length}/{SIGNATURE_MAX}
              </span>
            </label>
            {username ? <p className="wf-sign__fine">{fill(pick(COPY.shownWith, locale), { user: username })}</p> : null}
            <p className={`wf-sign__fine${error ? ' is-error' : ''}`} role={error ? 'alert' : undefined}>
              {error ?? pick(COPY.permanent, locale)}
            </p>
            <button type="button" className="wf-btn wf-btn--gold" disabled={!valid || busy} onClick={() => void engrave()}>
              {busy ? pick(COPY.engraving, locale) : pick(COPY.engrave, locale)}
            </button>
            <button type="button" className="wf-sign__cancel" disabled={busy} onClick={onCancel}>
              {pick(COPY.cancel, locale)}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LaurelCrest({ className }: { className?: string }) {
  const id = `wf-gold-${useId().replace(/:/g, '')}`;
  const leaves = [0, 1, 2, 3, 4, 5];
  return (
    <svg className={className} viewBox="0 0 120 84" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1c2" />
          <stop offset="0.45" stopColor="#f2c25b" />
          <stop offset="1" stopColor="#a8701e" />
        </linearGradient>
      </defs>
      {[-1, 1].map((side) => (
        <g key={side} transform={side === 1 ? 'translate(120 0) scale(-1 1)' : undefined}>
          <path d="M44 76C24 70 14 52 16 30" fill="none" stroke={`url(#${id})`} strokeWidth="2.2" strokeLinecap="round" />
          {leaves.map((n) => {
            const t = n / leaves.length;
            const x = 44 - 28 * Math.sin(t * 1.35) - 2;
            const y = 74 - 46 * t;
            const angle = -38 - t * 40;
            return (
              <ellipse
                key={n}
                cx={x}
                cy={y}
                rx="6.4"
                ry="2.6"
                transform={`rotate(${angle} ${x} ${y})`}
                fill={`url(#${id})`}
                opacity={0.95 - n * 0.06}
              />
            );
          })}
        </g>
      ))}
      <path d="M50 22h20v8a10 10 0 0 1-20 0Z" fill={`url(#${id})`} />
      <path d="M50 24h-5a4.5 4.5 0 0 0 5 6M70 24h5a4.5 4.5 0 0 1-5 6" fill="none" stroke={`url(#${id})`} strokeWidth="2" />
      <path d="M60 40v7M53 50h14" stroke={`url(#${id})`} strokeWidth="3" strokeLinecap="round" />
      <path d="M60 6l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7Z" fill={`url(#${id})`} />
    </svg>
  );
}
