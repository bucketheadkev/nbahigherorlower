'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '@/hooks/useLocale';
import { isFranchisePreview } from '@/lib/account/franchisePreview';
import {
  buyFranchiseV5,
  fetchFranchiseState,
  markChestRevealed,
  markFranchiseIntro,
  newRequestId,
  openChest,
  sellDuplicateCard,
  setLineupSlot,
  type FFailure,
  type FOpen,
  type FState,
} from '@/lib/account/franchiseV5Cloud';
import { BANK_CHANGED_EVENT } from '@/lib/tradeup/bank';
import { CHESTS, SHOP_CHESTS, PAYCHECK, type ChestId, type Slot } from '@/lib/tradeup/franchise/config';
import { FC, tx } from '@/lib/tradeup/franchise/copy';
import { fmtCash } from '@/lib/tradeup/franchise/format';
import { introSeenLocally, markIntroSeenLocally } from '@/lib/tradeup/franchise/introSeen';
import { CHAMPIONSHIPS, compareFranchises, franchisePrice, RESALE } from '@/lib/tradeup/ownership/config';
import { TEAMS } from '@/lib/tradeup/teams';
import { ArenaBackdrop } from './ArenaParts';
import { ChestOpening } from './ChestOpening';
import { ChestShop } from './ChestShop';
import { BackButton } from './FranchiseChrome';
import { FranchiseHome } from './FranchiseHome';
import { FranchiseIntro } from './FranchiseIntro';
import { FranchiseSelect } from './FranchiseSelect';
import { CollectionSheet, LineupSheet } from './LineupSheets';

type View = 'loading' | 'problem' | 'intro' | 'select' | 'home' | 'opening' | 'shop';

const bankChanged = () => window.dispatchEvent(new Event(BANK_CHANGED_EVENT));

/** What a guest can browse before signing in: the catalog and their Bank, nothing owned. */
function guestState(bank: number): FState {
  return {
    clockOffset: 0,
    settings: { payPeriodHours: PAYCHECK.periodHours, payPpm: PAYCHECK.payPpm, resaleBps: RESALE.refundBps },
    bank,
    profile: { introSeen: false, starterClaimed: false },
    owned: null,
    pay: null,
    lineup: {},
    cards: [],
    pending: [],
    chests: SHOP_CHESTS.map((id) => ({
      id,
      price: CHESTS[id].price,
      picks: CHESTS[id].picks,
      guarantee: CHESTS[id].guarantee,
      odds: CHESTS[id].odds.map((o) => ({ tier: o.tier, bps: o.bps, minScoreBp: Math.round((o.minScore ?? 0) * 10_000) })),
    })),
    franchises: TEAMS.map((t) => ({ teamId: t.id, name: t.fullName, championships: CHAMPIONSHIPS[t.id] ?? 0 }))
      .sort(compareFranchises)
      .map((t) => ({ ...t, price: franchisePrice(t.teamId) })),
    paidNow: 0,
  };
}

