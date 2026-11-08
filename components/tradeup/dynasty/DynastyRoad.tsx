'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAccountAuth } from '@/hooks/useAccountAuth';
import { dynastyAccountKey, useDynasty } from '@/hooks/useDynasty';
import { useLocale } from '@/hooks/useLocale';
import type { DynastyChest, DynastyPendingRun, DynastyState } from '@/lib/account/dynastyCloud';
import { keyShopConfigured, syncPendingKeyPurchases } from '@/lib/purchases/keyPurchases';
import { formatCash } from '@/lib/tradeup/bank';
import {
  DYNASTY_COLLECTIONS,
  DYNASTY_SLOT_COUNT,
  inClassicPool,
  type DynastyCollection,
} from '@/lib/tradeup/dynasty/catalog';
import { dc } from '@/lib/tradeup/dynasty/copy';
import { hapticLight } from '@/lib/tradeup/haptics';
import { DynastyChestOpening } from './DynastyChestOpening';
import { DynastyChests } from './DynastyChests';
import { DynastyCollection as CollectionList } from './DynastyCollection';
import { FocusBanner, FocusPicker } from './DynastyFocus';
import { DynastyJersey, splitName } from './DynastyJersey';
import { Check, DynastySignOffer, Pips } from './DynastySignOffer';
import { KeyShop } from './KeyShop';

const SEEN_KEY = 'oneb_dynasty_seen_complete_v1';
const CHAMPIONSHIPS = DYNASTY_COLLECTIONS.filter((c) => c.kind === 'championship');
const TOTAL_SLOTS = CHAMPIONSHIPS.length * DYNASTY_SLOT_COUNT;

