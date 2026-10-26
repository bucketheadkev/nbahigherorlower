'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '@/hooks/useLocale';
import {
  buyFranchise,
  fetchFranchises,
  sellFranchise,
  startFranchiseDraft,
  type FranchiseCycle,
  type FranchiseFailure,
  type FranchiseListing,
  type FranchiseSnapshot,
} from '@/lib/account/franchiseCloud';
import { isFranchisePreview } from '@/lib/account/franchisePreview';
import { BANK_CHANGED_EVENT, formatCash } from '@/lib/tradeup/bank';
import { requestEarningsSummary } from '@/lib/tradeup/earningsSummary';
import { hapticLight, hapticSuccess, hapticTap } from '@/lib/tradeup/haptics';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import {
  CHAMPIONSHIPS,
  compareFranchises,
  CYCLE_HOURS,
  franchisePrice,
  franchiseTier,
  fanPowerMilli,
  formatFanPower,
  maxHourly,
  RESALE,
  resaleValue,
  TIERS,
} from '@/lib/tradeup/ownership/config';
import { rosterFans } from '@/lib/tradeup/ownership/fans';
import { TEAMS } from '@/lib/tradeup/teams';
import { TickerNumber } from '../onboarding/ticker';
import { FranchiseDraftScreen } from './FranchiseDraftScreen';
import {
  ClockIcon,
  Crest,
  FansIcon,
  formatFans,
  FranchiseRosterCards,
  PayFormula,
  teamTheme,
  TrophyIcon,
} from './FranchiseParts';

type Copy = { en: string; es: string };

