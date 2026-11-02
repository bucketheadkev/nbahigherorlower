'use client';

import { memo, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { FCard, FFailure, FState } from '@/lib/account/franchiseV5Cloud';
import { cardSlug } from '@/lib/tradeup/franchise/cards';
import { CARD_TIER_ORDER, POSITIONS, type Slot } from '@/lib/tradeup/franchise/config';
import { FC, SLOT_NAME, TIER_COLOR, TIER_NAME, tx } from '@/lib/tradeup/franchise/copy';
import { fmtCash, fmtCashDelta, fmtFans, fmtFansDelta } from '@/lib/tradeup/franchise/format';
import { fullPeriodPay, lineupCards, totalFans } from '@/lib/tradeup/franchise/pay';
import { playerView } from '@/lib/tradeup/franchise/players';
import { TeamJersey } from './ArenaParts';

function slotOf(state: FState, cardId: string): Slot | null {
  return POSITIONS.find((s) => state.lineup[s] === cardId) ?? null;
}

function TierChip({ card, locale }: { card: FCard; locale: string }) {
  return (
    <span className="fx-tier" style={{ '--tier': TIER_COLOR[card.tier] } as CSSProperties}>
      {tx(TIER_NAME[card.tier], locale)}
    </span>
  );
}

const PlayerRow = memo(function PlayerRow({
  card,
  locale,
  right,
  trailing,
  onClick,
}: {
  card: FCard;
  locale: string;
  right?: ReactNode;
  /** A separate action beside the row (never nested inside the row's own button). */
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const v = playerView(card.playerId);
  const body = (
    <>
      <span className="fx-row__jersey">
        <TeamJersey playerId={card.playerId} />
      </span>
      <span className="fx-row__copy">
        <strong>{v.name}</strong>
        <em>
          {v.teamName} · {v.era}
        </em>
        <TierChip card={card} locale={locale} />
      </span>
      <span className="fx-row__right">
        <span className="fx-row__fans">
          <strong>{fmtFans(card.fans)}</strong>
          <em>{tx(FC.fansWord, locale)}</em>
        </span>
        {right}
      </span>
    </>
  );
  return (
    <div className="fx-row">
      {onClick ? (
        <button type="button" className="fx-row__main" onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className="fx-row__main">{body}</div>
      )}
      {trailing ? <span className="fx-row__trail">{trailing}</span> : null}
    </div>
  );
});

/** Current vs new, then the two numbers that matter: fan change and paycheck change. */
function Compare({
  state,
  locale,
  slot,
  card,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  state: FState;
  locale: string;
  slot: Slot;
  card: FCard;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const current = lineupCards(state)[slot];
  const before = totalFans(state);
  const after = before - (current?.fans ?? 0) + card.fans;
  const fanDelta = after - before;
  const payDelta = fullPeriodPay(after, state.settings.payPpm) - fullPeriodPay(before, state.settings.payPpm);
  const tone = (n: number) => (n > 0 ? 'is-up' : n < 0 ? 'is-down' : '');
  return (
    <div className="fx-compare">
      <p className="fx-label fx-compare__slot">
        {slot} · {tx(SLOT_NAME[slot], locale)}
      </p>
      <div className="fx-compare__pair">
        <div className="fx-compare__side">
          <em>{tx(FC.currentPlayer, locale)}</em>
          {current ? (
            <>
              <span className="fx-compare__jersey">
                <TeamJersey playerId={current.playerId} />
              </span>
              <strong>{playerView(current.playerId).name}</strong>
              <span>
                {fmtFans(current.fans)} {tx(FC.fansWord, locale)}
              </span>
            </>
          ) : (
            <strong className="is-muted">{tx(FC.emptySlot, locale)}</strong>
          )}
        </div>
        <span className="fx-compare__arrow" aria-hidden>
          →
        </span>
        <div className="fx-compare__side is-new">
          <em>{tx(FC.newPlayer, locale)}</em>
          <span className="fx-compare__jersey">
            <TeamJersey playerId={card.playerId} />
          </span>
          <strong>{playerView(card.playerId).name}</strong>
          <span>
            {fmtFans(card.fans)} {tx(FC.fansWord, locale)}
          </span>
        </div>
      </div>
      <div className="fx-delta">
        <span className={`fx-delta__cell ${tone(fanDelta)}`}>
          <em>{tx(FC.fanIncrease, locale)}</em>
          <strong>{fmtFansDelta(fanDelta)}</strong>
        </span>
        <span className={`fx-delta__cell ${tone(payDelta)}`}>
          <em>{tx(FC.payIncrease, locale)}</em>
          <strong>
            {fmtCashDelta(payDelta)}
            <small> / 12H</small>
          </strong>
        </span>
      </div>
      {payDelta !== 0 ? (
        <p className={`fx-delta__verdict ${tone(payDelta)}`}>{payDelta > 0 ? tx(FC.improves, locale) : tx(FC.lowers, locale)}</p>
      ) : null}
      {error ? <p className="fx-note is-short">{error}</p> : null}
      <button type="button" className="fx-btn fx-btn--primary" disabled={busy} onClick={onConfirm}>
        {current ? tx(FC.confirmReplace, locale) : tx(FC.confirmAdd, locale)}
      </button>
      <button type="button" className="fx-link" onClick={onCancel}>
        {tx(FC.back, locale)}
      </button>
    </div>
  );
}

function useEscape(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, enabled]);
}

/**
 * Lineup changes. Start from a card (ADD TO LINEUP: pick one of his positions) or from a seat
 * (pick an eligible player from the collection). Nobody is replaced without the comparison.
 */
export function LineupSheet({
  state,
  locale,
  start,
  onSet,
  onClose,
}: {
  state: FState;
  locale: string;
  start: { cardId: string } | { slot: Slot };
  onSet: (slot: Slot, cardId: string) => Promise<FFailure | null>;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<{ slot: Slot; cardId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const five = lineupCards(state);
  useEscape(() => (choice ? setChoice(null) : !busy && onClose()));

  const startCard = 'cardId' in start ? state.cards.find((c) => c.id === start.cardId) ?? null : null;
  const startSlot = 'slot' in start ? start.slot : null;

  /** Another seat already has this person (a different version counts too). */
  const personElsewhere = (card: FCard, slot: Slot): Slot | null =>
    POSITIONS.find((s) => s !== slot && five[s] && five[s]!.id !== card.id && cardSlug(five[s]!.playerId) === cardSlug(card.playerId)) ?? null;

  const candidates = useMemo(() => {
    if (!startSlot) return [];
    return state.cards
      .filter((c) => playerView(c.playerId).eligible.includes(startSlot) && !slotOf(state, c.id))
      .sort((a, b) => b.fans - a.fans);
  }, [state, startSlot]);

  const confirm = async () => {
    if (!choice || busy) return;
    setBusy(true);
    setError(null);
    const failure = await onSet(choice.slot, choice.cardId);
    setBusy(false);
    if (failure) setError(failure === 'offline' ? tx(FC.offline, locale) : tx(FC.errorGeneric, locale));
    else onClose();
  };

  const chosenCard = choice ? state.cards.find((c) => c.id === choice.cardId) : null;

  return (
    <div className="fx-sheet-wrap" role="dialog" aria-modal="true">
      <button type="button" className="fx-scrim" aria-label={tx(FC.close, locale)} onClick={() => !busy && onClose()} />
      <div className="fx-sheet fx-lineup">
        {choice && chosenCard ? (
          <Compare
            state={state}
            locale={locale}
            slot={choice.slot}
            card={chosenCard}
            busy={busy}
            error={error}
            onConfirm={() => void confirm()}
            onCancel={() => setChoice(null)}
          />
        ) : startCard ? (
          <>
            <PlayerRow card={startCard} locale={locale} />
            <p className="fx-label fx-sheet__label">{tx(FC.choosePosition, locale)}</p>
            <div className="fx-slots">
              {POSITIONS.map((slot) => {
                const fits = playerView(startCard.playerId).eligible.includes(slot);
                const occupant = five[slot];
                const here = occupant?.id === startCard.id;
                const dup = fits && !here ? personElsewhere(startCard, slot) : null;
                const reason = !fits
                  ? tx(FC.notHisPosition, locale)
                  : here
                    ? tx(FC.startingHere, locale)
                    : dup
                      ? tx(FC.inLineupAt, locale, { slot: dup })
                      : null;
                return (
                  <button
                    key={slot}
                    type="button"
                    className="fx-slot"
                    disabled={reason != null}
                    onClick={() => setChoice({ slot, cardId: startCard.id })}
                  >
                    <strong>{slot}</strong>
                    {reason ? (
                      <em className="fx-slot__reason">{reason}</em>
                    ) : (
                      <>
                        <em>{occupant ? playerView(occupant.playerId).name : tx(FC.emptySlot, locale)}</em>
                        <span>{occupant ? fmtFans(occupant.fans) : '—'}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            <button type="button" className="fx-link" onClick={onClose}>
              {tx(FC.cancel, locale)}
            </button>
          </>
        ) : startSlot ? (
          <>
            <p className="fx-label fx-sheet__label">
              {startSlot} · {tx(SLOT_NAME[startSlot], locale)}
            </p>
            {five[startSlot] ? <PlayerRow card={five[startSlot]!} locale={locale} right={<small className="fx-badge">{tx(FC.startingHere, locale)}</small>} /> : null}
            <div className="fx-list">
              {candidates.map((c) => {
                const dup = personElsewhere(c, startSlot);
                const delta = c.fans - (five[startSlot]?.fans ?? 0);
                return (
                  <PlayerRow
                    key={c.id}
                    card={c}
                    locale={locale}
                    onClick={dup ? undefined : () => setChoice({ slot: startSlot, cardId: c.id })}
                    right={
                      dup ? (
                        <small className="fx-row__note">{tx(FC.inLineupAt, locale, { slot: dup })}</small>
                      ) : (
                        <small className={`fx-row__delta ${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}`}>{fmtFansDelta(delta)}</small>
                      )
                    }
                  />
                );
              })}
            </div>
            <button type="button" className="fx-link" onClick={onClose}>
              {tx(FC.close, locale)}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

type Sort = 'fans' | 'rarity';

export function CollectionSheet({
  state,
  locale,
  onPick,
  onSell,
  onClose,
}: {
  state: FState;
  locale: string;
  onPick: (cardId: string) => void;
  onSell: (cardId: string) => Promise<FFailure | null>;
  onClose: () => void;
}) {
  const [sort, setSort] = useState<Sort>('fans');
  const [selling, setSelling] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(() => (selling ? !busy && setSelling(null) : onClose()));
  const cards = useMemo(() => {
    const rank = (c: FCard) => CARD_TIER_ORDER.indexOf(c.tier);
    return [...state.cards].sort((a, b) => (sort === 'rarity' ? rank(b) - rank(a) || b.fans - a.fans : b.fans - a.fans));
  }, [state.cards, sort]);
  const copies = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of state.cards) n.set(c.playerId, (n.get(c.playerId) ?? 0) + 1);
    return n;
  }, [state.cards]);
  const salePrice = (card: FCard) => state.chests.find((c) => c.id === card.tier)?.price ?? 0;
  const sellCard = selling ? state.cards.find((c) => c.id === selling) ?? null : null;

  const confirmSale = async () => {
    if (!sellCard || busy) return;
    setBusy(true);
    setError(null);
    const failure = await onSell(sellCard.id);
    setBusy(false);
    if (failure) setError(failure === 'offline' ? tx(FC.offline, locale) : tx(FC.errorGeneric, locale));
    else setSelling(null);
  };

  return (
    <div className="fx-sheet-wrap" role="dialog" aria-modal="true" aria-label={tx(FC.collectionTitle, locale)}>
      <button type="button" className="fx-scrim" aria-label={tx(FC.close, locale)} onClick={() => !busy && onClose()} />
      <div className="fx-sheet fx-collection">
        <div className="fx-sheet__head">
          <h2 className="fx-sheet__title">
            {tx(FC.collectionTitle, locale)} <span>{state.cards.length}</span>
          </h2>
          <div className="fx-seg fx-seg--sm" role="radiogroup">
            {(['fans', 'rarity'] as Sort[]).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={sort === s} className={sort === s ? 'is-on' : ''} onClick={() => setSort(s)}>
                {s === 'fans' ? tx(FC.sortFans, locale) : tx(FC.sortRarity, locale)}
              </button>
            ))}
          </div>
        </div>
        <div className="fx-list">
          {cards.map((c) => {
            const slot = slotOf(state, c.id);
            const sellable = !slot && (copies.get(c.playerId) ?? 0) > 1 && salePrice(c) > 0;
            return (
              <PlayerRow
                key={c.id}
                card={c}
                locale={locale}
                onClick={slot ? undefined : () => onPick(c.id)}
                right={slot ? <small className="fx-badge">{tx(FC.starting, locale, { slot })}</small> : <small className="fx-row__add">+</small>}
                trailing={
                  sellable ? (
                    <button
                      type="button"
                      className="fx-sell"
                      onClick={() => {
                        setError(null);
                        setSelling(c.id);
                      }}
                    >
                      <em>{tx(FC.sell, locale)}</em>
                      <strong>{fmtCash(salePrice(c))}</strong>
                    </button>
                  ) : undefined
                }
              />
            );
          })}
        </div>
        <button type="button" className="fx-link" onClick={onClose}>
          {tx(FC.close, locale)}
        </button>
        {sellCard ? (
          <div className="fx-confirm" role="alertdialog" aria-label={tx(FC.sellTitle, locale, { name: playerView(sellCard.playerId).name })}>
            <p className="fx-confirm__title">{tx(FC.sellTitle, locale, { name: playerView(sellCard.playerId).name })}</p>
            <p className="fx-confirm__note">{tx(FC.sellNote, locale, { tier: tx(TIER_NAME[sellCard.tier], locale) })}</p>
            {error ? <p className="fx-note is-short">{error}</p> : null}
            <div className="fx-confirm__actions">
              <button type="button" className="fx-btn fx-btn--ghost fx-btn--small" disabled={busy} onClick={() => setSelling(null)}>
                {tx(FC.cancel, locale)}
              </button>
              <button type="button" className="fx-btn fx-btn--money fx-btn--small" disabled={busy} onClick={() => void confirmSale()}>
                {tx(FC.sellConfirm, locale, { amount: fmtCash(salePrice(sellCard)) })}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