function Mode({
  permanent,
  userId,
  guestBank,
  onClose,
  onSignIn,
  onPlayClassic,
}: {
  permanent: boolean;
  userId: string | null;
  guestBank: number;
  onClose: () => void;
  onSignIn: () => void;
  onPlayClassic: () => void;
}) {
  const { locale } = useLocale();
  const preview = isFranchisePreview();
  const needsAccount = !permanent && !preview;
  const account = preview ? 'preview' : (userId ?? 'guest');
  const [state, setState] = useState<FState | null>(() => (needsAccount ? guestState(guestBank) : null));
  const [view, setView] = useState<View>(() =>
    needsAccount ? (introSeenLocally('guest') ? 'select' : 'intro') : 'loading',
  );
  const [problem, setProblem] = useState<FFailure | null>(null);
  const [opening, setOpening] = useState<FOpen | null>(null);
  const [reviewIntro, setReviewIntro] = useState(false);
  const [collection, setCollection] = useState(false);
  const [sheet, setSheet] = useState<{ cardId: string } | { slot: Slot } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** One id per intended purchase, reused if the network drops and the tap is retried. */
  const requests = useRef<Partial<Record<ChestId, string>>>({});
  const loading = useRef(false);

  const accept = useCallback(
    (next: FState) => {
      setState(next);
      if (next.paidNow > 0) {
        setToast(tx(FC.paidToast, locale, { amount: fmtCash(next.paidNow) }));
        bankChanged();
      }
    },
    [locale],
  );

  // An unfinished opening first; owners go home (never back to the intro); everyone else sees
  // the intro exactly once, then team selection.
  const route = useCallback(
    (next: FState) => {
      if (next.pending.length > 0) {
        setOpening(next.pending[0]!);
        setView('opening');
        return;
      }
      if (next.owned) {
        if (!next.profile.introSeen) void markFranchiseIntro();
        markIntroSeenLocally(account);
        setView('home');
        return;
      }
      const seen = next.profile.introSeen || introSeenLocally(account);
      if (seen && !next.profile.introSeen) void markFranchiseIntro();
      setView(seen ? 'select' : 'intro');
    },
    [account],
  );

  const load = useCallback(
    async (andRoute: boolean) => {
      if (loading.current || needsAccount) return;
      loading.current = true;
      const res = await fetchFranchiseState();
      loading.current = false;
      if (res.ok === false) {
        if (andRoute) {
          setProblem(res.reason);
          setView('problem');
        }
        return;
      }
      accept(res.data);
      if (andRoute) route(res.data);
    },
    [accept, needsAccount, route],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const startStarter = useCallback(async (): Promise<FFailure | null> => {
    const request = (requests.current.starter ??= newRequestId());
    const res = await openChest('starter', request);
    if (res.ok === false) {
      if (res.reason === 'starter_claimed') await load(true);
      return res.reason;
    }
    delete requests.current.starter;
    accept(res.data.state);
    setOpening(res.data.open);
    setView('opening');
    return null;
  }, [accept, load]);

  const buy = useCallback(
    async (teamId: string): Promise<FFailure | null> => {
      const res = await buyFranchiseV5(teamId);
      if (res.ok === false) return res.reason;
      accept(res.data);
      bankChanged();
      if (!res.data.profile.starterClaimed) {
        const failure = await startStarter();
        if (failure && failure !== 'starter_claimed') setView('home');
      } else {
        setView('home');
      }
      return null;
    },
    [accept, startStarter],
  );

  const buyChest = useCallback(
    async (chest: ChestId): Promise<FFailure | null> => {
      const request = (requests.current[chest] ??= newRequestId());
      const res = await openChest(chest, request);
      if (res.ok === false) {
        if (res.reason !== 'offline') delete requests.current[chest];
        return res.reason;
      }
      delete requests.current[chest];
      accept(res.data.state);
      bankChanged();
      setOpening(res.data.open);
      setView('opening');
      return null;
    },
    [accept],
  );

  const finishOpening = useCallback(
    async (then?: { cardId: string }) => {
      const open = opening;
      setOpening(null);
      setView('home');
      if (then) setSheet(then);
      if (!open) return;
      const res = await markChestRevealed(open.id);
      if (res.ok) accept(res.data);
    },
    [accept, opening],
  );

  const setSeat = useCallback(
    async (slot: Slot, cardId: string): Promise<FFailure | null> => {
      const res = await setLineupSlot(slot, cardId);
      if (res.ok === false) return res.reason;
      accept(res.data);
      return null;
    },
    [accept],
  );

  const sellCard = useCallback(
    async (cardId: string): Promise<FFailure | null> => {
      const res = await sellDuplicateCard(cardId);
      if (res.ok === false) return res.reason;
      accept(res.data.state);
      if (res.data.sold > 0) {
        setToast(tx(FC.soldToast, locale, { amount: fmtCash(res.data.sold) }));
        bankChanged();
      }
      return null;
    },
    [accept, locale],
  );

  const gotIt = () => {
    markIntroSeenLocally(account);
    if (!needsAccount) void markFranchiseIntro();
    setState((s) => (s ? { ...s, profile: { ...s.profile, introSeen: true } } : s));
    setView('select');
  };

  if (view === 'intro') {
    return <FranchiseIntro locale={locale} onGotIt={gotIt} onClose={onClose} />;
  }

  if (view === 'loading' || !state) {
    return (
      <div className="fx-screen fx-center">
        <ArenaBackdrop />
        <div className="fx-topbar fx-center__bar">
          <BackButton label={tx(FC.close, locale)} onClick={onClose} />
        </div>
        {view === 'problem' ? (
          <div className="fx-problem">
            <p>{problem === 'unavailable' ? tx(FC.unavailable, locale) : problem === 'offline' ? tx(FC.offline, locale) : tx(FC.errorGeneric, locale)}</p>
            {problem !== 'unavailable' ? (
              <button type="button" className="fx-btn fx-btn--primary" onClick={() => void load(true)}>
                {tx(FC.retry, locale)}
              </button>
            ) : null}
          </div>
        ) : (
          <span className="fx-spinner" aria-label="Loading" />
        )}
      </div>
    );
  }

  return (
    <>
      {view === 'select' ? (
        <FranchiseSelect
          state={state}
          locale={locale}
          guest={needsAccount}
          onBack={() => (state.owned ? setView('home') : onClose())}
          onBuy={buy}
          onGoHome={() => setView('home')}
          onSignIn={onSignIn}
        />
      ) : null}

      {view === 'home' && state.owned ? (
        <FranchiseHome
          state={state}
          locale={locale}
          toast={toast}
          onClose={onClose}
          onInfo={() => setReviewIntro(true)}
          onSwitch={() => setView('select')}
          onShop={() => setView('shop')}
          onCollection={() => setCollection(true)}
          onSeat={(slot) => setSheet({ slot })}
          onStarter={() => void startStarter()}
          onDue={() => void load(false)}
        />
      ) : null}

      {view === 'shop' ? (
        <ChestShop state={state} locale={locale} onBack={() => setView('home')} onBuy={buyChest} onPlayClassic={onPlayClassic} />
      ) : null}

      {view === 'opening' && opening ? (
        <ChestOpening
          key={opening.id}
          open={opening}
          locale={locale}
          copiesOf={(playerId) => state.cards.filter((c) => c.playerId === playerId).length}
          salePriceOf={(tier) => state.chests.find((c) => c.id === tier)?.price ?? 0}
          onDone={() => void finishOpening()}
          onKeep={() => void finishOpening()}
          onAdd={(card) => void finishOpening({ cardId: card.cardId })}
        />
      ) : null}

      {collection && view === 'home' ? (
        <CollectionSheet
          state={state}
          locale={locale}
          onClose={() => setCollection(false)}
          onPick={(cardId) => {
            setCollection(false);
            setSheet({ cardId });
          }}
          onSell={sellCard}
        />
      ) : null}

      {sheet && view === 'home' ? (
        <LineupSheet key={JSON.stringify(sheet)} state={state} locale={locale} start={sheet} onSet={setSeat} onClose={() => setSheet(null)} />
      ) : null}

      {reviewIntro ? (
        <div className="fx-layer">
          <FranchiseIntro locale={locale} onGotIt={() => setReviewIntro(false)} onClose={() => setReviewIntro(false)} />
        </div>
      ) : null}
    </>
  );
}

/** Franchises: own a team, open chests, build your five, get paid every 12 hours. */
export function FranchiseMode({
  open,
  permanent,
  userId,
  guestBank,
  onClose,
  onSignIn,
  onPlayClassic,
}: {
  open: boolean;
  permanent: boolean;
  userId: string | null;
  /** The Bank shown to guests while they browse (they buy after creating an account). */
  guestBank: number;
  onClose: () => void;
  onSignIn: () => void;
  onPlayClassic: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.fx-sheet-wrap')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="fx-root">
      <Mode permanent={permanent} userId={userId} guestBank={guestBank} onClose={onClose} onSignIn={onSignIn} onPlayClassic={onPlayClassic} />
    </div>,
    document.body,
  );
}