const COPY = {
  back: { en: '← Back', es: '← Atrás' },
  title: { en: 'FRANCHISES', es: 'FRANQUICIAS' },
  motto: {
    en: 'Own the franchise · Build the roster · Grow your fans · Collect your paycheck',
    es: 'Sé el dueño · Arma el quinteto · Suma fans · Cobra tu sueldo',
  },
  bank: { en: 'My Bank', es: 'Mi Banco' },
  preview: { en: 'Preview wallet', es: 'Billetera de prueba' },
  rules: {
    en: 'Own one franchise. Draft five players every 48 hours. Better players bring more fans. More fans earn more money every hour.',
    es: 'Ten una franquicia. Elige cinco jugadores cada 48 horas. Mejores jugadores atraen más fans. Más fans ganan más dinero cada hora.',
  },
  chipForever: { en: 'Yours until you sell', es: 'Tuya hasta que la vendas' },
  chipRotate: { en: 'New five every 48 hours', es: 'Nuevo quinteto cada 48 h' },
  chipFans: { en: 'More fans, bigger paychecks', es: 'Más fans, más sueldo' },
  chipOne: { en: 'One franchise at a time', es: 'Una franquicia a la vez' },
  chipSell: { en: 'Sell anytime · {pct} back', es: 'Vende cuando quieras · {pct}' },
  formula: {
    en: 'Hourly pay = franchise price × 0.075% × Fan Power. Fan Power = your five players’ fans ÷ 1 billion (up to 2.0).',
    es: 'Pago por hora = precio de la franquicia × 0.075% × Poder de fans. Poder de fans = fans de tus cinco ÷ 1,000 millones (hasta 2.0).',
  },
  upTo: { en: 'Up to {amount} / hr', es: 'Hasta {amount} / h' },
  earnsUpTo: { en: 'Earns up to {amount} per hour', es: 'Gana hasta {amount} por hora' },
  howPay: { en: 'How pay works', es: 'Cómo se paga' },
  fanPower: { en: 'Fan Power {power}', es: 'Poder de fans {power}' },
  choose: { en: 'CHOOSE YOUR FRANCHISE', es: 'ELIGE TU FRANQUICIA' },
  browse: { en: 'ALL FRANCHISES', es: 'TODAS LAS FRANQUICIAS' },
  of: { en: '{n} of {total}', es: '{n} de {total}' },
  titles: { en: '{n} titles', es: '{n} títulos' },
  title1: { en: '1 title', es: '1 título' },
  titles0: { en: 'No titles yet', es: 'Sin títulos aún' },
  price: { en: 'Price', es: 'Precio' },
  owned: { en: 'OWNED', es: 'TUYA' },
  prev: { en: 'Previous franchise', es: 'Franquicia anterior' },
  next: { en: 'Next franchise', es: 'Siguiente franquicia' },
  buy: { en: 'BUY · {amount}', es: 'COMPRAR · {amount}' },
  need: { en: 'NEED {amount} MORE', es: 'TE FALTAN {amount}' },
  resaleLine: { en: 'Sell anytime for {amount} ({pct})', es: 'Véndela cuando quieras por {amount} ({pct})' },
  confirmBuy: { en: 'Buy the {name} for {amount}?', es: '¿Comprar a los {name} por {amount}?' },
  confirmNote: {
    en: 'Yours until you sell. Selling returns {resale}.',
    es: 'Es tuya hasta que la vendas. Al venderla recibes {resale}.',
  },
  confirm: { en: 'CONFIRM PURCHASE', es: 'CONFIRMAR COMPRA' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  youOwnThis: { en: 'This is your franchise.', es: 'Esta es tu franquicia.' },
  sellFirst: { en: 'Sell the {name} to buy a different franchise.', es: 'Vende a los {name} para comprar otra franquicia.' },
  signIn: { en: 'SIGN IN TO OWN', es: 'INICIA SESIÓN' },
  bought: { en: 'Welcome, owner! Draft your starting five to start earning.', es: '¡Bienvenido, dueño! Elige tu quinteto para empezar a ganar.' },
  purchased: { en: 'Bought for {amount}', es: 'Comprada por {amount}' },
  nextPay: { en: 'NEXT PAYCHECK', es: 'PRÓXIMO PAGO' },
  paused: { en: 'PAUSED', es: 'EN PAUSA' },
  totalFans: { en: 'FANS', es: 'FANS' },
  perHour: { en: '/ HOUR', es: '/ HORA' },
  noFans: { en: 'Draft five players to bring in fans', es: 'Elige cinco jugadores para atraer fans' },
  expiredFans: { en: 'Roster expired · paychecks stopped', es: 'Quinteto vencido · pagos detenidos' },
  five: { en: 'YOUR STARTING FIVE', es: 'TU QUINTETO TITULAR' },
  openSeat: { en: 'Open', es: 'Libre' },
  stateLive: { en: 'LIVE', es: 'EN VIVO' },
  stateDraft: { en: 'DRAFTING {n}/5', es: 'DRAFT {n}/5' },
  stateExpired: { en: 'EXPIRED', es: 'VENCIDO' },
  draft: { en: 'DRAFT YOUR STARTING FIVE', es: 'ELIGE TU QUINTETO' },
  continue: { en: 'CONTINUE DRAFT · {n}/5', es: 'CONTINUAR DRAFT · {n}/5' },
  redraft: { en: 'DRAFT A NEW FIVE', es: 'ELIGE UN NUEVO QUINTETO' },
  earned: { en: 'Earned this roster', es: 'Ganado con este quinteto' },
  paychecks: { en: 'Paychecks', es: 'Pagos' },
  collect: { en: 'COLLECT {amount}', es: 'COBRAR {amount}' },
  expiresIn: { en: 'ROSTER EXPIRES IN', es: 'EL QUINTETO VENCE EN' },
  expired: { en: 'ROSTER EXPIRED', es: 'QUINTETO VENCIDO' },
  expiredNote: { en: 'Your franchise is still yours. Draft a new five to restart paychecks.', es: 'La franquicia sigue siendo tuya. Elige un nuevo quinteto para reiniciar los pagos.' },
  idleNote: { en: 'Locking in five players starts 48 hours of hourly paychecks.', es: 'Fijar cinco jugadores inicia 48 horas de pagos por hora.' },
  sell: { en: 'Sell franchise', es: 'Vender franquicia' },
  sellTitle: { en: 'Sell the {name}?', es: '¿Vender a los {name}?' },
  sellResale: { en: 'Resale value ({pct} of {paid})', es: 'Valor de reventa ({pct} de {paid})' },
  sellUnpaid: { en: 'Earned, not yet collected', es: 'Ganado sin cobrar' },
  sellTotal: { en: 'Added to your Bank', es: 'Se suma a tu Banco' },
  sellEarning: {
    en: 'Your roster stops earning now. The remaining {hours} hourly paychecks are forfeited.',
    es: 'Tu quinteto deja de generar ahora. Pierdes los {hours} pagos por hora restantes.',
  },
  sellDrafting: { en: 'Your unfinished draft is cancelled.', es: 'Tu draft sin terminar se cancela.' },
  sellConfirm: { en: 'SELL FOR {amount}', es: 'VENDER POR {amount}' },
  keep: { en: 'Keep it', es: 'Conservar' },
  sold: { en: 'Sold the {name}. {amount} added to your Bank.', es: 'Vendiste a los {name}. {amount} sumados a tu Banco.' },
  offline: { en: 'FRANCHISES ARE COMING ONLINE', es: 'LAS FRANQUICIAS ESTÁN POR ABRIR' },
  offlineNote: { en: 'Browse below. Buying opens once the server is ready.', es: 'Explora abajo. Las compras abren cuando el servidor esté listo.' },
  failInsufficient: { en: 'Not enough in your Bank.', es: 'No tienes suficiente en tu Banco.' },
  failOwn: { en: 'Sell your franchise first.', es: 'Primero vende tu franquicia.' },
  failActive: { en: 'Your roster is still earning.', es: 'Tu quinteto sigue generando.' },
  failGeneric: { en: 'Something went wrong. Try again.', es: 'Algo salió mal. Intenta de nuevo.' },
  busy: { en: 'One moment…', es: 'Un momento…' },
  gameCash: { en: 'Game cash · not real money', es: 'Dinero del juego · no es dinero real' },
} satisfies Record<string, Copy>;

const REFRESH_MS = 30_000;
const PCT = `${RESALE.refundBps / 100}%`;
const ease = [0.25, 1, 0.5, 1] as const;

function pick(copy: Copy, locale: string): string {
  return locale === 'es' ? copy.es : copy.en;
}

function fill(text: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), text);
}