type Tab = 'chests' | 'road' | 'collection';

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Dynasty Road: My Chests, the championship ladder, and My Collection. */
export function DynastyRoad({ open, onClose, onSignIn }: { open: boolean; onClose: () => void; onSignIn: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.dyn-sheet, .dyn-open-root')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!mounted || !open) return null;
  return createPortal(<Road onClose={onClose} onSignIn={onSignIn} />, document.body);
}

function Road({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) {
  const { locale } = useLocale();
  const { state: account } = useAccountAuth();
  const accountKey = dynastyAccountKey(account);
  const dynasty = useDynasty(accountKey);
  const [tab, setTab] = useState<Tab>('road');
  const [sheetRun, setSheetRun] = useState<DynastyPendingRun | null>(null);
  const [opening, setOpening] = useState<DynastyChest | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Fresh numbers every time the road opens (another device may have signed or opened something).
  const { refresh } = dynasty;
  useEffect(() => {
    refresh();
  }, [refresh]);

  const shopAvailable = useMemo(
    () => account.status === 'permanent' && accountKey === account.user.id && keyShopConfigured(),
    [account, accountKey],
  );
  // Paid-but-unconfirmed purchases (app closed mid-purchase) are confirmed here, once per open.
  useEffect(() => {
    if (!shopAvailable) return;
    void syncPendingKeyPurchases().then((n) => {
      if (n > 0) refresh();
    });
  }, [shopAvailable, refresh]);

  // A completion animates once, the first time it's seen here; after that it simply stays lit.
  const [seen] = useState(readSeen);
  const state = dynasty.state;
  useEffect(() => {
    if (!state || state.completed.length === 0) return;
    const next = new Set(seen);
    state.completed.forEach((c) => next.add(c.collectionId));
    localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
  }, [seen, state]);

  // Land on My Chests when a chest is ready to open.
  const tabChosen = useRef(false);
  useEffect(() => {
    if (!state || tabChosen.current) return;
    tabChosen.current = true;
    if (state.chestsEnabled && state.chests.some((c) => c.status === 'ready')) setTab('chests');
  }, [state]);

  const owned = useMemo(() => new Set((state?.owned ?? []).map((o) => `${o.collectionId}:${o.playerId}`)), [state]);
  const signedCount = CHAMPIONSHIPS.reduce((n, c) => n + c.slots.filter((s) => owned.has(`${c.id}:${s.playerId}`)).length, 0);
  const completed = new Map((state?.completed ?? []).map((c) => [c.collectionId, c.completedAt]));
  const guest = accountKey == null;
  const readyCount = state?.chests.filter((c) => c.status === 'ready').length ?? 0;

  const choose = (next: Tab) => {
    if (next === tab) return;
    hapticLight();
    setTab(next);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'chests', label: dc('tabChests', locale), badge: readyCount },
    { id: 'road', label: dc('tabRoad', locale) },
    { id: 'collection', label: dc('tabCollection', locale) },
  ];

  return (
    <div className="dyn-root" role="dialog" aria-modal="true" aria-label={dc('title', locale)}>
      <div className="dyn-bg" aria-hidden />
      <header className="dyn-top">
        <button
          type="button"
          className="dyn-back"
          aria-label={dc('back', locale)}
          onClick={() => {
            hapticLight();
            onClose();
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
            <path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="dyn-top__title">{dc('title', locale)}</h1>
        <span className="dyn-top__spacer" aria-hidden />
      </header>

      <nav className="dyn-tabs" aria-label={dc('title', locale)}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`dyn-tabs__btn${tab === t.id ? ' is-active' : ''}`}
            aria-pressed={tab === t.id}
            onClick={() => choose(t.id)}
          >
            {t.label}
            {t.badge ? <span className="dyn-tabs__badge">{t.badge}</span> : null}
          </button>
        ))}
      </nav>

      <div className="dyn-scroll" ref={scrollRef}>
        {guest ? (
          <section className="dyn-panel dyn-panel--guest">
            <strong>{dc('guestTitle', locale)}</strong>
            <p>{dc('guestLine', locale)}</p>
            <button type="button" className="dyn-btn dyn-btn--primary" onClick={onSignIn}>
              {dc('guestCta', locale)}
            </button>
          </section>
        ) : dynasty.status === 'error' && !state ? (
          <section className="dyn-panel" role="status">
            <p>{dynasty.failure === 'unavailable' ? dc('unavailable', locale) : dc('loadFailed', locale)}</p>
            <button type="button" className="dyn-btn dyn-btn--ghost" onClick={dynasty.refresh}>
              {dc('retry', locale)}
            </button>
          </section>
        ) : !state ? (
          <p className="dyn-loading" role="status">
            {dc('loading', locale)}
          </p>
        ) : null}

        {tab === 'chests' && state ? (
          state.chestsEnabled ? (
            <DynastyChests
              state={state}
              locale={locale}
              shopAvailable={shopAvailable}
              startUnlock={dynasty.startUnlock}
              spendKey={dynasty.spendKey}
              onOpen={setOpening}
              onShop={() => setShopOpen(true)}
              refresh={dynasty.refresh}
            />
          ) : (
            <section className="dyn-panel">
              <p>{dc('chestsUnavailable', locale)}</p>
            </section>
          )
        ) : null}
        {tab === 'chests' && guest ? <p className="dyn-hero__intro dyn-guest-note">{dc('chestsGuest', locale)}</p> : null}

        {tab === 'road' ? (
          <>
            <section className="dyn-hero">
              <p className="dyn-hero__kicker">{dc('kicker', locale)}</p>
              <p className="dyn-hero__count">
                <strong>{guest ? 0 : signedCount}</strong>
                <span>/{TOTAL_SLOTS}</span>
              </p>
              <p className="dyn-hero__sub">
                {dc('signed', locale, { n: guest ? 0 : signedCount, total: TOTAL_SLOTS })}
                <span aria-hidden> · </span>
                {dc('dynasties', locale, { n: completed.size, total: CHAMPIONSHIPS.length })}
              </p>
              <span className="dyn-hero__bar" aria-hidden>
                <span style={{ transform: `scaleX(${guest ? 0 : signedCount / TOTAL_SLOTS})` }} />
              </span>
              <p className="dyn-hero__intro">{dc('intro', locale)}</p>
            </section>

            {state?.pending.length ? (
              <section className="dyn-pending">
                {state.pending.slice(0, 3).map((run) => (
                  <button
                    key={run.clientRunId}
                    type="button"
                    className="dyn-pending__run"
                    onClick={() => {
                      hapticLight();
                      setSheetRun(run);
                    }}
                  >
                    <span className="dyn-pending__dot" aria-hidden />
                    <span className="dyn-pending__copy">
                      <strong>{dc('pendingTitle', locale)}</strong>
                      <em>{dc('pendingLine', locale, { value: formatCash(run.verifiedValue) })}</em>
                    </span>
                    <svg viewBox="0 0 8 12" width="8" height="12" fill="none" aria-hidden>
                      <path d="M2 1.75 6.25 6 2 10.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </section>
            ) : null}

            {state?.chestsEnabled ? (
              <FocusBanner
                state={state}
                locale={locale}
                onChange={() => {
                  hapticLight();
                  setFocusOpen(true);
                }}
              />
            ) : null}

            <ol className="dyn-road">
              {DYNASTY_COLLECTIONS.map((c) =>
                c.kind === 'final' ? (
                  <FinalCard key={c.id} collection={c} locale={locale} />
                ) : (
                  <CollectionCard
                    key={c.id}
                    collection={c}
                    owned={owned}
                    completedAt={completed.get(c.id) ?? null}
                    animate={completed.has(c.id) && !seen.has(c.id)}
                    focused={state?.focusCollectionId === c.id}
                    locale={locale}
                  />
                ),
              )}
            </ol>
          </>
        ) : null}

        {tab === 'collection' && state ? <CollectionList state={state} locale={locale} /> : null}
      </div>

      {sheetRun && state ? <PendingSheet run={sheetRun} state={state} onClose={() => setSheetRun(null)} locale={locale} /> : null}
      {focusOpen && state ? (
        <FocusPicker state={state} locale={locale} setFocus={dynasty.setFocus} onClose={() => setFocusOpen(false)} />
      ) : null}
      {shopOpen && state && account.status === 'permanent' && shopAvailable ? (
        <KeyShop
          accountId={account.user.id}
          keys={state.keys}
          locale={locale}
          onBought={dynasty.refresh}
          onClose={() => setShopOpen(false)}
        />
      ) : null}
      {opening && state ? (
        <DynastyChestOpening
          chestId={opening.id}
          tier={opening.tier}
          locale={locale}
          dupProtectionAfter={state.chestRules.dupProtectionAfter}
          open={dynasty.open}
          onClose={() => setOpening(null)}
        />
      ) : null}
    </div>
  );
}

function cardVars(c: DynastyCollection): CSSProperties {
  return {
    '--dyn-primary': c.colors.primary,
    '--dyn-accent': c.colors.accent,
    '--dyn-deep': c.colors.deep,
  } as CSSProperties;
}

function CollectionCard({
  collection: c,
  owned,
  completedAt,
  animate,
  focused,
  locale,
}: {
  collection: DynastyCollection;
  owned: Set<string>;
  completedAt: string | null;
  animate: boolean;
  focused: boolean;
  locale: string;
}) {
  const have = c.slots.filter((s) => owned.has(`${c.id}:${s.playerId}`)).length;
  const complete = completedAt != null;
  return (
    <li
      className={`dyn-card${complete ? ' is-complete' : ''}${animate ? ' is-fresh' : ''}${focused ? ' is-focus' : ''}`}
      style={cardVars(c)}
    >
      <span className="dyn-card__node" aria-hidden>
        {complete ? <Check /> : c.order}
      </span>
      <article className="dyn-card__body" aria-label={`${c.season} ${c.team}: ${have}/5`}>
        <header className="dyn-card__head">
          <div className="dyn-card__id">
            <span className="dyn-card__year">
              {c.season}
              {focused ? <span className="dyn-card__focus">{dc('focusTag', locale)}</span> : null}
            </span>
            <h2 className="dyn-card__team">{c.team}</h2>
            <span className="dyn-card__game">{c.clincher}</span>
          </div>
          <div className="dyn-card__count">
            <strong>{have}</strong>
            <span>/5</span>
          </div>
        </header>
        <Pips have={have} />
        <ul className="dyn-card__five">
          {c.slots.map((s) => {
            const mine = owned.has(`${c.id}:${s.playerId}`);
            const [first, last] = splitName(s.name);
            const dealt = mine || inClassicPool(s.playerId);
            return (
              <li key={s.playerId} className={`dyn-slot${mine ? ' is-owned' : ' is-missing'}`}>
                <DynastyJersey name={s.name} colors={c.colors} look={mine ? 'owned' : 'missing'} className="dyn-slot__jersey" />
                <span className="dyn-slot__pos">{s.position}</span>
                <span className="dyn-slot__name">
                  <em>{first}</em>
                  <strong>{last}</strong>
                </span>
                {!dealt ? <span className="dyn-slot__note">{dc('notInClassic', locale)}</span> : null}
                <span className="dyn-sr">{mine ? '' : dc('missing', locale)}</span>
              </li>
            );
          })}
        </ul>
        {complete ? (
          <p className="dyn-card__done">
            <Check />
            {dc('complete', locale)}
            <span>{dc('completedOn', locale, { date: new Date(completedAt).toLocaleDateString(locale === 'es' ? 'es' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) })}</span>
          </p>
        ) : null}
      </article>
    </li>
  );
}

function FinalCard({ collection: c, locale }: { collection: DynastyCollection; locale: string }) {
  return (
    <li className="dyn-card dyn-card--final" style={cardVars(c)}>
      <span className="dyn-card__node" aria-hidden>
        {c.order}
      </span>
      <article className="dyn-card__body">
        <header className="dyn-card__head">
          <div className="dyn-card__id">
            <span className="dyn-card__year">{dc('finalKicker', locale)}</span>
            <h2 className="dyn-card__team">{c.team}</h2>
            <span className="dyn-card__game">{dc('finalLine', locale)}</span>
          </div>
          <span className="dyn-card__seal">{dc('sealed', locale)}</span>
        </header>
        <ul className="dyn-card__five">
          {Array.from({ length: DYNASTY_SLOT_COUNT }, (_, i) => (
            <li key={i} className="dyn-slot is-sealed">
              <DynastyJersey name="?" colors={c.colors} look="sealed" className="dyn-slot__jersey" />
            </li>
          ))}
        </ul>
      </article>
    </li>
  );
}

function PendingSheet({
  run,
  state,
  onClose,
  locale,
}: {
  run: DynastyPendingRun;
  state: DynastyState;
  onClose: () => void;
  locale: string;
}) {
  const lineup = useMemo(() => [...new Set(run.options.map((o) => o.playerId))], [run]);
  const stillPending = state.pending.some((p) => p.clientRunId === run.clientRunId);
  return (
    <div className="dyn-sheet" role="dialog" aria-modal="true" aria-label={dc('pendingTitle', locale)}>
      <button type="button" className="dyn-sheet__scrim" aria-label={dc('close', locale)} onClick={onClose} />
      <section className="dyn-sheet__panel">
        <span className="dyn-sheet__grip" aria-hidden />
        <header className="dyn-sheet__head">
          <div>
            <span className="dyn-offer__kicker">{dc('pendingTitle', locale)}</span>
            <strong className="dyn-sheet__value">{formatCash(run.verifiedValue)}</strong>
          </div>
          <button type="button" className="dyn-sheet__close" aria-label={dc('close', locale)} onClick={onClose}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <DynastySignOffer clientRunId={run.clientRunId} lineup={lineup} runValue={run.verifiedValue} verify="ok" context="road" />
        {!stillPending ? (
          <button type="button" className="dyn-btn dyn-btn--ghost dyn-sheet__done" onClick={onClose}>
            {dc('close', locale)}
          </button>
        ) : null}
      </section>
    </div>
  );
}