function failureText(reason: FranchiseFailure, locale: string): string {
  if (reason === 'insufficient') return pick(COPY.failInsufficient, locale);
  if (reason === 'already_own') return pick(COPY.failOwn, locale);
  if (reason === 'cycle_active') return pick(COPY.failActive, locale);
  return pick(COPY.failGeneric, locale);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Paycheck countdown, always under an hour: 42:07. */
function paycheckTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Roster countdown: 41h 52m 07s — reads differently from the paycheck clock on purpose. */
function rosterTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 3600)}h ${pad(Math.floor((total % 3600) / 60))}m ${pad(total % 60)}s`;
}

function titlesLabel(n: number, locale: string): string {
  if (n === 0) return pick(COPY.titles0, locale);
  return n === 1 ? pick(COPY.title1, locale) : fill(pick(COPY.titles, locale), { n });
}

function teamParts(teamId: string, fallback: string): { city: string; name: string } {
  const team = TEAMS.find((t) => t.id === teamId);
  return team ? { city: team.city, name: team.name } : { city: '', name: fallback };
}

const money = (value: number) => formatCash(value);

/** Live view of a locked roster from its server terms and the server clock. */
function rosterClock(cycle: FranchiseCycle, serverNow: number) {
  const locked = cycle.lockedAt ? Date.parse(cycle.lockedAt) : NaN;
  const ends = cycle.endsAt ? Date.parse(cycle.endsAt) : NaN;
  const hours = cycle.hoursTotal ?? CYCLE_HOURS;
  const valid = Number.isFinite(locked) && Number.isFinite(ends) && ends > locked && hours > 0;
  const hourMs = valid ? (ends - locked) / hours : 3_600_000;
  const elapsed = valid ? Math.max(0, serverNow - locked) : 0;
  const active = valid && serverNow < ends;
  const earned = valid ? Math.min(hours, Math.max(cycle.hoursEarned, Math.floor(elapsed / hourMs))) : cycle.hoursEarned;
  const hourly = cycle.hourlyRate ?? 0;
  const legacyBonus = !active && !cycle.bonusPaid ? cycle.completionBonus ?? 0 : 0;
  return {
    active,
    hours,
    earned,
    hourly,
    earnedCash: earned * hourly + (!active ? cycle.completionBonus ?? 0 : 0),
    unpaid: Math.max(earned - cycle.hoursPaid, 0) * hourly + legacyBonus,
    nextPayMs: active ? hourMs - (elapsed % hourMs) : 0,
    hourProgress: active ? (elapsed % hourMs) / hourMs : 0,
    remainingMs: valid ? Math.max(0, ends - serverNow) : 0,
    rosterLeft: valid ? Math.max(0, Math.min(1, (ends - serverNow) / (ends - locked))) : 0,
  };
}

/** Catalog from the shared config — shown before the server answers or if it isn't live yet. */
function localCatalog(): FranchiseSnapshot {
  return {
    serverTime: new Date().toISOString(),
    resaleBps: RESALE.refundBps,
    owned: null,
    cycle: null,
    franchises: TEAMS.map((t) => ({ teamId: t.id, name: t.fullName, championships: CHAMPIONSHIPS[t.id] ?? 0 }))
      .sort(compareFranchises)
      .map((t) => ({ ...t, tier: franchiseTier(t.teamId), price: franchisePrice(t.teamId) })),
  };
}

function useAction(locale: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const run = async (task: () => Promise<FranchiseFailure | null>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const failure = await task();
      if (failure) setError(failureText(failure, locale));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

interface FranchisesScreenProps {
  open: boolean;
  permanent: boolean;
  bankBalance: number | null;
  onClose: () => void;
  onSignIn: () => void;
}

export function FranchisesScreen(props: FranchisesScreenProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>{props.open ? <Franchises key="franchises" {...props} /> : null}</AnimatePresence>,
    document.body,
  );
}

function Franchises({ permanent: permanentProp, bankBalance: bankProp, onClose, onSignIn }: FranchisesScreenProps) {
  const { locale } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const preview = isFranchisePreview();
  const permanent = permanentProp || preview;
  const [snapshot, setSnapshot] = useState<FranchiseSnapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [drafting, setDrafting] = useState(false);
  const [previewBank, setPreviewBank] = useState<number | null>(null);
  const [justBought, setJustBought] = useState(false);
  const [soldNote, setSoldNote] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const apply = useCallback((next: FranchiseSnapshot) => {
    setSnapshot(next);
    setClockOffset(Date.parse(next.serverTime) - Date.now());
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const result = await fetchFranchises();
    loadingRef.current = false;
    if (preview) void import('@/lib/account/franchisePreview').then((m) => setPreviewBank(m.previewBank()));
    if (result.ok === false) {
      if (result.reason === 'unavailable') setOffline(true);
      return;
    }
    setOffline(false);
    apply(result.data);
  }, [apply, preview]);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const onBank = () => void load();
    window.addEventListener(BANK_CHANGED_EVENT, onBank);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(tick);
      window.removeEventListener(BANK_CHANGED_EVENT, onBank);
    };
  }, [load, permanent]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !drafting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drafting, onClose]);

  const view = snapshot ?? localCatalog();
  const bankBalance = preview ? previewBank : bankProp;
  const serverNow = now + clockOffset;
  const ownedListing = view.owned ? view.franchises.find((f) => f.teamId === view.owned!.teamId) ?? null : null;

  // A roster that just expired flips on its own; refresh so the server agrees.
  const endsAt = view.cycle?.endsAt ? Date.parse(view.cycle.endsAt) : Infinity;
  const endPassed = view.cycle?.status === 'earning' && serverNow >= endsAt + 1000;
  useEffect(() => {
    if (endPassed) void load();
  }, [endPassed, load]);

  const updateCycle = useCallback((cycle: FranchiseCycle) => {
    setSnapshot((current) => (current ? { ...current, cycle } : current));
  }, []);

  const toTop = useCallback(() => {
    frameRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [reduceMotion]);

  const onBought = useCallback(
    (next: FranchiseSnapshot) => {
      apply(next);
      setSoldNote(null);
      setJustBought(true);
      toTop();
      window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
    },
    [apply, toTop],
  );

  return (
    <motion.div
      className="circuit fx"
      role="dialog"
      aria-modal="true"
      aria-label={pick(COPY.title, locale)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        ref={frameRef}
        className="circuit__frame fx__frame"
        initial={reduceMotion ? false : { y: 22, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 14, opacity: 0, transition: { duration: 0.2 } }}
        transition={{ duration: 0.45, ease }}
      >
        <header className="circuit__top">
          <button
            type="button"
            className="circuit__back"
            onClick={() => {
              hapticLight();
              onClose();
            }}
          >
            {pick(COPY.back, locale)}
          </button>
          {bankBalance != null ? (
            <span className="circuit__bank">
              <em>{pick(preview ? COPY.preview : COPY.bank, locale)}</em>
              <strong>{formatCash(bankBalance)}</strong>
            </span>
          ) : null}
        </header>

        <div className="fx-head">
          <h1 className="fx-head__title">{pick(COPY.title, locale)}</h1>
          <p className="fx-head__motto">{pick(COPY.motto, locale)}</p>
        </div>

        {offline ? (
          <div className="circuit__state">
            <p className="circuit__state-title">{pick(COPY.offline, locale)}</p>
            <p className="circuit__state-note">{pick(COPY.offlineNote, locale)}</p>
          </div>
        ) : null}

        {soldNote ? (
          <p className="fx-note is-sold" role="status">
            {soldNote}
          </p>
        ) : null}

        <AnimatePresence mode="wait" initial={false}>
          {view.owned && ownedListing ? (
            <motion.div
              key={`own-${ownedListing.teamId}`}
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.2 } }}
              transition={{ duration: 0.5, ease }}
            >
              <OwnedDashboard
                listing={ownedListing}
                snapshot={view}
                serverNow={serverNow}
                disabled={offline}
                justBought={justBought}
                onSnapshot={apply}
                onOpenDraft={() => {
                  setJustBought(false);
                  setDrafting(true);
                }}
                onSold={(note, next) => {
                  apply(next);
                  setJustBought(false);
                  setSoldNote(note);
                  toTop();
                  window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
                }}
              />
            </motion.div>
          ) : (
            <motion.section
              key="rules"
              className="fx-rules"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
              transition={{ duration: 0.4, ease }}
            >
              <p className="fx-rules__lead">{pick(COPY.rules, locale)}</p>
              <ul className="fx-rules__chips">
                <li>{pick(COPY.chipForever, locale)}</li>
                <li>{pick(COPY.chipRotate, locale)}</li>
                <li>{pick(COPY.chipFans, locale)}</li>
                <li>{pick(COPY.chipOne, locale)}</li>
                <li>{fill(pick(COPY.chipSell, locale), { pct: PCT })}</li>
              </ul>
              <p className="fx-rules__formula">{pick(COPY.formula, locale)}</p>
            </motion.section>
          )}
        </AnimatePresence>

        <FranchiseBrowser
          listings={view.franchises}
          ownedTeamId={view.owned?.teamId ?? null}
          ownedName={ownedListing?.name ?? null}
          permanent={permanent}
          bankBalance={bankBalance}
          disabled={offline || snapshot == null}
          onBought={onBought}
          onSignIn={onSignIn}
        />

        <p className="circuit__cash">{pick(COPY.gameCash, locale)}</p>
      </motion.div>

      {drafting && ownedListing && view.owned && view.cycle?.status === 'drafting' ? (
        <FranchiseDraftScreen
          key={view.cycle.id}
          listing={ownedListing}
          pricePaid={view.owned.pricePaid}
          cycle={view.cycle}
          onCycle={updateCycle}
          onClose={() => {
            setDrafting(false);
            void load();
            toTop();
          }}
        />
      ) : null}
    </motion.div>
  );
}

/* ── Owned franchise: the management dashboard ── */

function OwnedDashboard({
  listing,
  snapshot,
  serverNow,
  disabled,
  justBought,
  onSnapshot,
  onOpenDraft,
  onSold,
}: {
  listing: FranchiseListing;
  snapshot: FranchiseSnapshot;
  serverNow: number;
  disabled: boolean;
  justBought: boolean;
  onSnapshot: (next: FranchiseSnapshot) => void;
  onOpenDraft: () => void;
  onSold: (note: string, next: FranchiseSnapshot) => void;
}) {
  const { locale } = useLocale();
  const owned = snapshot.owned!;
  const cycle = snapshot.cycle;
  const { busy, error, run } = useAction(locale);
  const [selling, setSelling] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const sellRef = useRef<HTMLDivElement | null>(null);
  const parts = teamParts(listing.teamId, listing.name);

  useEffect(() => {
    if (!selling) return;
    const timer = window.setTimeout(
      () => sellRef.current?.scrollIntoView({ block: 'nearest', behavior: getPrefersReducedMotion() ? 'auto' : 'smooth' }),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [selling]);
  const resale = owned.resaleValue || resaleValue(owned.pricePaid);

  const locked = cycle != null && cycle.status !== 'drafting';
  const clock = locked ? rosterClock(cycle, serverNow) : null;
  const live = clock?.active ?? false;
  const expired = locked && !live;
  const picks = cycle?.picks ?? [];
  const fans = locked ? cycle.fans ?? rosterFans(picks) : 0;
  const powerMilli = locked ? cycle.fanPowerMilli ?? fanPowerMilli(fans) : 0;

  const startDraft = () =>
    run(async () => {
      hapticTap();
      if (cycle?.status === 'drafting') {
        onOpenDraft();
        return null;
      }
      const result = await startFranchiseDraft(listing.teamId);
      if (result.ok === false) return result.reason;
      onSnapshot(result.data);
      if (expired) window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
      onOpenDraft();
      return null;
    });

  const sell = () =>
    run(async () => {
      hapticTap();
      const result = await sellFranchise(listing.teamId);
      if (result.ok === false) return result.reason;
      hapticSuccess();
      const sale = result.data.sale;
      const credited = sale ? sale.proceeds + sale.income + sale.bonus : 0;
      onSold(fill(pick(COPY.sold, locale), { name: listing.name, amount: formatCash(credited) }), result.data.snapshot);
      return null;
    });

  const unpaid = clock?.unpaid ?? 0;
  const forfeitHours = clock && live ? clock.hours - clock.earned : 0;
  const ringDash = 2 * Math.PI * 20;

  let stateChip = null;
  if (live) stateChip = <em className="fx-chip is-live">{pick(COPY.stateLive, locale)}</em>;
  else if (expired) stateChip = <em className="fx-chip is-expired">{pick(COPY.stateExpired, locale)}</em>;
  else if (cycle?.status === 'drafting') {
    stateChip = <em className="fx-chip is-draft">{fill(pick(COPY.stateDraft, locale), { n: picks.length })}</em>;
  }

  return (
    <article className={`fx-own${live ? ' is-live' : ''}${justBought ? ' is-new' : ''}`} style={teamTheme(listing.teamId)}>
      <span className="fx-own__glow" aria-hidden />
      {justBought ? (
        <p className="fx-note is-bought" role="status">
          {pick(COPY.bought, locale)}
        </p>
      ) : null}

      <header className="fx-own__top">
        <Crest teamId={listing.teamId} className="fx-own__crest" />
        <div className="fx-own__id">
          <p className="fx-own__city">{parts.city}</p>
          <h2 className="fx-own__name">{parts.name}</h2>
          <p className="fx-own__meta">
            <span className="fx-own__titles">
              <TrophyIcon className="fx-icon" />
              {listing.championships}
            </span>
            <span className="fx-own__paid">{fill(pick(COPY.purchased, locale), { amount: formatCash(owned.pricePaid) })}</span>
          </p>
        </div>
        <div className={`fx-pay${live ? ' is-live' : ''}`} aria-live="off">
          <svg className="fx-pay__ring" viewBox="0 0 48 48" aria-hidden>
            <circle cx="24" cy="24" r="20" className="fx-pay__track" />
            <circle
              cx="24"
              cy="24"
              r="20"
              className="fx-pay__fill"
              strokeDasharray={ringDash}
              strokeDashoffset={ringDash * (1 - (clock?.hourProgress ?? 0))}
            />
          </svg>
          <strong className="fx-pay__time">{live ? paycheckTime(clock!.nextPayMs) : '––:––'}</strong>
          <span className="fx-pay__label">{live ? pick(COPY.nextPay, locale) : pick(COPY.paused, locale)}</span>
        </div>
      </header>

      <section className={`fx-fans${live ? ' is-live' : ''}${expired ? ' is-expired' : ''}`}>
        <p className="fx-fans__count">
          <FansIcon className="fx-fans__icon" />
          <TickerNumber value={fans} from={0} duration={1400} format={formatFans} className="fx-fans__num" />
          <span className="fx-fans__word">{pick(COPY.totalFans, locale)}</span>
        </p>
        {live ? (
          <p className="fx-fans__rate">
            +<TickerNumber value={clock!.hourly} from={0} duration={1400} format={money} />
            <span className="fx-fans__per">{pick(COPY.perHour, locale)}</span>
          </p>
        ) : (
          <p className="fx-fans__hint">{expired ? pick(COPY.expiredFans, locale) : pick(COPY.noFans, locale)}</p>
        )}
        {live ? (
          <button
            type="button"
            className={`fx-fans__how${showMath ? ' is-open' : ''}`}
            aria-expanded={showMath}
            onClick={() => {
              hapticLight();
              setShowMath((v) => !v);
            }}
          >
            <span>{fill(pick(COPY.fanPower, locale), { power: formatFanPower(powerMilli) })}</span>
            <span aria-hidden>·</span>
            <span>{pick(COPY.howPay, locale)}</span>
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        ) : null}
        <AnimatePresence initial={false}>
          {live && showMath ? (
            <motion.div
              key="math"
              className="fx-fans__math"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.26, ease }}
            >
              <PayFormula
                pricePaid={owned.pricePaid}
                fans={fans}
                powerMilli={powerMilli}
                hourly={clock!.hourly}
                hours={clock!.hours}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      <section className="fx-own__five">
        <div className="fx-sub">
          <span>{pick(COPY.five, locale)}</span>
          {stateChip}
        </div>
        <FranchiseRosterCards
          teamId={listing.teamId}
          picks={picks}
          emptyLabel={pick(COPY.openSeat, locale)}
          className={expired ? 'is-faded' : undefined}
        />
      </section>

      {!live ? (
        <div className="fx-own__cta">
          <button type="button" className="fx-btn fx-btn--go" disabled={disabled || busy} onClick={() => void startDraft()}>
            {busy
              ? pick(COPY.busy, locale)
              : cycle?.status === 'drafting'
                ? fill(pick(COPY.continue, locale), { n: picks.length })
                : expired
                  ? pick(COPY.redraft, locale)
                  : pick(COPY.draft, locale)}
          </button>
          {!cycle ? <p className="fx-own__note">{pick(COPY.idleNote, locale)}</p> : null}
        </div>
      ) : null}

      {clock ? (
        <section className="fx-ops">
          <dl className="fx-ops__grid">
            <div>
              <dt>{pick(COPY.earned, locale)}</dt>
              <dd className="is-money">
                <TickerNumber value={clock.earnedCash} duration={900} format={money} />
              </dd>
            </div>
            <div>
              <dt>{pick(COPY.paychecks, locale)}</dt>
              <dd>
                {clock.earned}
                <small> / {clock.hours}</small>
              </dd>
            </div>
          </dl>
          {unpaid > 0 ? (
            <button
              type="button"
              className="fx-btn fx-btn--collect"
              disabled={disabled}
              onClick={() => {
                hapticTap();
                requestEarningsSummary();
              }}
            >
              {fill(pick(COPY.collect, locale), { amount: formatCash(unpaid) })}
            </button>
          ) : null}
          <div className={`fx-roster${expired ? ' is-expired' : ''}`}>
            <ClockIcon className="fx-roster__icon" />
            <span className="fx-roster__label">{expired ? pick(COPY.expired, locale) : pick(COPY.expiresIn, locale)}</span>
            {!expired ? <strong className="fx-roster__time">{rosterTime(clock.remainingMs)}</strong> : null}
            <span className="fx-roster__bar" aria-hidden>
              <i style={{ transform: `scaleX(${clock.rosterLeft})` }} />
            </span>
            {expired ? <p className="fx-roster__note">{pick(COPY.expiredNote, locale)}</p> : null}
          </div>
        </section>
      ) : null}

      <AnimatePresence initial={false}>
        {selling ? (
          <motion.div
            key="sell"
            className="fx-sell"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease }}
          >
            <div ref={sellRef} className="fx-sell__inner">
              <p className="fx-sell__title">{fill(pick(COPY.sellTitle, locale), { name: listing.name })}</p>
              <dl className="fx-sell__rows">
                <div>
                  <dt>{fill(pick(COPY.sellResale, locale), { pct: PCT, paid: formatCash(owned.pricePaid) })}</dt>
                  <dd>{formatCash(resale)}</dd>
                </div>
                {unpaid > 0 ? (
                  <div>
                    <dt>{pick(COPY.sellUnpaid, locale)}</dt>
                    <dd>{formatCash(unpaid)}</dd>
                  </div>
                ) : null}
                <div className="fx-sell__total">
                  <dt>{pick(COPY.sellTotal, locale)}</dt>
                  <dd>{formatCash(resale + unpaid)}</dd>
                </div>
              </dl>
              {live ? (
                <p className="fx-sell__effect">{fill(pick(COPY.sellEarning, locale), { hours: forfeitHours })}</p>
              ) : cycle?.status === 'drafting' ? (
                <p className="fx-sell__effect">{pick(COPY.sellDrafting, locale)}</p>
              ) : null}
              <div className="fx-sell__actions">
                <button type="button" className="fx-btn fx-btn--ghost" disabled={busy} onClick={() => setSelling(false)}>
                  {pick(COPY.keep, locale)}
                </button>
                <button type="button" className="fx-btn fx-btn--sell" disabled={busy || disabled} onClick={() => void sell()}>
                  {busy ? pick(COPY.busy, locale) : fill(pick(COPY.sellConfirm, locale), { amount: formatCash(resale) })}
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!selling ? (
        <button
          type="button"
          className="fx-own__sell"
          disabled={disabled || busy}
          onClick={() => {
            hapticLight();
            setSelling(true);
          }}
        >
          {pick(COPY.sell, locale)}
        </button>
      ) : null}

      {error ? (
        <p className="fx-error" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}

/* ── Browse + buy: horizontal snap carousel ── */

function FranchiseBrowser({
  listings,
  ownedTeamId,
  ownedName,
  permanent,
  bankBalance,
  disabled,
  onBought,
  onSignIn,
}: {
  listings: FranchiseListing[];
  ownedTeamId: string | null;
  ownedName: string | null;
  permanent: boolean;
  bankBalance: number | null;
  disabled: boolean;
  onBought: (next: FranchiseSnapshot) => void;
  onSignIn: () => void;
}) {
  const { locale } = useLocale();
  const reduceMotion = getPrefersReducedMotion();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(() => Math.max(0, listings.findIndex((l) => l.teamId === ownedTeamId)));
  const [confirming, setConfirming] = useState(false);
  const { busy, error, setError, run } = useAction(locale);
  const current = listings[Math.min(index, listings.length - 1)];

  const cards = () => Array.from(trackRef.current?.querySelectorAll<HTMLElement>('.fx-card') ?? []);

  /** Depth: the centered card is full size; neighbours shrink and dim with distance. */
  const paint = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const mid = track.scrollLeft + track.clientWidth / 2;
    let nearest = 0;
    let best = Infinity;
    cards().forEach((card, i) => {
      const center = card.offsetLeft + card.offsetWidth / 2;
      const d = Math.min(1, Math.abs(center - mid) / card.offsetWidth);
      if (Math.abs(center - mid) < best) {
        best = Math.abs(center - mid);
        nearest = i;
      }
      card.style.transform = `scale(${1 - d * 0.09})`;
      card.style.opacity = String(1 - d * 0.45);
    });
    if (nearest !== indexRef.current) {
      indexRef.current = nearest;
      setIndex(nearest);
      setConfirming(false);
      setError(null);
    }
  }, [setError]);

  const goTo = useCallback(
    (i: number, smooth = true) => {
      const track = trackRef.current;
      const card = cards()[i];
      if (!track || !card) return;
      track.scrollTo({
        left: card.offsetLeft + card.offsetWidth / 2 - track.clientWidth / 2,
        behavior: smooth && !reduceMotion ? 'smooth' : 'auto',
      });
    },
    [reduceMotion],
  );

  useLayoutEffect(() => {
    indexRef.current = index;
    goTo(index, false);
    paint();
    // Only on mount; later moves come from the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      track.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [paint]);

  const buy = () =>
    run(async () => {
      hapticTap();
      const result = await buyFranchise(current.teamId);
      if (result.ok === false) return result.reason;
      hapticSuccess();
      setConfirming(false);
      onBought(result.data);
      return null;
    });

  const short = bankBalance != null && current ? Math.max(0, current.price - bankBalance) : 0;
  const ownsThis = ownedTeamId === current?.teamId;
  const resale = current ? resaleValue(current.price) : 0;

  let action = null;
  if (!current) action = null;
  else if (ownsThis) action = <p className="fx-buy__note is-yours">{pick(COPY.youOwnThis, locale)}</p>;
  else if (ownedTeamId) {
    action = <p className="fx-buy__note">{fill(pick(COPY.sellFirst, locale), { name: ownedName ?? '' })}</p>;
  } else if (!permanent) {
    action = (
      <button type="button" className="fx-btn fx-btn--ghost" onClick={onSignIn}>
        {pick(COPY.signIn, locale)}
      </button>
    );
  } else if (confirming) {
    action = (
      <div className="fx-buy__confirm">
        <p className="fx-buy__prompt">{fill(pick(COPY.confirmBuy, locale), { name: current.name, amount: formatCash(current.price) })}</p>
        <p className="fx-buy__fine">{fill(pick(COPY.confirmNote, locale), { resale: formatCash(resale) })}</p>
        <div className="fx-buy__row">
          <button type="button" className="fx-btn fx-btn--ghost" disabled={busy} onClick={() => setConfirming(false)}>
            {pick(COPY.cancel, locale)}
          </button>
          <button type="button" className="fx-btn fx-btn--go" disabled={busy || disabled} onClick={() => void buy()}>
            {busy ? pick(COPY.busy, locale) : pick(COPY.confirm, locale)}
          </button>
        </div>
      </div>
    );
  } else {
    action = (
      <>
        <button
          type="button"
          className="fx-btn fx-btn--go"
          disabled={disabled || short > 0 || bankBalance == null}
          onClick={() => {
            hapticLight();
            setConfirming(true);
          }}
        >
          {short > 0
            ? fill(pick(COPY.need, locale), { amount: formatCash(short) })
            : fill(pick(COPY.buy, locale), { amount: formatCash(current.price) })}
        </button>
        <p className="fx-buy__fine">
          {fill(pick(COPY.earnsUpTo, locale), { amount: formatCash(maxHourly(current.price)) })} ·{' '}
          {fill(pick(COPY.resaleLine, locale), { amount: formatCash(resale), pct: PCT })}
        </p>
      </>
    );
  }

  return (
    <section className="fx-browse" aria-roledescription="carousel" aria-label={pick(ownedTeamId ? COPY.browse : COPY.choose, locale)}>
      <div className="fx-sub">
        <span>{pick(ownedTeamId ? COPY.browse : COPY.choose, locale)}</span>
        <em className="fx-browse__count">{fill(pick(COPY.of, locale), { n: index + 1, total: listings.length })}</em>
      </div>

      <div className="fx-carousel">
        <div ref={trackRef} className="fx-carousel__track">
          {listings.map((listing, i) => (
            <FranchiseCard
              key={listing.teamId}
              listing={listing}
              owned={listing.teamId === ownedTeamId}
              centered={i === index}
              onPress={() => {
                if (i !== indexRef.current) {
                  hapticLight();
                  goTo(i);
                }
              }}
            />
          ))}
        </div>
        <button
          type="button"
          className="fx-carousel__nav is-prev"
          aria-label={pick(COPY.prev, locale)}
          disabled={index === 0}
          onClick={() => goTo(Math.max(0, index - 1))}
        >
          ‹
        </button>
        <button
          type="button"
          className="fx-carousel__nav is-next"
          aria-label={pick(COPY.next, locale)}
          disabled={index >= listings.length - 1}
          onClick={() => goTo(Math.min(listings.length - 1, index + 1))}
        >
          ›
        </button>
      </div>

      <div className="fx-buy" style={current ? teamTheme(current.teamId) : undefined}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${current?.teamId}-${confirming ? 'c' : 'b'}`}
            className="fx-buy__body"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease }}
          >
            {action}
          </motion.div>
        </AnimatePresence>
        {error ? (
          <p className="fx-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function FranchiseCard({
  listing,
  owned,
  centered,
  onPress,
}: {
  listing: FranchiseListing;
  owned: boolean;
  centered: boolean;
  onPress: () => void;
}) {
  const { locale } = useLocale();
  const parts = teamParts(listing.teamId, listing.name);
  const tier = TIERS[listing.tier];
  return (
    <button
      type="button"
      className={`fx-card fx-card--${listing.tier}${owned ? ' is-owned' : ''}${centered ? ' is-centered' : ''}`}
      style={teamTheme(listing.teamId)}
      aria-label={`${listing.name}, ${pick(tier.name, locale)}, ${titlesLabel(listing.championships, locale)}, ${formatCash(listing.price)}`}
      aria-current={centered ? 'true' : undefined}
      onClick={onPress}
    >
      <span className="fx-card__mark" aria-hidden>
        {listing.teamId}
      </span>
      <span className="fx-card__top">
        <span className="fx-card__tier">{pick(tier.name, locale)}</span>
        {owned ? <span className="fx-card__owned">{pick(COPY.owned, locale)}</span> : null}
      </span>
      <Crest teamId={listing.teamId} className="fx-card__crest" />
      <span className="fx-card__city">{parts.city}</span>
      <strong className="fx-card__name">{parts.name}</strong>
      <span className="fx-card__titles">
        <TrophyIcon className="fx-icon" />
        {titlesLabel(listing.championships, locale)}
      </span>
      <span className="fx-card__price">
        <em>{pick(COPY.price, locale)}</em>
        <b>{formatCash(listing.price)}</b>
        <small>{fill(pick(COPY.upTo, locale), { amount: formatCash(maxHourly(listing.price)) })}</small>
      </span>
    </button>
  );
}